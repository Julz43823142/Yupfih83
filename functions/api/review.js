import {json} from "../../lib/v87-github.js";
import {issueLocalReviewTicket} from "../../lib/sus-auth.js";

// Atomic sliding 10-minute quota, shared by all Cloudflare instances.
// We store a keyed digest instead of the visitor's raw IP address.
async function reserveLocalReview(request,env){
  if(!env.SUS_DB||!env.GITHUB_TOKEN)return {error:"Review quota unavailable.",status:503};
  const ip=request.headers.get("CF-Connecting-IP");
  if(!ip)return {error:"Unable to check your review limit.",status:403};
  const secret=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.GITHUB_TOKEN),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=await crypto.subtle.sign("HMAC",secret,new TextEncoder().encode(ip));
  const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
  const now=Date.now();
  await env.SUS_DB.prepare("CREATE TABLE IF NOT EXISTS review_rate_events (id TEXT PRIMARY KEY, identity TEXT NOT NULL, at_ms INTEGER NOT NULL)").run();
  await env.SUS_DB.prepare("CREATE INDEX IF NOT EXISTS idx_review_rate_events_ip_time ON review_rate_events (identity,at_ms)").run();
  const entry=await env.SUS_DB.prepare(
    "INSERT INTO review_rate_events(id,identity,at_ms) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM review_rate_events WHERE identity=? AND at_ms>?)<15 RETURNING id"
  ).bind(crypto.randomUUID(),digest,now,digest,now-600000).first();
  if(!entry)return {error:"Maximum 15 reviews per 10 minutes. Try again later.",status:429};
  // Remove old events without doing an unbounded cleanup on every request.
  if(Math.random()<0.03){
    try{await env.SUS_DB.prepare("DELETE FROM review_rate_events WHERE at_ms<?").bind(now-86400000).run();}catch{}
  }
  return null;
}

export async function onRequestPost({request,env}){
  if(!env.GITHUB_TOKEN)return json({error:"Review service is not configured."},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"Origin not allowed."},403);
  if((request.headers.get("Content-Type")||"").split(";")[0].trim()!=="application/json")
    return json({error:"Expected JSON."},415);
  const size=Number(request.headers.get("Content-Length")||0);
  if(size>2048)return json({error:"Request too large."},413);
  let body;
  try{body=await request.json();}catch{return json({error:"Invalid request."},400);}
  const username=String(body?.username||"").trim().toLowerCase();
  if(!/^[a-z0-9_-]{3,25}$/.test(username))
    return json({error:"Invalid Chess.com username."},400);
  try{
    const quota=await reserveLocalReview(request,env);
    if(quota)return json({error:quota.error},quota.status);
    return json({
      mode:"browser-v87",
      state:"ready",
      ticket:await issueLocalReviewTicket(username,env.GITHUB_TOKEN)
    },202);
  }catch(error){
    console.error("Local review limit unavailable",error);
    return json({error:"Review service temporarily unavailable."},503);
  }
}
