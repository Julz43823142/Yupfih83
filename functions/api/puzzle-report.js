import {readJsonPayload} from '../../lib/server-request-guard.js';
// Server-side report handling. Never expose REPORT_SECRET to the browser.
const SCRIPT_URL="https://script.google.com/macros/s/AKfycbztviqAs-l4vxnuHdulEg6vmKFpZhMbNatgkQScyOBR5kLRUU-n_z3O_961N6rymr3PVw/exec";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY"};
const json=(data,status=200)=>Response.json(data,{status,headers});
export async function onRequestPost({request,env}){
 if(!env.SUS_DB||!env.REPORT_SECRET)return json({error:"Reporting is not configured yet."},503);
 const parsed=await readJsonPayload(request);
 if(parsed.error)return json({error:parsed.error},parsed.status);
 const data=parsed.data;
 const mode=data?.mode,nickname=data?.nickname,score=data?.score;
 if(!["sprint","survival"].includes(mode)||typeof nickname!=="string"||!(/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))||!Number.isInteger(score)||score<0||score>100000)return json({error:"Invalid leaderboard entry."},400);
 const db=env.SUS_DB;
 try{
  const modes=mode==="sprint"?"('sprint3','sprint5')":"('survival')";
  const row=await db.prepare(`SELECT MAX(score) AS score FROM puzzle_hourly_scores WHERE mode IN ${modes} AND nickname=?`).bind(nickname).first();
  if(!row||row.score!==score)return json({error:"This leaderboard entry is no longer available. Refresh the page."},404);
  await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_nickname_reports (nickname TEXT PRIMARY KEY COLLATE NOCASE, mode TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
  const inserted=await db.prepare("INSERT OR IGNORE INTO puzzle_nickname_reports(nickname,mode,score,created_at) VALUES(?,?,?,?)").bind(nickname,mode,score,Date.now()).run();
  if(!inserted.meta?.changes)return json({ok:true,message:"Successfully reported."});
  try{
   const result=await fetch(SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({secret:env.REPORT_SECRET,nickname,mode,score}),redirect:"follow",signal:AbortSignal.timeout(12000)});
   const message=(await result.text()).trim();
   if(!result.ok||message!=="OK")throw Error("Mail delivery not confirmed");
  }catch(error){
   // A failed or timed-out request may still have sent an email. Keep the
   // reservation to prevent accidental duplicate notifications.
   console.error("Nickname report delivery unconfirmed.");
   return json({error:"Report delivery could not be confirmed. Please contact us if needed."},502);
  }
  return json({ok:true,message:"Report submitted. Thank you."});
 }catch{console.error("Nickname reporting unavailable.");return json({error:"Reporting is temporarily unavailable."},503)}
}
