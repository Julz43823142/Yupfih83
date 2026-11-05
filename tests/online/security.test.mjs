import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as gameApi} from '../../functions/api/online/[[path]].js';
import {onRequest as socialApi} from '../../functions/api/social/[[path]].js';

const ORIGIN='http://localhost:8788',secret='LOCAL-TEST-ONLY-never-use-in-production-1234567890';
class DB{
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');
  for(const n of ['0001_auth.sql','0002_security.sql','0003_online_chess.sql','0004_social.sql'])
   this.sqlite.exec(readFileSync(new URL('../../migrations/auth/'+n,import.meta.url),'utf8'));
 }
 prepare(sql){
  const statement=this.sqlite.prepare(sql);
  return {bind(...params){return {
   async first(){return statement.get(...params)??null},
   async all(){return {results:statement.all(...params)}},
   async run(){return {meta:{changes:Number(statement.run(...params).changes)}}}
  }}};
 }
 async batch(statements){this.sqlite.exec('BEGIN');try{const values=[];for(const stmt of statements)values.push(await stmt.run());this.sqlite.exec('COMMIT');return values}catch(e){this.sqlite.exec('ROLLBACK');throw e}}
 async exec(sql){this.sqlite.exec(sql);return {}}
 close(){this.sqlite.close()}
}
function api(db,path,data={},options={}){
 const req=new Request(ORIGIN+'/api/'+(options.social?'social':'online')+'/'+path,{method:options.method||'POST',headers:{'Origin':options.crossOrigin?'https://attacker.invalid':ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.40'},body:options.method==='GET'?undefined:JSON.stringify(data)});
 return (options.social?socialApi:gameApi)({request:req,env:{AUTH_DB:db,BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:ORIGIN,ONLINE_TEST_DEBUG:'true'}});
}
async function call(db,path,data,options){const r=await api(db,path,data,options);return {status:r.status,data:await r.json()}}
async function create(db,kind='random',name='Visitor'){const a=await call(db,'create',{kind,name});assert.equal(a.status,200,JSON.stringify(a));return a.data}
async function state(db,player){return call(db,'state',{id:player.id,secret:player.secret})}
async function move(db,player,from,to,promotion){return call(db,'move',{id:player.id,secret:player.secret,from,to,promotion})}
async function pair(db){const w=await create(db);const b=await create(db);assert.equal(w.id,b.id);return [w,b]}
test('CSRF/method/body guards, guest identity isolation and secret authorization',async()=>{
 const db=new DB();try{
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
 const db=new DB();try{
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
 const db=new DB();try{
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
 const db=new DB();try{
  for(let i=0;i<6;i++)assert.equal((await call(db,'create',{kind:'invite',name:'Test'})).status,200);
  assert.equal((await call(db,'create',{kind:'invite',name:'Test'})).status,429);
  const id=db.sqlite.prepare("SELECT id FROM online_games LIMIT 1").get().id;
  const unknown='f'.repeat(32);
  for(let i=0;i<80;i++)await call(db,'state',{id,secret:unknown});
  const limited=await call(db,'state',{id,secret:unknown});assert.equal(limited.status,429);
 }finally{db.close()}
});
console.log('Online security and chess logic regression tests completed.');
