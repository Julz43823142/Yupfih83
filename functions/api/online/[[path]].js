import {Chess} from '../../../vendor/chess/chess-1.4.0.mjs';
import {lagCredit,lagGrace,MAX_LAG_PER_GAME_MS} from '../../../lib/online/lag.mjs';
import {reply,readJSON,rateLimitPair,sameOrigin,secretHash,random,isToken,validGuest,sessionUser,safeError} from '../../../lib/online/security.mjs';

const gameId=s=>isToken(s);
const time=()=>Date.now();
const turns=JSON.stringify;
// The Durable Object receives only public game state; it never sees IP addresses,
// login cookies, bearer secrets, or raw request headers.
async function pushState(env,g){
 if(!env.ONLINE_ROOM)return;
 try{
  const room=env.ONLINE_ROOM.get(env.ONLINE_ROOM.idFromName(g.id));
  const state=publicGame(g,g.white_token);
  if(!state)return;
  const {side,...publicState}=state;
  await room.fetch('https://room.internal/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(publicState)});
 }catch(error){
  if(env.ONLINE_TEST_DEBUG==='true')console.error('Optional live push failed:',error);
 }
}
async function announceGame(env,db,id){
 if(!env.ONLINE_ROOM)return;
 const game=await getGame(db,id);
 if(game)await pushState(env,game);
}
function browserIdentity(request){
 const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)elo_chess_browser=([a-f0-9]{32})(?:;|$)/);
 const value=match?match[1]:random();
 const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 return {value,header:match?null:'elo_chess_browser='+value+'; Path=/api/online; HttpOnly; SameSite=Strict; Max-Age=2592000'+secure};
}
function gameReply(data,identity){
 const response=reply(data);
 if(identity.header)response.headers.set('Set-Cookie',identity.header);
 return response;
}
function publicGame(g,digest){
 const side=g.white_token===digest?'w':g.black_token===digest?'b':null;
 if(!side)return null;
 return {id:g.id,kind:g.kind,status:g.status,side,white:g.white_name,black:g.black_name,fen:g.fen,
   moves:JSON.parse(g.moves),turn:g.turn,whiteMs:g.white_ms,blackMs:g.black_ms,lastMoveAt:g.last_move_at,updatedAt:g.updated_at,result:g.result,serverTime:time()};
}
async function getGame(db,id){return db.prepare('SELECT * FROM online_games WHERE id=?').bind(id).first()}
async function expire(db,g){
 if(g.status!=='active'||!g.last_move_at)return g;
 const elapsed=Math.max(0,time()-g.last_move_at),clock=g.turn==='w'?'white_ms':'black_ms';
 const used=g.turn==='w'?g.white_lag_used_ms:g.black_lag_used_ms;
 if(elapsed<g[clock]+lagGrace(used))return g;
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
 // Independent IP and seat budgets can be checked concurrently. Both must
 // pass; we never weaken either rate limit to improve move latency.
 const allowed=await rateLimitPair(env,request,scope+':ip',scope==='state'?150:scope==='move'?200:limit,scope,limit,window,identity);
 if(!allowed)return reply({error:'Too many requests. Try again shortly.'},429);
 return null;
}
export async function onRequest({request,env,waitUntil}){
 const requestStarted=performance.now();
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/online\/?/,'').replace(/\/$/,'');
 if(!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return reply({error:'Multiplayer unavailable.'},503);
 if(!sameOrigin(request))return reply({error:'Request origin rejected.'},403);
 // WebSocket upgrade: authorize the seat before invoking the private room.
 // The bearer secret is transmitted as a WebSocket subprotocol, not in the URL.
 if(route==='live'&&request.method==='GET'){
  if(!env.ONLINE_ROOM)return reply({error:'Realtime unavailable.'},503);
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return reply({error:'Upgrade required.'},426);
  const id=url.searchParams.get('id');
  const protocols=(request.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(v=>v.trim());
  const seat=protocols.find(v=>/^elo-seat-[a-f0-9]{32}$/.test(v));
  if(!isToken(id)||!protocols.includes('elo-chess-v1')||!seat)return reply({error:'Invalid credentials.'},400);
  const digest=await secretHash(seat.slice('elo-seat-'.length));
  try{
   const limited=await guarded(env.AUTH_DB,env,request,'live-connect',12,60000,digest);
   if(limited)return limited;
   const game=await getGame(env.AUTH_DB,id);
   const publicView=game&&publicGame(game,digest);
   if(!publicView)return reply({error:'Game not found.'},404);
   const accountId=publicView.side==='w'?game.white_user_id:game.black_user_id;
   if(accountId&&(await sessionUser(request,env))?.id!==accountId)return reply({error:'Game not found.'},404);
   const room=env.ONLINE_ROOM.get(env.ONLINE_ROOM.idFromName(id));
   // Construct a fresh request. Do NOT forward Cookie, CF-Connecting-IP,
   // Sec-WebSocket-Protocol bearer material or other original headers.
   return room.fetch(new Request('https://room.internal/connect',{
    headers:{Upgrade:'websocket','Sec-WebSocket-Protocol':'elo-chess-v1','X-Authorized-Side':publicView.side}
   }));
  }catch(error){if(env.ONLINE_TEST_DEBUG==='true')console.error('Live connect:',error);return safeError()}
 }
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 const b=await readJSON(request);
 if(!b)return reply({error:'Invalid JSON request.'},400);
 const db=env.AUTH_DB;
 try{
  if(route==='create'){
   if(!['random','invite'].includes(b.kind))return reply({error:'Invalid game type.'},400);
   const limited=await guarded(db,env,request,'create',6,600000);if(limited)return limited;
   const player=await nameAndAccount(request,env,b.name);if(!player)return reply({error:'Invalid nickname.'},400);
   let intended=null;
   if(b.targetUsername!==undefined){
    if(b.kind!=='invite'||!player.userId||typeof b.targetUsername!=='string'||!/^[a-zA-Z0-9_]{3,24}$/.test(b.targetUsername))return reply({error:'Invalid challenge target.'},400);
    const target=await db.prepare('SELECT id FROM "user" WHERE lower(username)=lower(?)').bind(b.targetUsername).first();
    if(!target||target.id===player.userId)return reply({error:'Invalid challenge target.'},404);
    intended=target.id;
   }
   const identity=browserIdentity(request),browserId=await secretHash(identity.value);
   const secret=random(),digest=await secretHash(secret),id=random(),t=time();
   if(b.kind==='random'){
    const pending=await db.prepare("SELECT id FROM online_games WHERE kind='random' AND status='waiting' AND created_at>? AND (white_user_id IS NULL OR white_user_id<>?) AND (white_browser_id IS NULL OR white_browser_id<>?) ORDER BY created_at LIMIT 1").bind(t-120000,player.userId||'',browserId).first();
    if(pending){
     const updated=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,black_user_id=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND kind='random' AND status='waiting' AND created_at>? AND (white_user_id IS NULL OR white_user_id<>?) AND (white_browser_id IS NULL OR white_browser_id<>?)").bind(digest,player.name,player.userId,t,t,pending.id,t-120000,player.userId||'',browserId).run();
     if(updated.meta.changes===1){if(waitUntil)waitUntil(announceGame(env,db,pending.id));else await announceGame(env,db,pending.id);return gameReply({id:pending.id,secret,matched:true},identity);}
    }
   }
   await db.prepare("INSERT INTO online_games(id,kind,white_token,white_user_id,invited_user_id,white_name,fen,created_at,updated_at,white_browser_id) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,b.kind,digest,player.userId,intended,player.name,new Chess().fen(),t,t,browserId).run();
   // Retention: abandoned lobby games 24h, completed games 30d. No raw IP stored.
   if(Math.random()<0.1){try{
    await db.prepare("UPDATE online_games SET status='finished',result=CASE WHEN turn='w' THEN '0-1' ELSE '1-0' END,white_ms=CASE WHEN turn='w' THEN 0 ELSE white_ms END,black_ms=CASE WHEN turn='b' THEN 0 ELSE black_ms END,updated_at=? WHERE status='active' AND last_move_at<?").bind(t,t-180001).run();
    await db.prepare("DELETE FROM online_challenges WHERE created_at<?").bind(t-86400000).run();
    await db.prepare("DELETE FROM online_friend_requests WHERE created_at<?").bind(t-2592000000).run();
    await db.prepare("DELETE FROM online_presence WHERE seen_at<?").bind(t-86400000).run();
    await db.prepare("DELETE FROM online_games WHERE (status='waiting' AND created_at<?) OR (status='finished' AND updated_at<?)").bind(t-86400000,t-2592000000).run();
    await db.prepare("DELETE FROM auth_attempts WHERE key LIKE 'online:%' AND expiresAt<?").bind(t).run();
   }catch{}}
   return gameReply({id,secret,matched:false},identity);
  }
  if(route==='join'){
   if(!gameId(b.id))return reply({error:'Invalid invitation.'},400);
   const limited=await guarded(db,env,request,'join',12,600000);if(limited)return limited;
   const player=await nameAndAccount(request,env,b.name);if(!player)return reply({error:'Invalid nickname.'},400);
   const restrictions=await db.prepare("SELECT to_user FROM online_challenges WHERE game_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").bind(b.id).first();
   if(restrictions&&restrictions.to_user!==player.userId)return reply({error:'This challenge is for another account.'},403);
   const identity=browserIdentity(request),browserId=await secretHash(identity.value);
   const secret=random(),digest=await secretHash(secret),t=time();
   const updated=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,black_user_id=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND kind='invite' AND status='waiting' AND created_at>? AND (white_user_id IS NULL OR white_user_id<>?) AND (invited_user_id IS NULL OR invited_user_id=?) AND (white_browser_id IS NULL OR white_browser_id<>?)").bind(digest,player.name,player.userId,t,t,b.id,t-86400000,player.userId||'',player.userId||'',browserId).run();
   if(updated.meta.changes!==1)return reply({error:'Invitation expired, unavailable, or self-challenge.'},409);
   await db.prepare("UPDATE online_challenges SET status='accepted' WHERE game_id=? AND status='pending'").bind(b.id).run();
   if(waitUntil)waitUntil(announceGame(env,db,b.id));else await announceGame(env,db,b.id);
   return gameReply({id:b.id,secret},identity);
  }
  if(!gameId(b.id)||!isToken(b.secret))return reply({error:'Invalid credentials.'},400);
  const digest=await secretHash(b.secret);
  const limited=await guarded(db,env,request,route,route==='state'?80:route==='move'?90:12,60000,digest);if(limited)return limited;
  const afterGuard=performance.now();
  let g=await getGame(db,b.id);
  const afterGameRead=performance.now();
  // Compare the hashed seat token before parsing any game history. Reconstruct
  // the public game only for requests that actually need its fields.
  if(!g||(g.white_token!==digest&&g.black_token!==digest))return reply({error:'Game not found.'},404);
  // A bearer secret is insufficient for a registered player's seat: also require
  // that account's current session. Guest seats remain capability-token based.
  const accountId=g.white_token===digest?g.white_user_id:g.black_user_id;
  if(accountId){
   const current=await sessionUser(request,env);
   if(current?.id!==accountId)return reply({error:'Game not found.'},404);
  }
  const wasActive=g.status==='active';
  g=await expire(db,g);
  if(wasActive&&g.status==='finished'){if(waitUntil)waitUntil(pushState(env,g));else await pushState(env,g)}
  if(route==='state')return reply(publicGame(g,digest));
  if(route==='resign'){
   if(g.status!=='active')return reply({error:'Game is not active.'},409);
   const result=g.white_token===digest?'0-1':'1-0';
   // A resignation must not overwrite a move committed after the state was read.
   const update=await db.prepare("UPDATE online_games SET status='finished',result=?,updated_at=? WHERE id=? AND status='active' AND fen=? AND last_move_at=?").bind(result,time(),b.id,g.fen,g.last_move_at).run();
   if(update.meta.changes!==1)return reply({error:'Game already finished.'},409);
   if(waitUntil)waitUntil(announceGame(env,db,b.id));else await announceGame(env,db,b.id);
   return reply({ok:true});
  }
  if(route==='move'){
   if(!/^[a-h][1-8]$/.test(b.from||'')||!/^[a-h][1-8]$/.test(b.to||''))return reply({error:'Invalid move.'},400);
   const side=g.white_token===digest?'w':'b';
   if(g.status!=='active'||g.turn!==side)return reply({error:'Not your turn or game finished.'},409);
   const moves=JSON.parse(g.moves);if(!Array.isArray(moves)||moves.length>500)return safeError();
   const board=new Chess();try{for(const san of moves)board.move(san)}catch{return safeError()}
   if(board.fen()!==g.fen)return safeError();
   const afterReplay=performance.now();
   let resultMove;try{resultMove=board.move({from:b.from,to:b.to,promotion:['q','r','b','n'].includes(b.promotion)?b.promotion:'q'})}catch{return reply({error:'Illegal move.'},400)}
   if(!resultMove)return reply({error:'Illegal move.'},400);
   const elapsed=Math.max(0,time()-g.last_move_at);
   const used=side==='w'?g.white_lag_used_ms:g.black_lag_used_ms;
   // A measured WebSocket RTT is a *hint*, not proof: a hostile client can
   // claim a false value. Limit potential clock benefit to 80 ms/move and
   // 1200 ms total per seat in a 3+0 game, stored atomically in D1.
   const credit=lagCredit(elapsed,MAX_LAG_PER_GAME_MS-used,b.networkRttMs);
   const remaining=Math.max(0,(side==='w'?g.white_ms:g.black_ms)-elapsed+credit);
   if(!remaining)return reply({error:'Time expired.'},409);
   moves.push(resultMove.san);
   const result=board.isCheckmate()?(side==='w'?'1-0':'0-1'):board.isDraw()?'1/2-1/2':null;
   const t=time(),nextFen=board.fen(),nextMoves=turns(moves),nextTurn=board.turn();
   const updated=await db.prepare("UPDATE online_games SET fen=?,moves=?,turn=?,white_ms=?,black_ms=?,white_lag_used_ms=?,black_lag_used_ms=?,last_move_at=?,status=?,result=?,updated_at=? WHERE id=? AND status='active' AND fen=? AND last_move_at=?")
    .bind(nextFen,nextMoves,nextTurn,side==='w'?remaining:g.white_ms,side==='b'?remaining:g.black_ms,
      g.white_lag_used_ms+(side==='w'?credit:0),g.black_lag_used_ms+(side==='b'?credit:0),
      t,result?'finished':'active',result,t,b.id,g.fen,g.last_move_at).run();
   if(updated.meta.changes!==1)return reply({error:'Position already changed. Retry.'},409);
   const afterCommit=performance.now();
   // Return the authoritative committed board immediately, avoiding a second
   // browser-to-server round trip after every move.
   const committed={...g,fen:nextFen,moves:nextMoves,turn:nextTurn,white_ms:side==='w'?remaining:g.white_ms,black_ms:side==='b'?remaining:g.black_ms,last_move_at:t,updated_at:t,status:result?'finished':'active',result};
   if(waitUntil)waitUntil(pushState(env,committed));else await pushState(env,committed);
   const response=reply({...publicGame(committed,digest),ok:true});
   // Measure full API processing (authentication, D1, chess validation),
   // independently from client network RTT or opponent delivery latency.
   response.headers.set('Server-Timing',[
    'chess;dur='+(performance.now()-requestStarted).toFixed(2),
    'limit;dur='+(afterGuard-requestStarted).toFixed(2),
    'read;dur='+(afterGameRead-afterGuard).toFixed(2),
    'replay;dur='+(afterReplay-afterGameRead).toFixed(2),
    'commit;dur='+(afterCommit-afterReplay).toFixed(2)
   ].join(', '));
   return response;
  }
  return reply({error:'Route not found.'},404);
 }catch(error){if(env.ONLINE_TEST_DEBUG==='true')console.error('Online test diagnostics:',error);return safeError()}
}
