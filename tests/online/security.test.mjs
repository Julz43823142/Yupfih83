import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../auth/fixture.mjs';
import {readFileSync} from 'node:fs';
import {onRequest as gameApi} from '../../functions/api/online/[[path]].js';
import {onRequest as socialApi} from '../../functions/api/social/[[path]].js';

const ORIGIN='http://localhost:8788',secret='LOCAL-TEST-ONLY-never-use-in-production-1234567890';
function databaseWithOnline(){
 const db=database();
 for(const n of ['0003_online_chess.sql','0004_social.sql'])db.sqlite.exec(readFileSync(new URL('../../migrations/auth/'+n,import.meta.url),'utf8'));
 db.close=()=>db.sqlite.close();return db;
}
function api(db,path,data={},options={}){
 const origin=options.origin||ORIGIN;
 const req=new Request(origin+'/api/'+(options.social?'social':'online')+'/'+path,{method:options.method||'POST',headers:{'Origin':options.crossOrigin?'https://attacker.invalid':origin,'Content-Type':'application/json','CF-Connecting-IP':options.ip||'203.0.113.40',...(options.cookie?{'Cookie':options.cookie}:{})},body:options.method==='GET'?undefined:JSON.stringify(data)});
 return (options.social?socialApi:gameApi)({request:req,env:{AUTH_DB:db,BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:ORIGIN,ONLINE_TEST_DEBUG:'true'}});
}
async function call(db,path,data,options){const r=await api(db,path,data,options);return {status:r.status,data:await r.json()}}
async function create(db,kind='random',name='Visitor'){const a=await call(db,'create',{kind,name});assert.equal(a.status,200,JSON.stringify(a));return a.data}
async function state(db,player){return call(db,'state',{id:player.id,secret:player.secret})}
async function move(db,player,from,to,promotion){return call(db,'move',{id:player.id,secret:player.secret,from,to,promotion})}
async function pair(db){const w=await create(db);const b=await create(db);assert.equal(w.id,b.id);return [w,b]}
test('CSRF/method/body guards, guest identity isolation and secret authorization',async()=>{
 const db=databaseWithOnline();try{
  assert.equal((await call(db,'create',{kind:'random',name:'Visitor'},{crossOrigin:true})).status,403);
  assert.equal((await call(db,'create',{kind:'random',name:'Visitor'},{method:'GET'})).status,405);
  assert.equal((await call(db,'create',{kind:'random',name:'Admin'})).status,400);
  const p=await create(db,'invite','Visitor');
  const s=await state(db,p);assert.equal(s.status,200);assert.equal(s.data.white,'Guest · Visitor');
  assert.ok(!JSON.stringify(s.data).includes('white_token'));assert.ok(!JSON.stringify(s.data).includes(p.secret));
  assert.equal((await call(db,'state',{id:p.id,secret:'0'.repeat(32)})).status,404);
  assert.equal((await call(db,'join',{id:'a'.repeat(32),name:'Visitor'})).status,409);
  assert.equal((await call(db,'add',{username:'victim'},{social:true})).status,401);
 }finally{db.close()}
});
test('2 players, authoritative legal moves, wrong turn, optimistic concurrency and resign',async()=>{
 const db=databaseWithOnline();try{
  const [w,b]=await pair(db);
  assert.equal((await move(db,b,'e7','e5')).status,409);
  assert.equal((await move(db,w,'e2','e5')).status,400);
  assert.equal((await move(db,w,'e2','e4')).status,200);
  assert.equal((await move(db,w,'d2','d4')).status,409);
  assert.equal((await move(db,b,'e7','e5')).status,200);
  assert.deepEqual((await state(db,w)).data.moves,['e4','e5']);
  const attempt=await Promise.all([move(db,w,'g1','f3'),move(db,w,'g1','f3')]);
  assert.deepEqual(attempt.map(r=>r.status).sort(),[200,409]);
  assert.equal((await state(db,w)).data.moves.length,3);
  assert.equal((await call(db,'resign',{id:w.id,secret:w.secret})).status,200);
  assert.equal((await state(db,b)).data.result,'0-1');
  assert.equal((await move(db,b,'b8','c6')).status,409);
 }finally{db.close()}
});
test('invite is single-use, checkmate, threefold repetition, and timeouts',async()=>{
 const db=databaseWithOnline();try{
  const a=await create(db,'invite');const invited=await call(db,'join',{id:a.id,name:'Friend'});assert.equal(invited.status,200);
  assert.equal((await call(db,'join',{id:a.id,name:'Late'})).status,409);
  const b=invited.data;
  for(const [p,f,t] of [[a,'f2','f3'],[b,'e7','e5'],[a,'g2','g4'],[b,'d8','h4']])assert.equal((await move(db,p,f,t)).status,200);
  const checkmate=await state(db,a);assert.equal(checkmate.data.status,'finished');assert.equal(checkmate.data.result,'0-1');
  const [w,z]=await pair(db);
  for(let i=0;i<2;i++)for(const [p,f,t] of [[w,'g1','f3'],[z,'g8','f6'],[w,'f3','g1'],[z,'f6','g8']])assert.equal((await move(db,p,f,t)).status,200);
  assert.equal((await state(db,w)).data.result,'1/2-1/2');
  const [x,y]=await pair(db);
  db.sqlite.prepare('UPDATE online_games SET last_move_at=? WHERE id=?').run(Date.now()-190000,x.id);
  const timeout=await state(db,x);assert.equal(timeout.data.status,'finished');assert.equal(timeout.data.result,'0-1');
 }finally{db.close()}
});
test('atomic request budgets stop mass lobby creation and repeated secret polling',async()=>{
 const db=databaseWithOnline();try{
  for(let i=0;i<6;i++)assert.equal((await call(db,'create',{kind:'invite',name:'Test'})).status,200);
  assert.equal((await call(db,'create',{kind:'invite',name:'Test'})).status,429);
  const id=db.sqlite.prepare("SELECT id FROM online_games LIMIT 1").get().id;
  const unknown='f'.repeat(32);
  for(let i=0;i<80;i++)await call(db,'state',{id,secret:unknown});
  const limited=await call(db,'state',{id,secret:unknown});assert.equal(limited.status,429);
 }finally{db.close()}
});

