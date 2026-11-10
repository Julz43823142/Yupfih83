import {createAuth} from '../../lib/auth/config.mjs';
import {readJsonPayload} from '../../lib/server-request-guard.js';
import {consumeGameStart} from '../../lib/game-capacity.js';
import {isReservedIdentity} from '../../lib/identity.mjs';
import {checkProfanity} from 'glin-profanity';
import {IDs} from '../../arcade-rules.mjs';
import {ensureModerationTable} from '../../lib/leaderboard-moderation.mjs';

// Arcade scores are currently PROVISIONAL. A server-created session and
// bounded rate/score caps are not a cryptographic proof of gameplay.
// Do not advertise this leaderboard as an anti-cheat-verified ranking.
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const json=(payload,status=200)=>Response.json(payload,{status,headers});
const schemas=new WeakMap();
let lastCleanup=0;
async function ready(db){
 if(schemas.has(db))return schemas.get(db);
 const p=(async()=>{
  await db.prepare('CREATE TABLE IF NOT EXISTS arcade_runs (id TEXT PRIMARY KEY, mode TEXT NOT NULL, started_at INTEGER NOT NULL, submitted INTEGER NOT NULL DEFAULT 0)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS arcade_runs_created ON arcade_runs(started_at)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS arcade_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, source_type TEXT NOT NULL, account_id TEXT)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS arcade_score_rank ON arcade_score_entries(mode,score DESC,created_at ASC,id ASC)').run();
  await ensureModerationTable(db);
 })().catch(error=>{schemas.delete(db);throw error});
 schemas.set(db,p);return p;
}
const maxScore={'endgame-survivor':1000,'guess-the-elo':250000,'chess-memory':100000,'missing-piece':1000,'safe-square-rush':2500,'falling-board':5000,'queen-chase':5000,'chess-block-party':2500,'pawn-dash':5000};
async function rankings(db,mode){
 const r=await db.prepare("SELECT nickname,score,source_type AS sourceType,CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 1 ELSE 0 END AS profileVerified FROM arcade_score_entries WHERE mode=? AND NOT EXISTS (SELECT 1 FROM leaderboard_removed_scores removed WHERE removed.board='arcade' AND removed.entry_id=arcade_score_entries.id) ORDER BY score DESC,created_at ASC,id ASC LIMIT 100").bind(mode).all();
 return (r.results||[]).map(entry=>entry.sourceType==='account'&&entry.nickname?{...entry,nickname:entry.nickname.charAt(0).toUpperCase()+entry.nickname.slice(1)}:entry);
}
export async function onRequestGet({request,env}){
 const mode=new URL(request.url).searchParams.get('mode');
 if(!IDs.has(mode))return json({error:'Invalid minigame.'},400);
 if(!env.SUS_DB)return json({error:'Leaderboard database unavailable.'},503);
 try{await ready(env.SUS_DB);return json({mode,unverified:true,allTime:true,entries:await rankings(env.SUS_DB,mode)})}
 catch{return json({error:'Leaderboard temporarily unavailable.'},503)}
}
export async function onRequestPost({request,env}){
 const db=env.SUS_DB;
 if(!db)return json({error:'Game database unavailable.'},503);
 const parsed=await readJsonPayload(request);
 if(parsed.error)return json({error:parsed.error},parsed.status);
 const d=parsed.data,action=d?.action,mode=d?.mode;
 if(!IDs.has(mode))return json({error:'Invalid minigame.'},400);
 if(!['start','submit'].includes(action))return json({error:'Invalid action.'},400);
 try{
  if(action==='start'){
   if(!await consumeGameStart(db,'arcade'))return json({error:'Arcade games are temporarily at capacity.'},429);
   await ready(db);
   const now=Date.now();
   if(now-lastCleanup>3600000){
    try{await db.prepare('DELETE FROM arcade_runs WHERE started_at<?').bind(now-90000000).run();lastCleanup=now}catch{}
   }
   const id=crypto.randomUUID();
   await db.prepare('INSERT INTO arcade_runs(id,mode,started_at) VALUES(?,?,?)').bind(id,mode,now).run();
   return json({session:id});
  }
  const id=String(d?.session||''),score=d?.score;
  if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isSafeInteger(score)||score<1||score>maxScore[mode])
   return json({error:'Invalid score or game session.'},400);
  await ready(db);
  const run=await db.prepare('SELECT * FROM arcade_runs WHERE id=?').bind(id).first();
  if(!run||run.mode!==mode||run.submitted)return json({error:'Run not found or already submitted.'},409);
  const elapsed=Date.now()-run.started_at;
  const expiry=mode==='endgame-survivor'?86400000:195000;
  if(elapsed<0||elapsed>expiry)return json({error:'Game session expired.'},409);
  // Coarse sanity cap only. These are provisional, not replay-verified scores.
  if(mode!=='endgame-survivor'&&score>Math.max(150,Math.floor(elapsed/100)*50))
   return json({error:'Score exceeds the provisional run limit.'},400);
  if(!env.AUTH_DB||!env.BETTER_AUTH_SECRET)return json({error:'Account identity verification unavailable.'},503);
  let current;
  try{current=await createAuth(env).api.getSession({headers:request.headers})}
  catch{return json({error:'Unable to check account identity.'},503)}
  const accountId=current?.user?.id||null;
  const sourceType=accountId?'account':'nickname';
  const nickname=accountId?current.user.username:String(d?.nickname||'').trim();
  if(!accountId&&d?.sourceType==='account')return json({error:'Sign in to use an account name.'},401);
  if(!(sourceType==='account'?/^[A-Za-z0-9_]{3,24}$/:/^[A-Za-z0-9 _-]{2,20}$/).test(nickname))
   return json({error:'Use a nickname of 2–20 letters, numbers, spaces, _ or -.'},400);
  if(['tttt','tttttttt'].includes(nickname.toLowerCase())||(sourceType==='nickname'&&isReservedIdentity(nickname)))
   return json({error:'Choose another nickname.'},400);
  try{
   if(checkProfanity(nickname,{allLanguages:true,detectLeetspeak:true,leetspeakLevel:'moderate',normalizeUnicode:true}).containsProfanity)
    return json({error:'Choose a family-friendly nickname.'},400);
  }catch{return json({error:'Nickname moderation unavailable.'},503)}
  if(sourceType==='nickname'){
   try{
    const reserved=await env.AUTH_DB.prepare('SELECT id FROM user WHERE lower(username)=lower(?) LIMIT 1').bind(nickname).first();
    if(reserved)return json({error:'This nickname belongs to an account.'},409);
   }catch{return json({error:'Nickname availability unavailable.'},503)}
  }
  const updated=await db.prepare('UPDATE arcade_runs SET submitted=1 WHERE id=? AND mode=? AND submitted=0').bind(id,mode).run();
  if(!updated.meta?.changes)return json({error:'This score was already submitted.'},409);
  await db.prepare('INSERT INTO arcade_score_entries(mode,nickname,score,created_at,source_type,account_id) VALUES(?,?,?,?,?,?)').bind(mode,nickname,score,Date.now(),sourceType,accountId).run();
  return json({ok:true,unverified:true,entries:await rankings(db,mode)});
 }catch{return json({error:'Arcade service temporarily unavailable.'},503)}
}
