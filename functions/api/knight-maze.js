import {createAuth} from '../../lib/auth/config.mjs';
import {readJsonPayload} from '../../lib/server-request-guard.js';
import {consumeGameStart} from '../../lib/game-capacity.js';
import {checkProfanity} from 'glin-profanity';
import {isReservedIdentity} from '../../lib/identity.mjs';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const neighbors=(i)=>{const x=i%8,y=Math.floor(i/8);return jumps.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&a<8&&b>=0&&b<8).map(([a,b])=>b*8+a)};
// Stable per-run levels allow the server to send the NEXT maze in advance.
// The server still verifies every knight move before awarding any score.
function seededRoll(runId,level){
 let state=2166136261;
 for(const char of runId+':'+level){state=Math.imul(state^char.charCodeAt(0),16777619)>>>0}
 return ()=>{
  state=(state+0x6D2B79F5)>>>0;
  let t=state;
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
 };
}
const duration=180000;
let lastRunCleanup=0;
const schemas=new WeakMap();
async function ready(db){
 if(schemas.has(db))return schemas.get(db);
 const schemaPromise=(async()=>{
 await db.prepare("CREATE TABLE IF NOT EXISTS knight_maze_runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, level INTEGER NOT NULL, position INTEGER NOT NULL, goal INTEGER NOT NULL, blocked TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, submitted INTEGER NOT NULL DEFAULT 0)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS knight_maze_scores (nickname TEXT PRIMARY KEY COLLATE NOCASE, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
 const cols=await db.prepare("PRAGMA table_info(knight_maze_scores)").all();
 const names=new Set((cols.results||[]).map(x=>x.name));
 if(!names.has('source_type'))await db.prepare("ALTER TABLE knight_maze_scores ADD COLUMN source_type TEXT NOT NULL DEFAULT 'nickname'").run();
 if(!names.has('account_id'))await db.prepare("ALTER TABLE knight_maze_scores ADD COLUMN account_id TEXT").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS knight_maze_rank ON knight_maze_scores(score DESC,created_at ASC)").run();
 // Append-only scores: retain legacy rows without deleting the original table.
 await db.prepare("CREATE TABLE IF NOT EXISTS knight_maze_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, source_type TEXT NOT NULL, account_id TEXT, legacy_key TEXT UNIQUE)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS knight_maze_entries_rank ON knight_maze_score_entries(score DESC,created_at ASC)").run();
 await db.prepare("INSERT OR IGNORE INTO knight_maze_score_entries(nickname,score,created_at,source_type,account_id,legacy_key) SELECT nickname,score,created_at,source_type,account_id,'legacy:'||lower(nickname) FROM knight_maze_scores").run();
 })().catch(error=>{schemas.delete(db);throw error});
 schemas.set(db,schemaPromise);
 return schemaPromise;
}
function maze(level,runId){
 const roll=seededRoll(runId,level);
 for(let attempt=0;attempt<180;attempt++){
  const start=Math.floor(roll()*64),blocked=new Set(),chance=Math.min(.37,.17+level*.012);
  for(let i=0;i<64;i++)if(i!==start&&roll()<chance)blocked.add(i);
  const dist=Array(64).fill(-1),queue=[start];dist[start]=0;
  for(let k=0;k<queue.length;k++)for(const n of neighbors(queue[k]))if(!blocked.has(n)&&dist[n]===-1){dist[n]=dist[queue[k]]+1;queue.push(n)}
  const candidates=queue.filter(i=>dist[i]>=Math.min(5,3+Math.floor(level/5)));
  if(candidates.length){const goal=candidates[Math.floor(roll()*candidates.length)];return {position:start,goal,blocked:[...blocked].sort((a,b)=>a-b)}}
 }
 return {position:0,goal:63,blocked:[]};
}
const futureLevels=(id,nextLevel)=>[1,2,3].map(offset=>maze(nextLevel+offset-1,id));
const publicRun=(r)=>({id:r.id,level:r.level,score:r.score,position:r.position,goal:r.goal,blocked:JSON.parse(r.blocked),endsAt:r.started_at+duration,finished:!!r.finished});
async function ranking(db,limit,unique=false){
 const sql=unique
  ? "SELECT nickname,score,source_type AS sourceType,CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 1 ELSE 0 END AS profileVerified FROM (SELECT nickname,score,source_type,account_id,ROW_NUMBER() OVER (PARTITION BY CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 'account:'||account_id ELSE 'nickname:'||lower(nickname) END ORDER BY score DESC,created_at ASC,id ASC) AS position FROM knight_maze_score_entries) WHERE position=1 ORDER BY score DESC,created_at ASC LIMIT ?"
  : "SELECT nickname,score,source_type AS sourceType,CASE WHEN source_type='account' AND account_id IS NOT NULL THEN 1 ELSE 0 END AS profileVerified FROM knight_maze_score_entries ORDER BY score DESC,created_at ASC,id ASC LIMIT ?";
 const result=await db.prepare(sql).bind(limit).all();
 return (result.results||[]).map(entry=>entry.sourceType==='account'&&entry.nickname?{...entry,nickname:entry.nickname.charAt(0).toUpperCase()+entry.nickname.slice(1)}:entry);
}
// Keep every verified score; no name-based pruning that merges players.
export async function onRequestGet({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:'Leaderboard database unavailable.'},503);
 try{
  await ready(db);
  const url=new URL(request.url);
  const limit=[10,50,100].includes(Number(url.searchParams.get('limit')))?Number(url.searchParams.get('limit')):10;
  return json({entries:await ranking(db,limit,url.searchParams.get('filter')==='unique')});
 }catch{return json({error:'Leaderboard temporarily unavailable.'},503)}
}
export async function onRequestPost({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:'Game database unavailable.'},503);
 const parsed=await readJsonPayload(request);
 if(parsed.error)return json({error:parsed.error},parsed.status);
 const data=parsed.data;
 const action=data?.action;
 if(!['start','move','finish','submit'].includes(action))return json({error:'Invalid action.'},400);
 try{
  // All move/finish requests refer to a run created by start(), which already
  // initialized the tables. Avoid redundant DDL checks on every fast move.
  if(action==='start'&&!await consumeGameStart(db,'knight-maze'))return json({error:'New games are temporarily at capacity. Please try again later.'},429);
  if(action==='start'||action==='submit')await ready(db);
  const now=Date.now();
  if(action==='start'){
   // Purge expired runs at most once per isolate per hour.
   if(now-lastRunCleanup>3600000){
    lastRunCleanup=now;
    try{await db.prepare('DELETE FROM knight_maze_runs WHERE started_at < ?').bind(now-86400000).run()}
    catch{lastRunCleanup=0}
   }
   const id=crypto.randomUUID(),m=maze(1,id);
   await db.prepare('INSERT INTO knight_maze_runs(id,started_at,level,position,goal,blocked,score) VALUES(?,?,?,?,?,?,0)').bind(id,now,1,m.position,m.goal,JSON.stringify(m.blocked)).run();
   return json({run:{id,level:1,score:0,position:m.position,goal:m.goal,blocked:m.blocked,endsAt:now+duration,finished:false,preview:maze(2,id),lookahead:futureLevels(id,3)}});
  }
  const id=String(data?.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Invalid game session.'},400);
  const run=await db.prepare('SELECT * FROM knight_maze_runs WHERE id=?').bind(id).first();
  if(!run)return json({error:'Game session not found. Start a new game.'},404);
  if(action==='move'){
   if(run.finished||now>=run.started_at+duration)return json({run:{...publicRun(run),finished:true},expired:true});
   const to=data?.to;
   if(!Number.isInteger(to)||!neighbors(run.position).includes(to)||JSON.parse(run.blocked).includes(to))return json({error:'Illegal knight move.'},400);
   if(to===run.goal){
    const next=maze(run.level+1,id);
    const updated=await db.prepare('UPDATE knight_maze_runs SET level=?,position=?,goal=?,blocked=?,score=score+1 WHERE id=? AND level=? AND position=? AND finished=0 AND started_at>?').bind(run.level+1,next.position,next.goal,JSON.stringify(next.blocked),id,run.level,run.position,now-duration).run();
    if(!updated.meta?.changes)return json({error:'Move already processed. Restart if necessary.'},409);
    return json({run:{id,level:run.level+1,score:run.score+1,position:next.position,goal:next.goal,blocked:next.blocked,endsAt:run.started_at+duration,finished:false,preview:maze(run.level+2,id),lookahead:futureLevels(id,run.level+3)},solved:true});
   }
   const updated=await db.prepare('UPDATE knight_maze_runs SET position=? WHERE id=? AND level=? AND position=? AND finished=0 AND started_at>?').bind(to,id,run.level,run.position,now-duration).run();
   if(!updated.meta?.changes)return json({error:'Move already processed. Restart if necessary.'},409);
   return json({run:{...publicRun(run),position:to}});
  }
  if(action==='finish'){
   await db.prepare('UPDATE knight_maze_runs SET finished=1 WHERE id=?').bind(id).run();
   return json({run:{...publicRun(run),finished:true}});
  }
  if(run.submitted)return json({error:'This score has already been submitted.'},409);
  if(!run.finished&&now<run.started_at+duration)return json({error:'Finish the game before submitting.'},400);
  if(run.score<1)return json({error:'Reach at least one star to enter the leaderboard.'},400);
  // Derive identity from the server-side session, never from a client-provided flag.
  // Authenticated scores always use the account username, including repeat entries.
  if(!env.AUTH_DB||!env.BETTER_AUTH_SECRET)return json({error:'Account identity verification unavailable.'},503);
  let session;
  try{session=await createAuth(env).api.getSession({headers:request.headers})}
  catch{return json({error:'Unable to verify account identity.'},503)}
  const accountId=session?.user?.id||null;
  const sourceType=accountId?'account':'nickname';
  let nickname=accountId?session.user.username:String(data?.nickname||'').trim();
  if(!accountId&&data?.sourceType==='account')return json({error:'Sign in to publish using your account.'},401);
  if(!(sourceType==='account'?/^[a-zA-Z0-9_]{3,24}$/:/^[a-zA-Z0-9 _-]{2,20}$/).test(nickname))return json({error:'Use a nickname of 2–20 letters, numbers, spaces, _ or -.'},400);
  if(['tttt','tttttttt'].includes(nickname.toLowerCase())||(sourceType==='nickname'&&isReservedIdentity(nickname)))return json({error:'Please choose another nickname.'},400);
  try{if(checkProfanity(nickname,{allLanguages:true,detectLeetspeak:true,leetspeakLevel:'moderate',normalizeUnicode:true}).containsProfanity)return json({error:'Please choose a family-friendly nickname.'},400)}
  catch{return json({error:'Nickname moderation temporarily unavailable.'},503)}
  if(sourceType==='nickname'&&env.AUTH_DB){
   try{const reserved=await env.AUTH_DB.prepare('SELECT id FROM user WHERE lower(username)=lower(?) LIMIT 1').bind(nickname).first();if(reserved)return json({error:'That nickname belongs to an account. Choose another.'},409)}catch{return json({error:'Nickname verification unavailable.'},503)}
  }
  const claimed=await db.prepare('UPDATE knight_maze_runs SET submitted=1,finished=1 WHERE id=? AND submitted=0 AND (finished=1 OR started_at<=?)').bind(id,now-duration).run();
  if(!claimed.meta?.changes)return json({error:'This score has already been submitted.'},409);
  await db.prepare("INSERT INTO knight_maze_score_entries(nickname,score,created_at,source_type,account_id) VALUES(?,?,?,?,?)").bind(nickname,run.score,now,sourceType,accountId).run();
  return json({ok:true,entries:await ranking(db,10)});
 }catch{return json({error:'Could not process the game. Please try again.'},503)}
}