test('stress: concurrent join attempts permit exactly one opponent',async()=>{
 const db=databaseWithOnline();try{
  const host=await create(db,'invite','Host');
  const attempts=await Promise.all(Array.from({length:12},(_,i)=>call(db,'join',{id:host.id,name:'Player'+i})));
  assert.equal(attempts.filter(x=>x.status===200).length,1);
  assert.equal(attempts.filter(x=>x.status===409).length,11);
  assert.equal((await state(db,host)).data.status,'active');
 }finally{db.close()}
});
test('stress: duplicate simultaneous moves never advance twice',async()=>{
 const db=databaseWithOnline();try{
  const [white,black]=await pair(db);
  const attempts=await Promise.all(Array.from({length:16},()=>move(db,white,'e2','e4')));
  assert.equal(attempts.filter(x=>x.status===200).length,1);
  assert.equal(attempts.filter(x=>x.status===409).length,15);
  assert.deepEqual((await state(db,black)).data.moves,['e4']);
 }finally{db.close()}
});


test('stale resignation is rejected after the board changes',async()=>{
 const db=databaseWithOnline();try{
  const [white,black]=await pair(db);
  const original=db.prepare.bind(db);
  let injected=false;
  db.prepare=function(sql){
   if(!injected&&sql.includes("UPDATE online_games SET status='finished',result=?")&&sql.includes("AND fen=?")){
    injected=true;
    db.sqlite.prepare("UPDATE online_games SET last_move_at=last_move_at+1 WHERE id=?").run(white.id);
   }
   return original(sql);
  };
  const result=await call(db,'resign',{id:white.id,secret:white.secret});
  assert.equal(result.status,409);
  assert.equal((await state(db,black)).data.status,'active');
  assert.equal(injected,true);
 }finally{db.close()}
});


