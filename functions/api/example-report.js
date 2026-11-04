// Public, shared snapshots for the two featured example players.
// Reports are unverified browser-generated analyses; no user accounts or private data.
const names=new Set(["MagnusCarlsen","Hikaru"]);
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const reply=(data,status=200)=>Response.json(data,{status,headers});
async function ready(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS featured_example_reports (player TEXT PRIMARY KEY, report TEXT NOT NULL, saved_at INTEGER NOT NULL)").run();
}
export async function onRequestGet({request,env}){
 const player=new URL(request.url).searchParams.get("player");
 if(!names.has(player))return reply({error:"Unknown player"},400);
 if(!env.SUS_DB)return reply({error:"Storage unavailable"},503);
 try{
  await ready(env.SUS_DB);
  const row=await env.SUS_DB.prepare("SELECT report,saved_at FROM featured_example_reports WHERE player=?").bind(player).first();
  if(!row)return reply({error:"No saved report"},404);
  return reply({player,report:JSON.parse(row.report),savedAt:row.saved_at,unverified:true});
 }catch{return reply({error:"Report unavailable"},503)}
}
export async function onRequestPost({request,env}){
 const player=new URL(request.url).searchParams.get("player");
 if(!names.has(player))return reply({error:"Unknown player"},400);
 if(!env.SUS_DB)return reply({error:"Storage unavailable"},503);
 const raw=await request.text();
 if(raw.length>7500000)return reply({error:"Report too large"},413);
 let data;try{data=JSON.parse(raw)}catch{return reply({error:"Invalid JSON"},400)}
 const report=data?.report;
 if(!report||typeof report!=="object"||!Number.isInteger(report.games)||report.games<1||report.games>5000)return reply({error:"Invalid report"},400);
 try{
  await ready(env.SUS_DB);
  await env.SUS_DB.prepare("INSERT INTO featured_example_reports(player,report,saved_at) VALUES(?,?,?) ON CONFLICT(player) DO UPDATE SET report=excluded.report,saved_at=excluded.saved_at").bind(player,JSON.stringify(report),Date.now()).run();
  return reply({saved:true});
 }catch{return reply({error:"Unable to save report"},503)}
}
