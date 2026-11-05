import {createAuth} from '../../../lib/auth/config.mjs';
const h={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const send=(data,status=200)=>Response.json(data,{status,headers:h});
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_]{3,24}$/.test(s);
async function current(request,env){if(!env.BETTER_AUTH_SECRET||!env.AUTH_DB)return null;const auth=createAuth(env);const session=await auth.api.getSession({headers:request.headers});return session?.user||null}
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json')||Number(req.headers.get('content-length'))>2048)return null;try{const t=await req.text();return t.length<=2048?JSON.parse(t):null}catch{return null}}
export async function onRequest({request,env}){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/social\/?/,'').replace(/\/$/,'');
 if(!env.AUTH_DB)return send({error:'Community unavailable.'},503);
 if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return send({error:'Origin rejected.'},403);
 try{
 const db=env.AUTH_DB,user=await current(request,env),time=Date.now();
 if(route==='presence'&&request.method==='POST'){if(!user)return send({error:'Sign in first.'},401);await db.prepare('INSERT INTO online_presence(user_id,seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at').bind(user.id,time).run();return send({ok:true})}
 if(route==='directory'&&request.method==='GET'){
  const rows=await db.prepare('SELECT u.username,CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM "user" u LEFT JOIN online_presence p ON p.user_id=u.id WHERE u.username IS NOT NULL ORDER BY u.createdAt DESC LIMIT 100').bind(time-90000).all();
  return send({members:rows.results||[]});
 }
 if(route==='friends'&&request.method==='GET'){
  if(!user)return send({friends:[],authenticated:false});
  const rows=await db.prepare('SELECT u.username,CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM online_friends f JOIN "user" u ON u.id=f.friend_id LEFT JOIN online_presence p ON p.user_id=u.id WHERE f.user_id=? ORDER BY u.username LIMIT 200').bind(time-90000,user.id).all();
  return send({friends:rows.results||[],authenticated:true});
 }
 if(route==='add'&&request.method==='POST'){
  if(!user)return send({error:'Sign in first.'},401);const b=await body(request);if(!valid(b?.username))return send({error:'Invalid username.'},400);
  const other=await db.prepare('SELECT id FROM "user" WHERE lower(username)=lower(?)').bind(b.username).first();if(!other||other.id===user.id)return send({error:'Member not found.'},404);
  await db.prepare('INSERT OR IGNORE INTO online_friends(user_id,friend_id,created_at) VALUES(?,?,?)').bind(user.id,other.id,time).run();return send({ok:true});
 }
 if(route==='remove'&&request.method==='POST'){
  if(!user)return send({error:'Sign in first.'},401);const b=await body(request);if(!valid(b?.username))return send({error:'Invalid username.'},400);
  await db.prepare('DELETE FROM online_friends WHERE user_id=? AND friend_id IN (SELECT id FROM "user" WHERE lower(username)=lower(?))').bind(user.id,b.username).run();return send({ok:true});
 }
 if(route==='challenge'&&request.method==='POST'){
  if(!user)return send({error:'Sign in first.'},401);const b=await body(request);if(!valid(b?.username)||!/^[a-f0-9]{32}$/.test(b?.gameId||''))return send({error:'Invalid challenge.'},400);
  const target=await db.prepare('SELECT id FROM "user" WHERE lower(username)=lower(?)').bind(b.username).first();if(!target||target.id===user.id)return send({error:'Member not found.'},404);
  const game=await db.prepare("SELECT id FROM online_games WHERE id=? AND kind='invite' AND status='waiting' AND created_at>?").bind(b.gameId,time-86400000).first();if(!game)return send({error:'Invitation not available.'},409);
  await db.prepare('INSERT INTO online_challenges(id,from_user,to_user,game_id,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),user.id,target.id,b.gameId,time).run();return send({ok:true});
 }
 if(route==='inbox'&&request.method==='GET'){
  if(!user)return send({challenges:[]});
  const rows=await db.prepare("SELECT c.id,c.game_id AS gameId,u.username AS fromUser FROM online_challenges c JOIN \"user\" u ON u.id=c.from_user JOIN online_games g ON g.id=c.game_id WHERE c.to_user=? AND c.status='pending' AND c.created_at>? AND g.status='waiting' ORDER BY c.created_at DESC LIMIT 30").bind(user.id,time-86400000).all();return send({challenges:rows.results||[]});
 }
 return send({error:'Not found.'},404);
 }catch{return send({error:'Community temporarily unavailable.'},503)}
}