test('same browser cannot match its own random game or join its own invite',async()=>{
 const db=databaseWithOnline();try{
  const first=await api(db,'create',{kind:'random',name:'First'});
  assert.equal(first.status,200);
  const cookie=first.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie,/^elo_chess_browser=[a-f0-9]{32}$/);
  assert.match(first.headers.get('set-cookie'),/HttpOnly/);
  assert.match(first.headers.get('set-cookie'),/SameSite=Strict/);
  const waiting=await first.json();
  const second=await call(db,'create',{kind:'random',name:'Second'},{cookie});
  assert.equal(second.status,200);
  assert.notEqual(second.data.id,waiting.id);
  const differentBrowser=await call(db,'create',{kind:'random',name:'Third'});
  assert.equal(differentBrowser.status,200);
  assert.equal(differentBrowser.data.id,waiting.id);
  const invitation=await api(db,'create',{kind:'invite',name:'Host'},{cookie});
  const invite=await invitation.json();
  assert.equal((await call(db,'join',{id:invite.id,name:'Self'},{cookie})).status,409);
  assert.equal((await call(db,'join',{id:invite.id,name:'Other'})).status,200);
 }finally{db.close()}
});


test('opponent and unauthenticated probes cannot obtain player IP or private browser identifiers',async()=>{
 const db=databaseWithOnline();try{
  const origin='https://chess.example.test',ipA='198.51.100.17',ipB='203.0.113.91';
  const first=await api(db,'create',{kind:'random',name:'Alice'},{origin,ip:ipA});
  assert.equal(first.status,200);
  const white=await first.json();
  const cookie=first.headers.get('Set-Cookie');
  assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
  assert.equal(first.headers.get('Cache-Control'),'no-store, private');
  assert.equal(first.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(first.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
  const second=await api(db,'create',{kind:'random',name:'Bob'},{origin,ip:ipB});
  assert.equal(second.status,200);
  const black=await second.json();
  assert.equal(black.id,white.id);
  const board=await api(db,'state',{id:black.id,secret:black.secret},{origin,ip:ipB});
  assert.equal(board.status,200);
  const stateBody=await board.text();
  const other=await api(db,'state',{id:white.id,secret:'a'.repeat(32)},{origin,ip:ipB});
  assert.equal(other.status,404);
  const moveAttempt=await api(db,'move',{id:white.id,secret:black.secret,from:'e2',to:'e4'},{origin,ip:ipB});
  assert.equal(moveAttempt.status,409);
  const publicProbe=await api(db,'game',{}, {origin,ip:ipB,social:true,method:'GET'});
  const exposed=[stateBody,await other.text(),await moveAttempt.text(),await publicProbe.text(),JSON.stringify(db.sqlite.prepare("SELECT * FROM online_games").all()),JSON.stringify(db.sqlite.prepare("SELECT * FROM auth_attempts").all())];
  // Raw IP addresses should not be disclosed in API bodies or stored in the multiplayer tables.
  for(const value of exposed){assert.equal(value.includes(ipA),false);assert.equal(value.includes(ipB),false)}
  const body=JSON.parse(stateBody);
  for(const key of Object.keys(body))assert.doesNotMatch(key,/ip|address|browser|cookie|token|secret|header|session/i);
  assert.equal(body.white,'Guest · Alice');assert.equal(body.black,'Guest · Bob');
  assert.ok(!stateBody.includes(white.secret));
  assert.ok(!stateBody.includes(black.secret));
  assert.ok(!stateBody.includes(cookie.split(';')[0]));
 }finally{db.close()}
});


test('move acknowledgement provides confirmed board without peer credentials',async()=>{
 const db=databaseWithOnline();try{
  const [white,black]=await pair(db);
  const reply=await move(db,white,'e2','e4');
  assert.equal(reply.status,200);
  assert.equal(reply.data.ok,true);
  assert.deepEqual(reply.data.moves,['e4']);
  assert.equal(reply.data.turn,'b');
  assert.equal(reply.data.fen,(await state(db,black)).data.fen);
  for(const key of Object.keys(reply.data))assert.doesNotMatch(key,/ip|address|browser|cookie|token|secret|session/i);
  assert.ok(!JSON.stringify(reply.data).includes(black.secret));
 }finally{db.close()}
});

console.log('Online security and chess logic regression tests completed.');
