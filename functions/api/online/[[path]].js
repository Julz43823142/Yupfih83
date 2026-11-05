import {Chess} from '../../../vendor/chess/chess-1.4.0.mjs';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const validName=s=>typeof s==='string'&&s.length>=1&&s.length<=24&&/^[a-zA-Z0-9_ ]+$/.test(s)&&!/^(admin|moderator|eloscanner|staff)$/i.test(s.trim());
const now=()=>Date.now();
const random=()=>crypto.randomUUID().replaceAll('-','');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
async function json(request){if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length'))>4096)return null;try{const s=await request.text();return s.length<=4096?JSON.parse(s):null}catch{return null}}
function view(g,token){const side=g.white_token===token?'w':g.black_token===token?'b':null;if(!side)return null;return {id:g.id,status:g.status,kind:g.kind,side,white:g.white_name,black:g.black_name,fen:g.fen,moves:JSON.parse(g.moves),turn:g.turn,whiteMs:g.white_ms,blackMs:g.black_ms,lastMoveAt:g.last_move_at,result:g.result};}
async function expire(g,db){if(g.status!=='active'||!g.last_move_at)return g;const elapsed=Math.max(0,now()-g.last_move_at);const key=g.turn==='w'?'white_ms':'black_ms';if(elapsed<g[key])return g;const result=g.turn==='w'?'0-1':'1-0';await db.prepare('UPDATE online_games SET status=\'finished\', result=?, '+key+'=0,updated_at=? WHERE id=? AND status=\'active\' AND last_move_at=?').bind(result,now(),g.id,g.last_move_at).run();return await db.prepare('SELECT * FROM online_games WHERE id=?').bind(g.id).first();}
export async function onRequest({request,env,params}){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/online\/?/,'').replace(/\/$/,'');
 if(!env.AUTH_DB)return reply({error:'Multiplayer database is not configured.'},503);
 if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return reply({error:'Origin rejected.'},403);
 try{
  const db=env.AUTH_DB;
  if(route==='create'&&request.method==='POST'){
   const body=await json(request);if(!body||!['random','invite'].includes(body.kind)||!validName(body.name))return reply({error:'Invalid game request.'},400);
   const name=body.name.trim(),secret=random(),token=await hash(secret),id=random(),time=now();
   if(body.kind==='random'){
    const pending=await db.prepare("SELECT id FROM online_games WHERE kind='random' AND status='waiting' AND created_at>? ORDER BY created_at LIMIT 1").bind(time-120000).first();
    if(pending){
     const result=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND status='waiting' AND white_token<>?").bind(token,name,time,time,pending.id,token).run();
     if(result.meta.changes===1)return reply({id:pending.id,secret,matched:true});
    }
   }
   await db.prepare("INSERT INTO online_games(id,kind,white_token,white_name,fen,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id,body.kind,token,name,new Chess().fen(),time,time).run();
   return reply({id,secret,matched:false});
  }
  if(route==='join'&&request.method==='POST'){
   const body=await json(request);if(!body||!validName(body.name)||!(/^[a-f0-9]{32}$/.test(body.id)))return reply({error:'Invalid invitation.'},400);
   const secret=random(),token=await hash(secret),time=now();
   const result=await db.prepare("UPDATE online_games SET black_token=?,black_name=?,status='active',last_move_at=?,updated_at=? WHERE id=? AND kind='invite' AND status='waiting' AND created_at>?").bind(token,body.name.trim(),time,time,body.id,time-86400000).run();
   if(result.meta.changes!==1)return reply({error:'Invitation expired or already accepted.'},409);
   return reply({id:body.id,secret});
  }
  if(route==='state'&&request.method==='GET'){
   const id=url.searchParams.get('id'),secret=url.searchParams.get('secret');if(!/^[a-f0-9]{32}$/.test(id||'')||!/^[a-f0-9]{32}$/.test(secret||''))return reply({error:'Invalid credentials.'},400);
   const token=await hash(secret);let g=await db.prepare('SELECT * FROM online_games WHERE id=?').bind(id).first();if(!g||!view(g,token))return reply({error:'Game not found.'},404);g=await expire(g,db);return reply(view(g,token));
  }
  if(route==='move'&&request.method==='POST'){
   const b=await json(request);if(!b||!/^[a-f0-9]{32}$/.test(b.id||'')||!/^[a-f0-9]{32}$/.test(b.secret||'')||!/^[a-h][1-8]$/.test(b.from||'')||!/^[a-h][1-8]$/.test(b.to||''))return reply({error:'Invalid move.'},400);
   const token=await hash(b.secret);let g=await db.prepare('SELECT * FROM online_games WHERE id=?').bind(b.id).first();if(!g)return reply({error:'Not found.'},404);g=await expire(g,db);const side=g.white_token===token?'w':g.black_token===token?'b':null;if(!side||g.status!=='active'||g.turn!==side)return reply({error:'Not your turn.'},409);
   const chess=new Chess(g.fen);let move;try{move=chess.move({from:b.from,to:b.to,promotion:['q','r','b','n'].includes(b.promotion)?b.promotion:'q'})}catch{return reply({error:'Illegal move.'},400)}
   if(!move)return reply({error:'Illegal move.'},400);
   const elapsed=Math.max(0,now()-g.last_move_at),remaining=Math.max(0,(side==='w'?g.white_ms:g.black_ms)-elapsed);if(remaining===0)return reply({error:'Time expired.'},409);
   const moves=JSON.parse(g.moves);moves.push(move.san);
   const result=chess.isCheckmate()?(side==='w'?'1-0':'0-1'):chess.isDraw()?'1/2-1/2':null;
   const t=now();
   const update=await db.prepare("UPDATE online_games SET fen=?,moves=?,turn=?,white_ms=?,black_ms=?,last_move_at=?,status=?,result=?,updated_at=? WHERE id=? AND status='active' AND fen=? AND last_move_at=?").bind(chess.fen(),JSON.stringify(moves),chess.turn(),side==='w'?remaining:g.white_ms,side==='b'?remaining:g.black_ms,t,result?'finished':'active',result,t,g.id,g.fen,g.last_move_at).run();
   if(update.meta.changes!==1)return reply({error:'Position changed. Refresh and retry.'},409);
   return reply({ok:true});
  }
  if(route==='resign'&&request.method==='POST'){
   const b=await json(request);if(!b||!/^[a-f0-9]{32}$/.test(b.id||'')||!/^[a-f0-9]{32}$/.test(b.secret||''))return reply({error:'Invalid request.'},400);
   const token=await hash(b.secret),g=await db.prepare('SELECT * FROM online_games WHERE id=?').bind(b.id).first();
   if(!g||![g.white_token,g.black_token].includes(token))return reply({error:'Not found.'},404);
   const result=g.white_token===token?'0-1':'1-0';
   await db.prepare("UPDATE online_games SET status='finished',result=?,updated_at=? WHERE id=? AND status='active'").bind(result,now(),b.id).run();return reply({ok:true});
  }
  return reply({error:'Not found.'},404);
 }catch(e){return reply({error:'Multiplayer temporarily unavailable.'},503)}
}
