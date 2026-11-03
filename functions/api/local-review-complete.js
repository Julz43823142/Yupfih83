import {json} from "../../lib/v87-github.js";
import {issueReviewProof,validateLocalReviewTicket} from "../../lib/sus-auth.js";

// This endpoint signs a CIP interaction ticket; browser-calculated Fair Play
// findings are never trusted or stored as verified server-side results.
export async function onRequestPost({request,env}) {
  if(!env.GITHUB_TOKEN)return json({error:"Review service is not configured."},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"Invalid origin."},403);
  if((request.headers.get("Content-Type")||"").split(";")[0].trim()!=="application/json")
    return json({error:"Expected JSON."},415);
  const declared=Number(request.headers.get("Content-Length")||0);
  if(declared>2048)return json({error:"Request too large."},413);
  let body;
  try{body=await request.json();}catch{return json({error:"Invalid JSON."},400);}
  const username=String(body?.username||"").trim().toLowerCase();
  if(!/^[a-z0-9_-]{3,25}$/.test(username))return json({error:"Invalid username."},400);
  if(!await validateLocalReviewTicket(body?.ticket,username,env.GITHUB_TOKEN))
    return json({error:"Invalid or expired review session."},403);
  return json({sus_proof:await issueReviewProof(username,env.GITHUB_TOKEN)});
}
