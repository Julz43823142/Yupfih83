import {reply,rateLimit,readJSON,sessionUser,sameOrigin,isToken,validUsername,secretHash,random,safeError} from '../../../lib/online/security.mjs';
const clock=()=>Date.now();
const member=async(db,name)=>db.prepare('SELECT id,username FROM "user" WHERE lower(username)=lower(?) LIMIT 1').bind(name).first();
const fetchMe=async(request,env)=>sessionUser(request,env);
async function limit(env,req,scope,n,ms){return await rateLimit(env,req,'social:'+scope,n,ms)?null:reply({error:'Too many requests. Please try again later.'},429)}
export async function onRequest({request,env}){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/social\/?/,'').replace(/\/$/,'');
 if(!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return reply({error:'Community unavailable.'},503);
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
 if(request.method==='POST'&&!sameOrigin(request))return reply({error:'Request origin rejected.'},403);
 const b=request.method==='POST'?await readJSON(request,2048):null;
 if(request.method==='POST'&&!b)return reply({error:'Invalid JSON request.'},400);
 const db=env.AUTH_DB,t=clock();
 try{
 if(route==='directory'&&request.method==='GET'){
  const capped=await limit(env,request,'directory',40,60000);if(capped)return capped;
  const results=await db.prepare('SELECT u.username,CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM "user" u LEFT JOIN online_presence p ON p.user_id=u.id WHERE u.username IS NOT NULL ORDER BY u.createdAt DESC LIMIT 100').bind(t-90000).all();
  return reply({members:results.results||[]});
 }
 if(route==='status'&&request.method==='GET'){
  const user=url.searchParams.get('username');if(!validUsername(user))return reply({error:'Invalid username.'},400);
  const capped=await limit(env,request,'status',50,60000);if(capped)return capped;
  const row=await db.prepare('SELECT CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM "user" u LEFT JOIN online_presence p ON p.user_id=u.id WHERE lower(u.username)=lower(?)').bind(t-90000,user).first();
  return row?reply({online:!!row.online}):reply({error:'Not found.'},404);
 }
 if(route==='history'&&request.method==='GET'){
  const name=url.searchParams.get('username'),page=Number(url.searchParams.get('page')||0);
  if(!validUsername(name)||!Number.isSafeInteger(page)||page<0||page>40)return reply({error:'Invalid pagination.'},400);
  const capped=await limit(env,request,'history',30,60000);if(capped)return capped;
  const who=await member(db,name);if(!who)return reply({games:[],total:0});
  const count=await db.prepare("SELECT COUNT(*) AS total FROM online_games WHERE status='finished' AND (white_user_id=? OR black_user_id=?)").bind(who.id,who.id).first();
  const rows=await db.prepare("SELECT id,white_name AS white,black_name AS black,result,kind,updated_at AS finishedAt,moves FROM online_games WHERE status='finished' AND (white_user_id=? OR black_user_id=?) ORDER BY updated_at DESC LIMIT 25 OFFSET ?").bind(who.id,who.id,page*25).all();
  return reply({games:(rows.results||[]).map(g=>({...g,moves:JSON.parse(g.moves).length})),total:count?.total||0,page});
 }
 if(route==='public-friends'&&request.method==='GET'){
  const username=url.searchParams.get('username');if(!validUsername(username))return reply({error:'Invalid username.'},400);
  const capped=await limit(env,request,'public-friends',30,60000);if(capped)return capped;
  const who=await member(db,username);if(!who)return reply({friends:[]});
  const rows=await db.prepare('SELECT u.username,CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM online_friends f JOIN "user" u ON u.id=f.friend_id LEFT JOIN online_presence p ON p.user_id=u.id WHERE f.user_id=? ORDER BY u.username LIMIT 200').bind(t-90000,who.id).all();
  return reply({friends:rows.results||[]});
 }
 if(route==='game'&&request.method==='GET'){
  const id=url.searchParams.get('id');if(!isToken(id))return reply({error:'Invalid game ID.'},400);
  const capped=await limit(env,request,'public-game',40,60000);if(capped)return capped;
  const g=await db.prepare("SELECT id,white_name AS white,black_name AS black,result,kind,moves,updated_at AS finishedAt FROM online_games WHERE id=? AND status='finished'").bind(id).first();
  if(!g)return reply({error:'Game not found.'},404);
  const moves=JSON.parse(g.moves);return reply({id:g.id,white:g.white,black:g.black,result:g.result,kind:g.kind,moves,finishedAt:g.finishedAt});
 }
 const capped=await limit(env,request,request.method==='POST'?route:'read',route==='presence'?8:route==='challenge'?6:route==='add'?8:30,route==='presence'?60000:600000);if(capped)return capped;
 const me=await fetchMe(request,env);
 if(route==='presence'&&request.method==='POST'){
  if(!me)return reply({error:'Sign in first.'},401);
  await db.prepare('INSERT INTO online_presence(user_id,seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at').bind(me.id,t).run();return reply({ok:true});
 }
 if(route==='friends'&&request.method==='GET'){
  if(!me)return reply({friends:[],requests:[],authenticated:false});
  const friends=await db.prepare('SELECT u.username,CASE WHEN p.seen_at>? THEN 1 ELSE 0 END AS online FROM online_friends f JOIN "user" u ON u.id=f.friend_id LEFT JOIN online_presence p ON p.user_id=u.id WHERE f.user_id=? ORDER BY u.username LIMIT 200').bind(t-90000,me.id).all();
  const requests=await db.prepare("SELECT r.id,u.username AS fromUser FROM online_friend_requests r JOIN \"user\" u ON u.id=r.from_user WHERE r.to_user=? AND r.status='pending' ORDER BY r.created_at DESC LIMIT 30").bind(me.id).all();
  return reply({friends:friends.results||[],requests:requests.results||[],authenticated:true});
 }
 if(!me)return reply({error:'Sign in first.'},401);
 if(route==='add'&&request.method==='POST'){
  if(!validUsername(b.username))return reply({error:'Invalid username.'},400);
  const other=await member(db,b.username);if(!other||other.id===me.id)return reply({error:'Member not found.'},404);
  const already=await db.prepare('SELECT 1 AS yes FROM online_friends WHERE user_id=? AND friend_id=?').bind(me.id,other.id).first();
  if(already)return reply({ok:true,already:true});
  await db.prepare("INSERT INTO online_friend_requests(id,from_user,to_user,created_at,status) VALUES(?,?,?,?,'pending') ON CONFLICT(from_user,to_user) DO UPDATE SET status='pending',created_at=excluded.created_at").bind(random(),me.id,other.id,t).run();
  return reply({ok:true,pending:true});
 }
 if(route==='friend-respond'&&request.method==='POST'){
  if(!isToken(b.id)||!['accept','decline'].includes(b.action))return reply({error:'Invalid request.'},400);
  const item=await db.prepare("SELECT from_user FROM online_friend_requests WHERE id=? AND to_user=? AND status='pending'").bind(b.id,me.id).first();
  if(!item)return reply({error:'Request not available.'},404);
  const changed=await db.prepare("UPDATE online_friend_requests SET status=? WHERE id=? AND to_user=? AND status='pending'").bind(b.action==='accept'?'accepted':'declined',b.id,me.id).run();
  if(changed.meta.changes!==1)return reply({error:'Request already handled.'},409);
  if(b.action==='accept')await db.batch([
   db.prepare('INSERT OR IGNORE INTO online_friends(user_id,friend_id,created_at) VALUES(?,?,?)').bind(me.id,item.from_user,t),
   db.prepare('INSERT OR IGNORE INTO online_friends(user_id,friend_id,created_at) VALUES(?,?,?)').bind(item.from_user,me.id,t)
  ]);
  return reply({ok:true});
 }
 if(route==='remove'&&request.method==='POST'){
  if(!validUsername(b.username))return reply({error:'Invalid username.'},400);
  const other=await member(db,b.username);if(!other)return reply({error:'Member not found.'},404);
  await db.batch([
   db.prepare('DELETE FROM online_friends WHERE user_id=? AND friend_id=?').bind(me.id,other.id),
   db.prepare('DELETE FROM online_friends WHERE user_id=? AND friend_id=?').bind(other.id,me.id)
  ]);return reply({ok:true});
 }
 if(route==='challenge'&&request.method==='POST'){
  if(!validUsername(b.username)||!isToken(b.gameId)||!isToken(b.gameSecret))return reply({error:'Invalid challenge.'},400);
  const target=await member(db,b.username);if(!target||target.id===me.id)return reply({error:'Member not found.'},404);
  const digest=await secretHash(b.gameSecret);
  const game=await db.prepare("SELECT id FROM online_games WHERE id=? AND kind='invite' AND white_user_id=? AND white_token=? AND status='waiting' AND created_at>?").bind(b.gameId,me.id,digest,t-86400000).first();
  if(!game)return reply({error:'Cannot challenge with a game you do not own.'},403);
  const existing=await db.prepare("SELECT id FROM online_challenges WHERE game_id=? AND status='pending'").bind(b.gameId).first();
  if(existing)return reply({error:'This game already has a challenge.'},409);
  await db.prepare("INSERT INTO online_challenges(id,from_user,to_user,game_id,created_at,status) VALUES(?,?,?,?,?,'pending')").bind(random(),me.id,target.id,b.gameId,t).run();return reply({ok:true});
 }
 if(route==='inbox'&&request.method==='GET'){
  const rows=await db.prepare("SELECT c.id,c.game_id AS gameId,u.username AS fromUser FROM online_challenges c JOIN \"user\" u ON u.id=c.from_user JOIN online_games g ON g.id=c.game_id WHERE c.to_user=? AND c.status='pending' AND c.created_at>? AND g.status='waiting' ORDER BY c.created_at DESC LIMIT 30").bind(me.id,t-86400000).all();
  return reply({challenges:rows.results||[]});
 }
 return reply({error:'Route not found.'},404);
 }catch{return safeError()}
}
