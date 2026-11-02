import {json} from "../../../../lib/v87-github.js";
export async function onRequestGet({params,env}){
  const username=String(params.username||"").toLowerCase();
  if(!/^[a-z0-9_-]{3,25}$/.test(username))return json({error:"Invalid username"},400);
  if(!env.SUS_DB)return json({error:"Review storage unavailable"},503);
  try{
    const row=await env.SUS_DB.prepare("SELECT report_json,run_started_at FROM sus_latest_reports WHERE username=?").bind(username).first();
    if(!row)return json({error:"No saved review yet. Run a new analysis first."},404);
    return new Response(JSON.stringify({result:JSON.parse(row.report_json),reviewed_at:row.run_started_at}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }catch{return json({error:"Unable to load saved review"},503);}
}
