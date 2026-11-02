import {json} from "../../../lib/v87-github.js";

// Real totals only, backed by the same D1 votes as the player-level SUS button.
export async function onRequestGet({request,env}) {
  if(!env.SUS_DB)return json({error:"SUS leaderboard is not available yet."},503);
  try {
    const limit=new URL(request.url).searchParams.get("limit")==="100"?100:get("limit")==="10"?10:5;
    let data;
    try{
      data=await env.SUS_DB.prepare("SELECT v.username, COUNT(*) AS votes, (SELECT r.priority FROM sus_recent_reviews r WHERE r.username=v.username LIMIT 1) AS priority, (SELECT 1 FROM sus_latest_reports l WHERE l.username=v.username LIMIT 1) AS has_report FROM sus_votes v GROUP BY v.username ORDER BY votes DESC, v.username ASC LIMIT ?").bind(limit).all();
    }catch{
      data=await env.SUS_DB.prepare("SELECT username, COUNT(*) AS votes, NULL AS priority, NULL AS has_report FROM sus_votes GROUP BY username ORDER BY votes DESC, username ASC LIMIT ?").bind(limit).all();
    }
    return json({players:(data.results||[]).map(row=>({
      username:String(row.username),votes:Number(row.votes||0),priority:row.priority||null,has_report:!!row.has_report
    }))});
  }catch {
    return json({error:"Unable to retrieve SUS rankings."},503);
  }
}