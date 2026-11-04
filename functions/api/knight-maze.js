import {checkProfanity} from 'glin-profanity';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const neighbors=(i)=>{const x=i%8,y=Math.floor(i/8);return jumps.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&a<8&&b>=0&&b<8).map(([a,b])=>b*8+a)};
const random=(n)=>Math.floor(Math.random()*n);
const pick=(items)=>items[random(items.length)];
const duration=180000;
async function ready(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS knight_maze_runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, level INTEGER NOT NULL, position INTEGER NOT NULL, goal INTEGER NOT NULL, blocked TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, submitted INTEGER NOT NULL DEFAULT 0)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS knight_maze_scores (nickname TEXT PRIMARY KEY COLLATE NOCASE, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS knight_maze_rank ON knight_maze_scores(score DESC,created_at ASC)").run();
}
function maze(level){
 for(let attempt=0;attempt<180;attempt++){
  const start=random(64),blocked=new Set(),chance=Math.min(.37,.17+level*.012);
  for(let i=0;i<64;i++)if(i!==start&&Math.random()<chance)blocked.add(i);
  const dist=Array(64).fill(-1),queue=[start];dist[start]=0;
  for(let k=0;k<queue.length;k++)for(const n of neighbors(queue[k]))if(!blocked.has(n)&&dist[n]===-1){dist[n]=dist[queue[k]]+1;queue.push(n)}
  const candidates=queue.filter(i=>dist[i]>=Math.min(5,3+Math.floor(level/5)));
  if(candidates.length){const goal=pick(candidates);return {position:start,goal,blocked:[...blocked].sort((a,b)=>a-b)}}
 }
 return {position:0,goal:63,blocked:[]};
}
const publicRun=(r)=>({id:r.id,level:r.level,score:r.score,position:r.position,goal:r.goal,blocked:JSON.parse(r.blocked),endsAt:r.started_at+duration,finished:!!r.finished});
async function ranking(db,limit){
 const result=await db.prepare("SELECT nickname,score FROM knight_maze_scores ORDER BY score DESC,created_at ASC,nickname ASC LIMIT ?").bind(limit).all();
 return result.results||[];
}
async function prune(db){
 await db.prepare("DELETE FROM knight_maze_scores WHERE nickname NOT IN (SELECT nickname FROM knight_maze_scores ORDER BY score DESC,created_at ASC,nickname ASC LIMIT 110)").run();
}
export async function onRequestGet({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:'Leaderboard database unavailable.'},503);
 try{
  await ready(db);
  const url=new URL(request.url);
  const limit=url.searchParams.get('limit')==='100'?100:10;
  await prune(db);
  return json({entries:await ranking(db,limit)});
 }catch{return json({error:'Leaderboard temporarily unavailable.'},503)}
}
export async function onRequestPost({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:'Game database unavailable.'},503);
 let data;try{data=await request.json()}catch{return json({error:'Invalid request.'},400)}
 const action=data?.action;
 if(!['start','move','finish','submit'].includes(action))return json({error:'Invalid action.'},400);
 try{
  await ready(db);
  const now=Date.now();
  if(action==='start'){
   await db.prepare('DELETE FROM knight_maze_runs WHERE started_at < ?').bind(now-86400000).run();
   const m=maze(1),id=crypto.randomUUID();
   await db.prepare('INSERT INTO knight_maze_runs(id,started_at,level,position,goal,blocked,score) VALUES(?,?,?,?,?,?,0)').bind(id,now,1,m.position,m.goal,JSON.stringify(m.blocked)).run();
   return json({run:{id,level:1,score:0,position:m.position,goal:m.goal,blocked:m.blocked,endsAt:now+duration,finished:false}});
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
    const next=maze(run.level+1);
    const updated=await db.prepare('UPDATE knight_maze_runs SET level=?,position=?,goal=?,blocked=?,score=score+1 WHERE id=? AND level=? AND position=? AND finished=0 AND started_at>?').bind(run.level+1,next.position,next.goal,JSON.stringify(next.blocked),id,run.level,run.position,now-duration).run();
    if(!updated.meta?.changes)return json({error:'Move already processed. Restart if necessary.'},409);
    return json({run:{id,level:run.level+1,score:run.score+1,position:next.position,goal:next.goal,blocked:next.blocked,endsAt:run.started_at+duration,finished:false},solved:true});
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
  const nickname=String(data?.nickname||'').trim();
  if(!/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))return json({error:'Use a nickname of 2–20 letters, numbers, spaces, _ or -.'},400);
  if(['tttt','tttttttt'].includes(nickname.toLowerCase()))return json({error:'Please choose another nickname.'},400);
  try{if(checkProfanity(nickname,{allLanguages:true,detectLeetspeak:true,leetspeakLevel:'moderate',normalizeUnicode:true}).containsProfanity)return json({error:'Please choose a family-friendly nickname.'},400)}
  catch{return json({error:'Nickname moderation temporarily unavailable.'},503)}
  const claimed=await db.prepare('UPDATE knight_maze_runs SET submitted=1,finished=1 WHERE id=? AND submitted=0 AND (finished=1 OR started_at<=?)').bind(id,now-duration).run();
  if(!claimed.meta?.changes)return json({error:'This score has already been submitted.'},409);
  await db.prepare('INSERT INTO knight_maze_scores(nickname,score,created_at) VALUES(?,?,?) ON CONFLICT(nickname) DO UPDATE SET score=excluded.score,created_at=excluded.created_at WHERE excluded.score>knight_maze_scores.score').bind(nickname,run.score,now).run();
  await prune(db);
  return json({ok:true,entries:await ranking(db,10)});
 }catch{return json({error:'Could not process the game. Please try again.'},503)}
}
