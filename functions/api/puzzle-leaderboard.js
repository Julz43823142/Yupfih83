import {readJsonPayload} from '../_shared/read-json.js';
import {checkProfanity} from 'glin-profanity';
// Hourly community rankings. Only voluntary nicknames and scores are stored.
// No IP addresses, Chess.com usernames, cookies, or player reports in D1.
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY"};
const json=(data,status=200)=>Response.json(data,{status,headers});
const hour=()=>Math.floor(Date.now()/3600000);
const validMode=m=>["sprint","sprint3","sprint5","survival"].includes(m);
let schemaPromise=null;
async function dbReady(db){
 if(schemaPromise)return schemaPromise;
 schemaPromise=(async()=>{
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_hourly_scores (hour INTEGER NOT NULL, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(hour,mode,nickname))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_hourly_rank ON puzzle_hourly_scores(hour,mode,score DESC,created_at ASC)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_verified_runs (id TEXT PRIMARY KEY,mode TEXT NOT NULL,started_at INTEGER NOT NULL,score INTEGER NOT NULL DEFAULT 0,submitted INTEGER NOT NULL DEFAULT 0)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_verified_solves (run_id TEXT NOT NULL,puzzle_id TEXT NOT NULL,PRIMARY KEY(run_id,puzzle_id))").run();
 })().catch(error=>{schemaPromise=null;throw error});
 return schemaPromise;
}
// Keep only the highest score per nickname and the best 110 nicknames (100 public, 10 reserves) in each
// public ranking. Sprint 3 and Sprint 5 share one combined ranking.
async function pruneScores(db){
 for(const modes of ["('sprint3','sprint5')","('survival')"]){
  await db.prepare(`DELETE FROM puzzle_hourly_scores
   WHERE mode IN ${modes} AND rowid NOT IN (
    SELECT rowid FROM (
     SELECT rowid,nickname,ROW_NUMBER() OVER (
      PARTITION BY nickname ORDER BY score DESC,created_at ASC
     ) AS row_number
     FROM puzzle_hourly_scores WHERE mode IN ${modes}
    ) WHERE row_number=1 AND nickname IN (
     SELECT nickname FROM puzzle_hourly_scores
     WHERE mode IN ${modes} AND lower(nickname) NOT IN ('tttt','tttttttt')
     GROUP BY nickname ORDER BY MAX(score) DESC,nickname ASC LIMIT 110
    )
   )`).run();
 }
}
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
 const limit=url.searchParams.get("limit")==="100"?100:10;
 try{
  await dbReady(db);
  const current=hour();
  const sprint=mode==="sprint";
  const sql=sprint?"SELECT nickname,MAX(score) AS score FROM puzzle_hourly_scores WHERE mode IN ('sprint3','sprint5') AND lower(nickname) NOT IN ('tttt','tttttttt') GROUP BY nickname ORDER BY score DESC,nickname ASC LIMIT ?":"SELECT nickname,MAX(score) AS score FROM puzzle_hourly_scores WHERE mode=? AND lower(nickname) NOT IN ('tttt','tttttttt') GROUP BY nickname ORDER BY score DESC,nickname ASC LIMIT ?";
  const rows=await db.prepare(sql).bind(...(sprint?[limit]:[mode,limit])).all();
  return json({mode,hour:current,endsAt:(current+1)*3600000,entries:rows.results||[],unverified:true,allTime:true});
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
  try{await dbReady(db);const id=crypto.randomUUID();await db.prepare('INSERT INTO puzzle_verified_runs(id,mode,started_at,score) VALUES(?,?,?,0)').bind(id,mode,Date.now()).run();return json({session:id})}
  catch{return json({error:'Could not start verified run.'},503)}
 }
 if(action==='solve'){
  const id=String(data?.session||''),puzzleId=String(data?.puzzleId||''),line=String(data?.solution||'').trim().toLowerCase();
  if(!/^[a-f0-9-]{36}$/i.test(id)||!puzzleId||puzzleId.length>80||line.length>400)return json({error:'Invalid puzzle proof.'},400);
  try{
   // The run's start request already created the required tables.
   const run=await db.prepare('SELECT * FROM puzzle_verified_runs WHERE id=?').bind(id).first();
   if(!run||run.submitted)return json({error:'Run not available.'},409);
   const elapsed=Date.now()-run.started_at;
   const duration=run.mode==='sprint3'?180000:run.mode==='sprint5'?300000:86400000;
   if(elapsed<0||elapsed>duration+15000)return json({error:'Run has expired.'},409);
   const bank=data?.shard===null||data?.shard===undefined
    ?await puzzleBank(env,request)
    :await verifiedShard(env,request,Number(data.shard));
   if(bank.get(puzzleId)!==line)return json({error:'Puzzle solution not verified.'},400);
   const inserted=await db.prepare('INSERT OR IGNORE INTO puzzle_verified_solves(run_id,puzzle_id) VALUES(?,?)').bind(id,puzzleId).run();
   if(inserted.meta?.changes)await db.prepare('UPDATE puzzle_verified_runs SET score=score+1 WHERE id=? AND score<100000').bind(id).run();
   return json({ok:true});
  }catch{return json({error:'Could not verify puzzle. Please retry.'},503)}
 }
 if(action!=='submit')return json({error:'Invalid action.'},400);
 const mode=String(data?.mode||''),nickname=String(data?.nickname||'').trim(),session=String(data?.session||'');
 let score=Number(data?.score);
 if(mode==="sprint"||!validMode(mode)||!(/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))||!Number.isInteger(score)||score<0||score>100000)
  return json({error:"Use a nickname (2–20 letters/numbers) and a valid score."},400);
 if(score===0)return json({error:"Solve at least one puzzle to enter."},400);
 // Disallowed leaderboard entries cannot be submitted again.
 if(["tttt","tttttttt"].includes(nickname.toLowerCase()))return json({error:"This nickname is not available. Please choose another."},400);
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
  const claim=await db.prepare('UPDATE puzzle_verified_runs SET submitted=1 WHERE id=? AND submitted=0').bind(session).run();
  if(!claim.meta?.changes)return json({error:'This run was already submitted.'},409);
  const now=hour();
  await db.prepare("INSERT INTO puzzle_hourly_scores(hour,mode,nickname,score,created_at) VALUES(?,?,?,?,?) ON CONFLICT(hour,mode,nickname) DO UPDATE SET score=excluded.score,created_at=excluded.created_at WHERE excluded.score > puzzle_hourly_scores.score").bind(now,mode,nickname,score,Date.now()).run();
  await pruneScores(db);
  return json({ok:true,hour:now});
 }catch{return json({error:"Could not save score."},503)}
}
