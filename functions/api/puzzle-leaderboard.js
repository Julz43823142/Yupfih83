// Public puzzle leaderboard: reject unverified score submissions.
// Existing read-only community rankings remain available until a verified
// server-side puzzle-run protocol is deployed.
const respond=(payload,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const validMode=x=>x==="sprint"||x==="survival";
async function setup(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_runs (id TEXT PRIMARY KEY, mode TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, duration INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_runs_by_mode ON puzzle_runs(mode,score DESC,created_at ASC)").run();
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),mode=url.searchParams.get("mode"),limit=url.searchParams.get("limit")==="100"?100:10;
 if(!validMode(mode))return respond({error:"Invalid puzzle mode."},400);
 if(!env.SUS_DB)return respond({error:"Leaderboard storage is not configured."},503);
 try{
  await setup(env.SUS_DB);
  const rows=await env.SUS_DB.prepare("SELECT nickname,MAX(score) AS score,MIN(created_at) AS achieved_at FROM puzzle_runs WHERE mode=? GROUP BY LOWER(nickname) ORDER BY score DESC,achieved_at ASC LIMIT ?").bind(mode,limit).all();
  return respond({mode,scores:(rows.results||[]).map((r,i)=>({rank:i+1,nickname:String(r.nickname),score:Number(r.score)})),verified:false});
 }catch{return respond({error:"Leaderboard temporarily unavailable."},503)}
}
export async function onRequestPost(){
 // Origin checks, client-supplied session tokens, and browser-calculated scores
 // cannot prove that puzzles were actually solved. Fail closed.
 return respond({error:"Saving leaderboard scores is temporarily disabled until server-verified puzzle runs are available."},403);
}
