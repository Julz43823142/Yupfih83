import {json} from "../../../lib/v87-github.js";
import {getVoter,validateReviewProof} from "../../../lib/sus-auth.js";

const usernameFrom=params=>{
  const name=String(params.username||"").toLowerCase();
  return /^[a-z0-9_-]{3,25}$/.test(name)?name:null;
};
function guardedResponse(data,status=200,cookie=null){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  if(cookie)headers["Set-Cookie"]=cookie;
  return new Response(JSON.stringify(data),{status,headers});
}
async function state(env,username,voter){
  const count=await env.SUS_DB.prepare(
    "SELECT COUNT(*) AS total FROM sus_votes WHERE username = ?"
  ).bind(username).first();
  const voted=await env.SUS_DB.prepare(
    "SELECT 1 AS voted FROM sus_votes WHERE username = ? AND voter_id = ? LIMIT 1"
  ).bind(username,voter).first();
  return {username,count:Number(count?.total||0),voted:!!voted};
}
export async function onRequestGet({request,params,env}){
  const username=usernameFrom(params);
  if(!username)return json({error:"Invalid username"},400);
  if(!env.SUS_DB||!env.GITHUB_TOKEN)return json({error:"Voting database not configured"},503);
  try {
    const voter=await getVoter(request,env.GITHUB_TOKEN);
    return guardedResponse(await state(env,username,voter.id),200,voter.cookie);
  }catch{
    return json({error:"Unable to load votes"},503);
  }
}
export async function onRequestPost({request,params,env}){
  const username=usernameFrom(params);
  if(!username)return json({error:"Invalid username"},400);
  if(!env.SUS_DB||!env.GITHUB_TOKEN)return json({error:"Voting database not configured"},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"Invalid origin"},403);
  if((request.headers.get("Content-Type")||"").split(";")[0].trim()!=="application/json")
    return json({error:"Expected JSON"},415);
  let body;
  try {body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(!await validateReviewProof(body?.proof,username,env.GITHUB_TOKEN))
    return json({error:"Finish a player analysis before voting"},403);
  try {
    const voter=await getVoter(request,env.GITHUB_TOKEN);
    // Unique composite key prevents duplicate clicks or simultaneous requests.
    const insert=await env.SUS_DB.prepare(
      "INSERT OR IGNORE INTO sus_votes (username,voter_id) VALUES (?,?)"
    ).bind(username,voter.id).run();
    const current=await state(env,username,voter.id);
    return guardedResponse({...current,new_vote:(insert.meta?.changes||0)>0},200,voter.cookie);
  }catch{
    return json({error:"Unable to register the vote"},503);
  }
}

export async function onRequestDelete({request,params,env}){
  const username=usernameFrom(params);
  if(!username)return json({error:"Invalid username"},400);
  if(!env.SUS_DB||!env.GITHUB_TOKEN)return json({error:"Voting database not configured"},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"Invalid origin"},403);
  try{
    const voter=await getVoter(request,env.GITHUB_TOKEN);
    await env.SUS_DB.prepare("DELETE FROM sus_votes WHERE username = ? AND voter_id = ?").bind(username,voter.id).run();
    return guardedResponse(await state(env,username,voter.id),200,voter.cookie);
  }catch{return json({error:"Unable to remove vote"},503);}
}
