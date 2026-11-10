import {readJsonPayload} from '../../lib/server-request-guard.js';
import {rateLimit} from '../../lib/online/security.mjs';
import {ensureModerationTable} from '../../lib/leaderboard-moderation.mjs';
// Server-side report handling. Never expose REPORT_SECRET to the browser.
const SCRIPT_URL="https://script.google.com/macros/s/AKfycbztviqAs-l4vxnuHdulEg6vmKFpZhMbNatgkQScyOBR5kLRUU-n_z3O_961N6rymr3PVw/exec";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY"};
const json=(data,status=200)=>Response.json(data,{status,headers});
export async function onRequestPost({request,env}){
 if(!env.SUS_DB||!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32||!env.REPORT_SECRET)return json({error:"Reporting is not configured yet."},503);
 const parsed=await readJsonPayload(request);
 if(parsed.error)return json({error:parsed.error},parsed.status);
 const data=parsed.data;
 const mode=data?.mode,nickname=data?.nickname,score=data?.score;
 const arcadeModes=new Set(["endgame-survivor","guess-the-elo","chess-memory","missing-piece","safe-square-rush","falling-board","queen-chase","chess-block-party","pawn-dash"]);
 if(!["sprint","survival","knight-maze"].includes(mode)&&!arcadeModes.has(mode))return json({error:"Invalid leaderboard."},400);
 if(typeof nickname!=="string"||!(/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname))||!Number.isInteger(score)||score<0||score>100000)return json({error:"Invalid leaderboard entry."},400);
 const db=env.SUS_DB;
 try{
  // This public email-producing endpoint requires atomic, D1-backed abuse
  // budgets. Never accept spoofed X-Forwarded-For as a fresh identity.
  const minute=await rateLimit(env,request,'nickname-report-minute',6,60000);
  if(!minute)return Response.json({error:'Too many reports. Please try later.'},{status:429,headers:{...headers,'Retry-After':'60'}});
  const hour=await rateLimit(env,request,'nickname-report-hour',20,3600000);
  if(!hour)return Response.json({error:'Too many reports. Please try later.'},{status:429,headers:{...headers,'Retry-After':'60'}});
  await ensureModerationTable(db);
  let row;
  if(arcadeModes.has(mode))row=await db.prepare("SELECT score FROM arcade_score_entries e WHERE mode=? AND lower(nickname)=lower(?) AND score=? AND NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores r WHERE r.board='arcade' AND r.entry_id=e.id) LIMIT 1").bind(mode,nickname,score).first();
  else if(mode==="knight-maze")row=await db.prepare("SELECT score FROM knight_maze_score_entries e WHERE lower(nickname)=lower(?) AND score=? AND NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores r WHERE r.board='maze' AND r.entry_id=e.id) LIMIT 1").bind(nickname,score).first();
  else {const modes=mode==="sprint"?"('sprint3','sprint5')":"('survival')";row=await db.prepare(`SELECT score FROM puzzle_score_entries e WHERE mode IN ${modes} AND lower(nickname)=lower(?) AND score=? AND NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores r WHERE r.board='puzzle' AND r.entry_id=e.id) LIMIT 1`).bind(nickname,score).first();}
  if(!row||row.score!==score)return json({error:"This leaderboard entry is no longer available. Refresh the page."},404);
  await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_nickname_reports (nickname TEXT PRIMARY KEY COLLATE NOCASE, mode TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS leaderboard_reports (mode TEXT NOT NULL, nickname TEXT NOT NULL COLLATE NOCASE, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(mode,nickname,score))").run();
  const inserted=await db.prepare("INSERT OR IGNORE INTO leaderboard_reports(mode,nickname,score,created_at) VALUES(?,?,?,?)").bind(mode,nickname,score,Date.now()).run();
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
