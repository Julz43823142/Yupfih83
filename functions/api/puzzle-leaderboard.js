// Public community puzzle scores. Uses the existing Cloudflare D1 SUS_DB binding.
// Anonymous scores are community submissions, not anti-cheat verified rankings.
const respond=(payload,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const validMode=x=>x==="sprint"||x==="survival";
async function setup(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_runs (id TEXT PRIMARY KEY, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, duration INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_runs_by_mode ON puzzle_runs(mode,score DESC,created_at ASC)").run();
}
export async function onRequestGet({request,env}){
 const u=new URL(request.url),mode=u.searchParams.get("mode"),limit=u.searchParams.get("limit")==="100"?100:10;
 if(!validMode(mode))return respond({error:"Invalid puzzle mode"},400);
 if(!env.SUS_DB)return respond({error:"Leaderboard storage is not configured."},503);
 try{
  await setup(env.SUS_DB);
  // Keep only each nickname's highest score per mode; ties favor earlier runs.
  const rows=await env.SUS_DB.prepare("SELECT nickname,MAX(score) AS score,MIN(created_at) AS achieved_at FROM puzzle_runs WHERE mode=? GROUP BY LOWER(nickname) ORDER BY score DESC,achieved_at ASC LIMIT ?").bind(mode,limit).all();
  return respond({mode,scores:(rows.results||[]).map((r,i)=>({rank:i+1,nickname:String(r.nickname),score:Number(r.score)})),verified:false});
 }catch{return respond({error:"Leaderboard temporarily unavailable."},503)}
}
export async function onRequestPost({request,env}){
 if(!env.SUS_DB)return respond({error:"Leaderboard storage is not configured."},503);
 if(request.headers.get("Origin")&&request.headers.get("Origin")!==new URL(request.url).origin)return respond({error:"Invalid origin."},403);
 if(!(request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))return respond({error:"Expected JSON."},415);
 let body;try{body=await request.json()}catch{return respond({error:"Invalid JSON."},400)}
 const mode=String(body?.mode||""),nickname=String(body?.nickname||"").trim(),score=Number(body?.score),duration=Number(body?.duration);
 if(!validMode(mode)||nickname.length<2||nickname.length>25||!/^[\p{L}\p{N}_ .-]+$/u.test(nickname)
  ||!Number.isInteger(score)||score<0||score>500||!Number.isInteger(duration)||duration<0||duration>86400
  ||(mode==="sprint"&&duration>305))return respond({error:"Invalid run details."},400);
 try{
  await setup(env.SUS_DB);
  const now=Math.floor(Date.now()/1000);
  await env.SUS_DB.prepare("INSERT INTO puzzle_runs (id,mode,nickname,score,duration,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),mode,nickname,score,duration,now).run();
  return respond({saved:true,verified:false});
 }catch{return respond({error:"Could not save the run."},503)}
}
