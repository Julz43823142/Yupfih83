import {createAuth} from '../../lib/auth/config.mjs';
import {readJsonPayload} from '../../lib/server-request-guard.js';
import {consumeGameStart} from '../../lib/game-capacity.js';
import {checkProfanity} from 'glin-profanity';
import {isReservedIdentity} from '../../lib/identity.mjs';
import {ensureModerationTable} from '../../lib/leaderboard-moderation.mjs';
// Hourly community rankings. Only voluntary nicknames and scores are stored.
// No IP addresses, Chess.com usernames, cookies, or player reports in D1.
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY"};
const json=(data,status=200)=>Response.json(data,{status,headers});
const hour=()=>Math.floor(Date.now()/3600000);
const validMode=m=>["sprint","sprint3","sprint5","survival"].includes(m);
const schemas=new WeakMap();
async function dbReady(db){
 if(schemas.has(db))return schemas.get(db);
 const schemaPromise=(async()=>{
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_hourly_scores (hour INTEGER NOT NULL, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(hour,mode,nickname))").run();
 // Preserve historical nickname entries as anonymous; only authenticated submissions become account entries.
 const columns=await db.prepare("PRAGMA table_info(puzzle_hourly_scores)").all();
 const existing=new Set((columns.results||[]).map(row=>row.name));
 if(!existing.has('source_type')){try{await db.prepare("ALTER TABLE puzzle_hourly_scores ADD COLUMN source_type TEXT NOT NULL DEFAULT 'nickname'").run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
 if(!existing.has('account_id')){try{await db.prepare("ALTER TABLE puzzle_hourly_scores ADD COLUMN account_id TEXT").run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_hourly_rank ON puzzle_hourly_scores(hour,mode,score DESC,created_at ASC)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, hour INTEGER NOT NULL, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, source_type TEXT NOT NULL, account_id TEXT, legacy_key TEXT UNIQUE)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_entries_rank ON puzzle_score_entries(mode,score DESC,created_at ASC)").run();
 await ensureModerationTable(db);
 await db.prepare("INSERT OR IGNORE INTO puzzle_score_entries(hour,mode,nickname,score,created_at,source_type,account_id,legacy_key) SELECT hour,mode,nickname,score,created_at,source_type,account_id,'legacy:'||hour||':'||mode||':'||lower(nickname) FROM puzzle_hourly_scores").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_verified_runs (id TEXT PRIMARY KEY,mode TEXT NOT NULL,started_at INTEGER NOT NULL,score INTEGER NOT NULL DEFAULT 0,submitted INTEGER NOT NULL DEFAULT 0)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_verified_solves (run_id TEXT NOT NULL,puzzle_id TEXT NOT NULL,PRIMARY KEY(run_id,puzzle_id))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_verified_runs_expiry ON puzzle_verified_runs(started_at)").run();
 // A proof and its score increment are one SQLite statement/transaction. A
 // concurrent submit cannot see a proof without its corresponding score.
 await db.prepare(`CREATE TRIGGER IF NOT EXISTS puzzle_verified_score_insert
   AFTER INSERT ON puzzle_verified_solves BEGIN
     UPDATE puzzle_verified_runs SET score=score+1 WHERE id=NEW.run_id;
   END`).run();
 })().catch(error=>{schemas.delete(db);throw error});
 schemas.set(db,schemaPromise);
 return schemaPromise;
}
async function cleanExpiredRuns(db,now){
 // Survival is the longest run (24h plus 60s to submit). Bounded, indexed
 // cleanup leaves active games and public rankings intact. Never cascade a
 // large number of solves in one request or leave newly orphaned solves.
 const cutoff=now-86460000;
 await db.prepare(`DELETE FROM puzzle_verified_solves WHERE rowid IN (
   SELECT s.rowid FROM puzzle_verified_runs r JOIN puzzle_verified_solves s ON s.run_id=r.id
   WHERE r.started_at<? ORDER BY r.started_at LIMIT 500
 )`).bind(cutoff).run();
 await db.prepare(`DELETE FROM puzzle_verified_runs WHERE id IN (
   SELECT r.id FROM puzzle_verified_runs r WHERE r.started_at<?
   AND NOT EXISTS (SELECT 1 FROM puzzle_verified_solves s WHERE s.run_id=r.id) LIMIT 100
 )`).bind(cutoff).run();
}
// Verified score entries are retained individually for both ranking views.
let bankCache=null;
async function puzzleBank(env,request){
 if(!bankCache){
  if(!env.ASSETS)throw Error('Puzzle validation assets unavailable');
  const url=new URL('/assets/puzzle-bank.json',request.url);
  bankCache=env.ASSETS.fetch(new Request(url)).then(async r=>{if(!r.ok)throw Error('Puzzle bank unavailable');return new Map((await r.json()).map(row=>[String(row[0]),String(row[2]).trim().toLowerCase().split(/\s+/).slice(1).join(' ')]))}).catch(e=>{bankCache=null;throw e});
 }
 return bankCache;
}
// Shard-aware verification: validate the exact public CC0 solution in the
// same 1000-row shard served to the browser. Never trust a self-reported score.
let manifestCache=null;
const verifiedShardCache=new Map();
async function verifiedShard(env,request,shardId){
 if(!Number.isInteger(shardId)||shardId<1||shardId>5000)throw Error('Invalid puzzle shard');
 if(!env.ASSETS)throw Error('Puzzle validation assets unavailable');
 if(!manifestCache){
  const url=new URL('/assets/puzzle-pool/manifest.json',request.url);
  manifestCache=env.ASSETS.fetch(new Request(url)).then(async response=>{
   if(!response.ok)throw Error('Puzzle manifest unavailable');
   const data=await response.json();
   if(data.version!==1||data.total!==500000||!Array.isArray(data.shards))throw Error('Invalid puzzle manifest');
   return new Set(data.shards.map(row=>row.id));
  }).catch(error=>{manifestCache=null;throw error});
 }
 const ids=await manifestCache;
 if(!ids.has(shardId))throw Error('Unknown puzzle shard');
 if(!verifiedShardCache.has(shardId)){
  const url=new URL('/assets/puzzle-pool/'+String(shardId).padStart(4,'0')+'.json',request.url);
  const promise=env.ASSETS.fetch(new Request(url)).then(async response=>{
   if(!response.ok)throw Error('Puzzle shard unavailable');
   const rows=await response.json();
   if(!Array.isArray(rows)||rows.length>1100)throw Error('Invalid puzzle shard');
   return new Map(rows.map(row=>[String(row[0]),String(row[2]).trim().toLowerCase().split(/\s+/).slice(1).join(' ')]));
  }).catch(error=>{verifiedShardCache.delete(shardId);throw error});
  verifiedShardCache.set(shardId,promise);
  if(verifiedShardCache.size>12)verifiedShardCache.delete(verifiedShardCache.keys().next().value);
 }
 return verifiedShardCache.get(shardId);
}
export async function onRequestGet({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:"Leaderboard database not configured."},503);
 const url=new URL(request.url),mode=url.searchParams.get("mode")||"sprint5";
 if(!validMode(mode))return json({error:"Invalid mode"},400);
 const requestedLimit=Number(url.searchParams.get("limit"));const limit=[10,50,100].includes(requestedLimit)?requestedLimit:10;
 try{
  await dbReady(db);
  const current=hour();
  const sprint=mode==="sprint";
  const where=sprint?"mode IN ('sprint3','sprint5')":"mode=?";
  const unique=url.searchParams.get('filter')==='unique';
  const base=`SELECT nickname,score,source_type,account_id,created_at,id FROM puzzle_score_entries WHERE ${where} AND lower(nickname) NOT IN ('tttt','tttttttt') AND NOT EXISTS (SELECT 1 FROM leaderboard_removed_scores removed WHERE removed.board='puzzle' AND removed.entry_id=puzzle_score_entries.id)`;
  const sql=unique
   ? `SELECT nickname,score,source_type AS sourceType,CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 1 ELSE 0 END AS profileVerified FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 'account:'||account_id ELSE 'nickname:'||lower(nickname) END ORDER BY score DESC,created_at ASC,id ASC) AS position FROM (${base})) WHERE position=1 ORDER BY score DESC,created_at ASC LIMIT ?`
   : `SELECT nickname,score,source_type AS sourceType,CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 1 ELSE 0 END AS profileVerified FROM (${base}) ORDER BY score DESC,created_at ASC,id ASC LIMIT ?`;
  const rows=await db.prepare(sql).bind(...(sprint?[limit]:[mode,limit])).all();
  return json({mode,hour:current,endsAt:(current+1)*3600000,entries:(rows.results||[]).map(entry=>entry.sourceType==='account'&&entry.nickname?{...entry,nickname:entry.nickname.charAt(0).toUpperCase()+entry.nickname.slice(1)}:entry),unverified:true,allTime:true});
 }catch{return json({error:"Leaderboard temporarily unavailable."},503)}
}
export async function onRequestPost({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:"Leaderboard database not configured."},503);
 const parsed=await readJsonPayload(request);
 if(parsed.error)return json({error:parsed.error},parsed.status);
 const data=parsed.data;
 const action=String(data?.action||'submit');
 if(action==='start'){
  const mode=String(data?.mode||'');if(!['sprint3','sprint5','survival'].includes(mode))return json({error:'Invalid game mode.'},400);
  try{
   if(!await consumeGameStart(db,'puzzle'))return json({error:'New games are temporarily at capacity. Please try again later.'},429);
   await dbReady(db);const now=Date.now();await cleanExpiredRuns(db,now);
   const id=crypto.randomUUID();await db.prepare('INSERT INTO puzzle_verified_runs(id,mode,started_at,score) VALUES(?,?,?,0)').bind(id,mode,now).run();return json({session:id});
  }
  catch{return json({error:'Could not start verified run.'},503)}
 }
 if(action==='solve'){
  const id=String(data?.session||''),puzzleId=String(data?.puzzleId||''),line=String(data?.solution||'').trim().toLowerCase();
  if(!/^[a-f0-9-]{36}$/i.test(id)||!puzzleId||puzzleId.length>80||line.length>400)return json({error:'Invalid puzzle proof.'},400);
  try{
   // Also initializes the new score trigger for runs started before this deploy.
   await dbReady(db);
   const run=await db.prepare('SELECT * FROM puzzle_verified_runs WHERE id=?').bind(id).first();
   if(!run||run.submitted)return json({error:'Run not available.'},409);
   const elapsed=Date.now()-run.started_at;
   const duration=run.mode==='sprint3'?180000:run.mode==='sprint5'?300000:86400000;
   if(elapsed<0||elapsed>duration+15000)return json({error:'Run has expired.'},409);
   if(elapsed<run.score*350)return json({error:'Puzzle proofs are arriving too quickly.'},429);
   const bank=data?.shard===null||data?.shard===undefined
    ?await puzzleBank(env,request)
    :await verifiedShard(env,request,Number(data.shard));
   if(bank.get(puzzleId)!==line)return json({error:'Puzzle solution not verified.'},400);
   // Recheck against current state at the actual write, after async asset I/O.
   // A prior SELECT alone lets parallel requests evade submission state checks.
   const now=Date.now();
   const inserted=await db.prepare(`INSERT OR IGNORE INTO puzzle_verified_solves(run_id,puzzle_id)
    SELECT id,? FROM puzzle_verified_runs WHERE id=? AND submitted=0 AND score<100000
    AND started_at<=? AND started_at>=? AND ?-started_at>=score*350`).bind(puzzleId,id,now,now-duration-15000,now).run();
   if(!inserted.meta?.changes){
    const duplicate=await db.prepare('SELECT 1 AS solved FROM puzzle_verified_solves WHERE run_id=? AND puzzle_id=?').bind(id,puzzleId).first();
    if(!duplicate)return json({error:'Run changed or puzzle proofs are arriving too quickly. Please retry.'},409);
   }
   return json({ok:true});
  }catch{return json({error:'Could not verify puzzle. Please retry.'},503)}
 }
 if(action!=='submit')return json({error:'Invalid action.'},400);
 const mode=String(data?.mode||''),sourceType=data?.sourceType==='account'?'account':'nickname',session=String(data?.session||'');
 let nickname=String(data?.nickname||'').trim(),accountId=null;
 let score=Number(data?.score);
 if(sourceType==='account'){
  if(!env.AUTH_DB||!env.BETTER_AUTH_SECRET)return json({error:'Account authentication unavailable.'},503);
  try{
   const auth=createAuth(env);
   const current=await auth.api.getSession({headers:request.headers});
   if(!current?.user?.id||!current.user.username)return json({error:'Sign in to publish using your account.'},401);
   accountId=current.user.id;
   nickname=current.user.username;
  }catch{return json({error:'Unable to verify your account session.'},503)}
 }
 if(mode==="sprint"||!validMode(mode)||!(sourceType==='account'?/^[a-zA-Z0-9_]{3,24}$/.test(nickname):/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))||!Number.isInteger(score)||score<0||score>100000)
  return json({error:"Use a valid name (2–20 characters) and score."},400);
 if(score===0)return json({error:"Solve at least one puzzle to enter."},400);
 // Disallowed leaderboard entries cannot be submitted again.
 if(["tttt","tttttttt"].includes(nickname.toLowerCase())||(sourceType==='nickname'&&isReservedIdentity(nickname)))return json({error:"This nickname is not available. Please choose another."},400);
 // Anonymous entries must not impersonate registered account names.
 if(sourceType==='nickname'&&env.AUTH_DB){
  try{
   const reserved=await env.AUTH_DB.prepare('SELECT id FROM user WHERE lower(username)=lower(?) LIMIT 1').bind(nickname).first();
   if(reserved)return json({error:'That name belongs to a registered account. Choose another nickname.'},409);
  }catch{return json({error:'Unable to check nickname availability.'},503)}
 }
 // Always moderate on the server: browser-only filters can be bypassed.
 try {
  if(checkProfanity(nickname,{allLanguages:true,detectLeetspeak:true,leetspeakLevel:"moderate",normalizeUnicode:true}).containsProfanity)
   return json({error:"This nickname is not family-friendly. Please choose another."},400);
 } catch {return json({error:"Nickname moderation temporarily unavailable."},503)}
 try{
  await dbReady(db);
  if(!/^[a-f0-9-]{36}$/i.test(session))return json({error:'A verified game session is required. Start a new run.'},400);
  const verified=await db.prepare('SELECT * FROM puzzle_verified_runs WHERE id=?').bind(session).first();
  if(!verified||verified.submitted||verified.mode!==mode)return json({error:'This run cannot be submitted.'},409);
  const elapsed=Date.now()-verified.started_at;
  const duration=mode==='sprint3'?180000:mode==='sprint5'?300000:86400000;
  if(elapsed<0||elapsed>duration+60000)return json({error:'Run expired before submission.'},409);
  if(verified.score!==score)return json({error:'Score verification incomplete. Please retry.'},409);
  const claim=await db.prepare('UPDATE puzzle_verified_runs SET submitted=1 WHERE id=? AND submitted=0 AND score=?').bind(session,score).run();
  if(!claim.meta?.changes)return json({error:'This run was already submitted.'},409);
  const now=hour();
  await db.prepare("INSERT INTO puzzle_score_entries(hour,mode,nickname,score,created_at,source_type,account_id) VALUES(?,?,?,?,?,?,?)").bind(now,mode,nickname,score,Date.now(),sourceType,accountId).run();
  return json({ok:true,hour:now});
 }catch{return json({error:"Could not save score."},503)}
}
