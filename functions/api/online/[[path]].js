import {Chess} from '../../../vendor/chess/chess-1.4.0.mjs';
import {reply,readJSON,rateLimit,sameOrigin,secretHash,random,isToken,validGuest,sessionUser,safeError} from '../../../lib/online/security.mjs';

const gameId=s=>isToken(s);
const time=()=>Date.now();
const turns=JSON.stringify;
function publicGame(g,digest){
 const side=g.white_token===digest?'w':g.black_token===digest?'b':null;
 if(!side)return null;
 return {id:g.id,kind:g.kind,status:g.status,side,white:g.white_name,black:g.black_name,fen:g.fen,
   moves:JSON.parse(g.moves),turn:g.turn,whiteMs:g.white_ms,blackMs:g.black_ms,lastMoveAt:g.last_move_at,result:g.result,serverTime:time()};
}
async function getGame(db,id){return db.prepare('SELECT * FROM online_games WHERE id=?').bind(id).first()}
async function expire(db,g){
 if(g.status!=='active'||!g.last_move_at)return g;
 const elapsed=Math.max(0,time()-g.last_move_at),clock=g.turn==='w'?'white_ms':'black_ms';
 if(elapsed<g[clock])return g;
 const result=g.turn==='w'?'0-1':'1-0';
 await db.prepare("UPDATE online_games SET status='finished',result=?,white_ms=CASE WHEN turn='w' THEN 0 ELSE white_ms END,black_ms=CASE WHEN turn='b' THEN 0 ELSE black_ms END,updated_at=? WHERE id=? AND status='active' AND last_move_at=?").bind(result,time(),g.id,g.last_move_at).run();
 return getGame(db,g.id);
}
async function nameAndAccount(request,env,provided){
 const account=await sessionUser(request,env);
 if(account)return {name:account.username,userId:account.id};
 if(!validGuest(provided))return null;
 return {name:'Guest · '+provided.trim(),userId:null};
}
async function guarded(db,env,request,scope,limit=20,window=60000,identity=''){
 if(!await rateLimit(env,request,scope+':ip',scope==='state'?150:scope==='move'?200:limit,window))return reply({error:'Too many requests. Try again shortly.'},429);
 if(!await rateLimit(env,request,scope,limit,window,identity))return reply({error:'Too many requests. Try again shortly.'},429);
 return null;
}
export async function onRequest({request,env}){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/online\/?/,'').replace(/\/$/,'');
 if(!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return reply({error:'Multiplayer unavailable.'},503);
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!sameOrigin(request))return reply({error:'Request origin rejected.'},403);
 const b=await readJSON(request);
 if(!b)return reply({error:'Invalid JSON request.'},400);
 const db=env.AUTH_DB;
 try{
  if(route==='create'){
   if(!['random','invite'].includes(b.kind))return reply({error:'Invalid game type.'},400);
   const limited=await guarded(db,env,request,'create',6,600000);if(limited)return limited;
   const player=await nameAndAccount(request,env,b.name);if(!player)return reply({error:'Invalid nickname.'},400);
   const secret=random(),digest=await secretHash(secret),id=random(),t=time();
   if(b.kind==='random'){
    const pending=await db.prepare("SELECT id FROM online_games WHERE kind='random' AND status='waiting' AND created_at>? AND (white_user_id IS NULL OR white_user_id<>?) ORDER BY created_at LIMIT 1").bind(t-120000,player.userId||'').first();
    if(pending){
     const updated=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,black_user_id=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND kind='random' AND status='waiting' AND created_at>?").bind(digest,player.name,player.userId,t,t,pending.id,t-120000).run();
     if(updated.meta.changes===1)return reply({id:pending.id,secret,matched:true});
    }
   }
   await db.prepare("INSERT INTO online_games(id,kind,white_token,white_user_id,white_name,fen,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,b.kind,digest,player.userId,player.name,new Chess().fen(),t,t).run();
   // Retention: abandoned lobby games 24h, completed games 30d. No raw IP stored.
   if(Math.random()<0.1){try{
    await db.prepare("UPDATE online_games SET status='finished',result=CASE WHEN turn='w' THEN '0-1' ELSE '1-0' END,white_ms=CASE WHEN turn='w' THEN 0 ELSE white_ms END,black_ms=CASE WHEN turn='b' THEN 0 ELSE black_ms END,updated_at=? WHERE status='active' AND last_move_at<?").bind(t,t-180001).run();
    await db.prepare("DELETE FROM online_challenges WHERE created_at<?").bind(t-86400000).run();
    await db.prepare("DELETE FROM online_friend_requests WHERE created_at<?").bind(t-2592000000).run();
    await db.prepare("DELETE FROM online_presence WHERE seen_at<?").bind(t-86400000).run();
    await db.prepare("DELETE FROM online_games WHERE (status='waiting' AND created_at<?) OR (status='finished' AND updated_at<?)").bind(t-86400000,t-2592000000).run();
    await db.prepare("DELETE FROM auth_attempts WHERE key LIKE 'online:%' AND expiresAt<?").bind(t).run();
   }catch{}}
   return reply({id,secret,matched:false});
  }
  if(route==='join'){
   if(!gameId(b.id))return reply({error:'Invalid invitation.'},400);
   const limited=await guarded(db,env,request,'join',12,600000);if(limited)return limited;
   const player=await nameAndAccount(request,env,b.name);if(!player)return reply({error:'Invalid nickname.'},400);
   const restrictions=await db.prepare("SELECT to_user FROM online_challenges WHERE game_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").bind(b.id).first();
   if(restrictions&&restrictions.to_user!==player.userId)return reply({error:'This challenge is for another account.'},403);
   const secret=random(),digest=await secretHash(secret),t=time();
   const updated=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,black_user_id=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND kind='invite' AND status='waiting' AND created_at>? AND (white_user_id IS NULL OR white_user_id<>?)").bind(digest,player.name,player.userId,t,t,b.id,t-86400000,player.userId||'').run();
   if(updated.meta.changes!==1)return reply({error:'Invitation expired, unavailable, or self-challenge.'},409);
   await db.prepare("UPDATE online_challenges SET status='accepted' WHERE game_id=? AND status='pending'").bind(b.id).run();
   return reply({id:b.id,secret});
  }
  if(!gameId(b.id)||!isToken(b.secret))return reply({error:'Invalid credentials.'},400);
  const digest=await secretHash(b.secret);
  const limited=await guarded(db,env,request,route,route==='state'?80:route==='move'?90:12,60000,digest);if(limited)return limited;
  let g=await getGame(db,b.id);
  if(!g||!publicGame(g,digest))return reply({error:'Game not found.'},404);
  g=await expire(db,g);
  if(route==='state')return reply(publicGame(g,digest));
  if(route==='resign'){
   if(g.status!=='active')return reply({error:'Game is not active.'},409);
   const result=g.white_token===digest?'0-1':'1-0';
   const update=await db.prepare("UPDATE online_games SET status='finished',result=?,updated_at=? WHERE id=? AND status='active'").bind(result,time(),b.id).run();
   if(update.meta.changes!==1)return reply({error:'Game already finished.'},409);
   return reply({ok:true});
  }
  if(route==='move'){
   if(!/^[a-h][1-8]$/.test(b.from||'')||!/^[a-h][1-8]$/.test(b.to||''))return reply({error:'Invalid move.'},400);
   const side=g.white_token===digest?'w':'b';
   if(g.status!=='active'||g.turn!==side)return reply({error:'Not your turn or game finished.'},409);
   const moves=JSON.parse(g.moves);if(!Array.isArray(moves)||moves.length>500)return safeError();
   const board=new Chess();try{for(const san of moves)board.move(san)}catch{return safeError()}
   if(board.fen()!==g.fen)return safeError();
   let resultMove;try{resultMove=board.move({from:b.from,to:b.to,promotion:['q','r','b','n'].includes(b.promotion)?b.promotion:'q'})}catch{return reply({error:'Illegal move.'},400)}
   if(!resultMove)return reply({error:'Illegal move.'},400);
   const elapsed=Math.max(0,time()-g.last_move_at),remaining=Math.max(0,(side==='w'?g.white_ms:g.black_ms)-elapsed);
   if(!remaining)return reply({error:'Time expired.'},409);
   moves.push(resultMove.san);
   const result=board.isCheckmate()?(side==='w'?'1-0':'0-1'):board.isDraw()?'1/2-1/2':null;
   const t=time();
   const updated=await db.prepare("UPDATE online_games SET fen=?,moves=?,turn=?,white_ms=?,black_ms=?,last_move_at=?,status=?,result=?,updated_at=? WHERE id=? AND status='active' AND fen=? AND last_move_at=?").bind(board.fen(),turns(moves),board.turn(),side==='w'?remaining:g.white_ms,side==='b'?remaining:g.black_ms,t,result?'finished':'active',result,t,b.id,g.fen,g.last_move_at).run();
   if(updated.meta.changes!==1)return reply({error:'Position already changed. Retry.'},409);
   return reply({ok:true});
  }
  return reply({error:'Route not found.'},404);
 }catch(error){if(env.ONLINE_TEST_DEBUG==='true')console.error('Online test diagnostics:',error);return safeError()}
}
