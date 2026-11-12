import {requireAdmin,adminHeaders,adminReply} from '../../../lib/auth/admin-access.mjs';

// Each account has exactly three independent, server-side save slots.
// The same authenticated user id is applied to every read and write.
const allowed=new Set(['A','B','C']);
const scenes=new Set(['intro','cell','sewer','forest','watchtower','village','finished']);
const headers={...adminHeaders,'Content-Type':'application/json; charset=utf-8'};
const table=async db=>db.prepare(`CREATE TABLE IF NOT EXISTS fallen_king_saves (
 user_id TEXT NOT NULL,
 slot TEXT NOT NULL CHECK(slot IN ('A','B','C')),
 data TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,slot)
)`).run();

function checkData(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
 const c=payload.chapter;
 if(!c||!scenes.has(c.scene)||!Number.isInteger(c.step)||c.step<0||c.step>12||
    !c.flags||typeof c.flags!=='object'||Array.isArray(c.flags)||
    !Array.isArray(c.coins)||c.coins.length>2)return false;
 if(c.position){
  const {x,y,facing}=c.position;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>90||y<0||y>60||
    !['up','down','left','right'].includes(facing))return false;
 }
 return true;
}
export async function onRequestGet({request,env}){
 const auth=await requireAdmin({request,env});
 if(auth instanceof Response)return auth;
 try{
  await table(env.AUTH_DB);
  const user=auth.session.user.id,slot=new URL(request.url).searchParams.get('slot');
  if(slot!==null){
   if(!allowed.has(slot))return adminReply('Invalid slot.',400);
   const item=await env.AUTH_DB.prepare('SELECT data,updated_at FROM fallen_king_saves WHERE user_id=? AND slot=?').bind(user,slot).first();
   return Response.json(item?{slot,savedAt:item.updated_at,save:JSON.parse(item.data)}:{slot,save:null},{headers});
  }
  const list=await env.AUTH_DB.prepare('SELECT slot,updated_at,data FROM fallen_king_saves WHERE user_id=?').bind(user).all();
  const slots=Object.fromEntries([...allowed].map(s=>[s,null]));
  for(const item of list.results||[]){
   const data=JSON.parse(item.data);
   slots[item.slot]={savedAt:item.updated_at,scene:data.chapter.scene,step:data.chapter.step};
  }
  return Response.json({slots},{headers});
 }catch{return adminReply('Save storage unavailable.',503);}
}
export async function onRequestPut({request,env}){
 const auth=await requireAdmin({request,env});
 if(auth instanceof Response)return auth;
 const slot=new URL(request.url).searchParams.get('slot');
 if(!allowed.has(slot))return adminReply('Invalid slot.',400);
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return adminReply('JSON required.',415);
 if(Number(request.headers.get('Content-Length'))>24576)return adminReply('Save too large.',413);
 try{
  const text=await request.text();
  if(text.length>24576)return adminReply('Save too large.',413);
  const payload=JSON.parse(text);
  if(!checkData(payload))return adminReply('Invalid game save.',400);
  await table(env.AUTH_DB);
  await env.AUTH_DB.prepare(`INSERT INTO fallen_king_saves(user_id,slot,data,updated_at)
   VALUES(?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(user_id,slot) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP`)
   .bind(auth.session.user.id,slot,JSON.stringify(payload)).run();
  return Response.json({ok:true,slot},{headers});
 }catch{return adminReply('Unable to save game.',503);}
}
