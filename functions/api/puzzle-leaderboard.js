import {checkProfanity} from 'glin-profanity';
// Hourly community rankings. Only voluntary nicknames and scores are stored.
// No IP addresses, Chess.com usernames, cookies, or player reports in D1.
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(data,status=200)=>Response.json(data,{status,headers});
const hour=()=>Math.floor(Date.now()/3600000);
const validMode=m=>["sprint","sprint3","sprint5","survival"].includes(m);
async function dbReady(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_hourly_scores (hour INTEGER NOT NULL, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(hour,mode,nickname))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_hourly_rank ON puzzle_hourly_scores(hour,mode,score DESC,created_at ASC)").run();
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
export async function onRequestGet({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:"Leaderboard database not configured."},503);
 const url=new URL(request.url),mode=url.searchParams.get("mode")||"sprint5";
 if(!validMode(mode))return json({error:"Invalid mode"},400);
 const limit=url.searchParams.get("limit")==="100"?100:10;
 try{
  await dbReady(db);
  await pruneScores(db);
  const current=hour();
  const sprint=mode==="sprint";
  const sql=sprint?"SELECT nickname,MAX(score) AS score FROM puzzle_hourly_scores WHERE mode IN ('sprint3','sprint5') AND lower(nickname) NOT IN ('tttt','tttttttt') GROUP BY nickname ORDER BY score DESC,nickname ASC LIMIT ?":"SELECT nickname,MAX(score) AS score FROM puzzle_hourly_scores WHERE mode=? AND lower(nickname) NOT IN ('tttt','tttttttt') GROUP BY nickname ORDER BY score DESC,nickname ASC LIMIT ?";
  const rows=await db.prepare(sql).bind(...(sprint?[limit]:[mode,limit])).all();
  return json({mode,hour:current,endsAt:(current+1)*3600000,entries:rows.results||[],unverified:true,allTime:true});
 }catch{return json({error:"Leaderboard temporarily unavailable."},503)}
}
export async function onRequestPost({request,env}){
 const db=env.SUS_DB;if(!db)return json({error:"Leaderboard database not configured."},503);
 let data;try{data=await request.json()}catch{return json({error:"Invalid JSON"},400)}
 const mode=String(data?.mode||""),nickname=String(data?.nickname||"").trim(),score=Number(data?.score);
 if(mode==="sprint"||!validMode(mode)||!(/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))||!Number.isInteger(score)||score<0||score>500)
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
  const now=hour();
  await db.prepare("INSERT INTO puzzle_hourly_scores(hour,mode,nickname,score,created_at) VALUES(?,?,?,?,?) ON CONFLICT(hour,mode,nickname) DO UPDATE SET score=excluded.score,created_at=excluded.created_at WHERE excluded.score > puzzle_hourly_scores.score").bind(now,mode,nickname,score,Date.now()).run();
  await pruneScores(db);
  return json({ok:true,hour:now});
 }catch{return json({error:"Could not save score."},503)}
}
