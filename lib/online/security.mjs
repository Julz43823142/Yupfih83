import ipaddr from 'ipaddr.js';
import {createAuth} from '../auth/config.mjs';
import {keyedDigest} from '../auth/password.mjs';

const encoder=new TextEncoder();
export const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
export const secretHash=async secret=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(secret))));
export const random=()=>crypto.randomUUID().replaceAll('-','');
export const isToken=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
export const validUsername=s=>typeof s==='string'&&/^[a-zA-Z0-9_]{3,24}$/.test(s);
export const validGuest=s=>typeof s==='string'&&/^[a-zA-Z0-9_ ]{1,24}$/.test(s)&&!/^(admin|administrator|mod|moderator|staff|eloscanner|system|support)$/i.test(s.trim());
export const sameOrigin=request=>{const u=new URL(request.url);return request.headers.get('Origin')===u.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site'};
export async function readJSON(request,limit=4096){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||Number(request.headers.get('Content-Length'))>limit)return null;
 const reader=request.body?.getReader();if(!reader)return null;
 try{
  const chunks=[];let total=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;if(total>limit){await reader.cancel();return null}
   chunks.push(value);
  }
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  const data=JSON.parse(new TextDecoder().decode(bytes));
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 }catch{return null}
}
export async function sessionUser(request,env){
 if(typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)throw Error('Authentication unavailable');
 const a=createAuth(env);
 const session=await a.api.getSession({headers:request.headers,query:{disableCookieCache:true}});
 return session?.user?.id&&validUsername(session?.user?.username)?session.user:null;
}
function ipKey(request){
 const url=new URL(request.url);
 if(url.hostname==='localhost'||url.hostname==='127.0.0.1')return 'local-test';
 const raw=request.headers.get('CF-Connecting-IP');
 if(!raw||!ipaddr.isValid(raw))return 'unknown';
 const ip=ipaddr.process(raw);
 return ip.kind()==='ipv6'?ip.parts.slice(0,4).map(n=>n.toString(16)).join(':')+'::/64':ip.toString();
}
export async function rateLimit(env,request,scope,limit,windowMs=60000,identity=''){
 if(!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return false;
 const value=ipKey(request)+'|'+identity;
 const key='online:'+scope+':'+hex(await keyedDigest(env.BETTER_AUTH_SECRET,'online-rate-v1',value));
 const t=Date.now(),expires=t+windowMs;
 const row=await env.AUTH_DB.prepare(`INSERT INTO auth_attempts(key,count,expiresAt) VALUES(?,1,?)
  ON CONFLICT(key) DO UPDATE SET
   count=CASE WHEN expiresAt<=? THEN 1 ELSE count+1 END,
   expiresAt=CASE WHEN expiresAt<=? THEN excluded.expiresAt ELSE expiresAt END
  WHERE expiresAt<=? OR count<? RETURNING count`).bind(key,expires,t,t,t,limit).first();
 return !!row;
}
export const safeError=()=>reply({error:'Service temporarily unavailable.'},503);
