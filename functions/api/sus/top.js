import {json} from "../../../lib/v87-github.js";

// Real totals only, backed by the same D1 votes as the player-level SUS button.
export async function onRequestGet({request,env}) {
  if(!env.SUS_DB)return json({error:"SUS leaderboard is not available yet."},503);
  try {
    const limit=new URL(request.url).searchParams.get("limit")==="100"?100:5;
    const data=await env.SUS_DB.prepare(
      "SELECT username, COUNT(*) AS votes FROM sus_votes GROUP BY username ORDER BY votes DESC, username ASC LIMIT ?"
    ).bind(limit).all();
    return json({players:(data.results||[]).map(row=>({
      username:String(row.username),votes:Number(row.votes||0)
    }))});
  }catch {
    return json({error:"Unable to retrieve SUS rankings."},503);
  }
}