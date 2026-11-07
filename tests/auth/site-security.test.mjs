import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { database } from './fixture.mjs';
import { consumeGameStart } from '../../lib/game-capacity.js';
import { onRequestPost as puzzlePost } from '../../functions/api/puzzle-leaderboard.js';
import { onRequestPost as mazePost } from '../../functions/api/knight-maze.js';
import { buildSite } from '../../scripts/build-site.mjs';
const bank=Array.from({length:20},(_,i)=>['proof'+i,'position','a1a2 b1b2']);
function fixture(){return {SUS_DB:database(),ASSETS:{fetch:async()=>Response.json(bank)}};}
function post(env,body,handler=puzzlePost,headers={}){
 return handler({env,request:new Request('https://eloscanner.com/api/game',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:'https://eloscanner.com',...headers},body:JSON.stringify(body)
 })});
}
async function start(env){const r=await post(env,{action:'start',mode:'survival'});assert.equal(r.status,200);return (await r.json()).session;}

test('parallel puzzle proofs cannot evade pacing, double count, or score a concurrently submitted run',async()=>{
 const env=fixture(), db=env.SUS_DB, originalNow=Date.now;let now=1800000000000;
 Date.now=()=>now;
 try{
  const session=await start(env);now++;
  const responses=await Promise.all(bank.slice(0,12).map(row=>post(env,{action:'solve',session,puzzleId:row[0],solution:'b1b2'})));
  assert.equal(responses.filter(r=>r.status===200).length,1);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,1);
  now+=1200;
  const repeated=await Promise.all(Array.from({length:8},()=>post(env,{action:'solve',session,puzzleId:'proof0',solution:'b1b2'})));
  assert.ok(repeated.every(r=>r.status===200));
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,1);
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof1',solution:'b1b2'})).status,200);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,2);
  now+=2400;
  const prepare=db.prepare;
  db.prepare=function(sql){
   const stmt=prepare(sql);
   if(sql==='SELECT * FROM puzzle_verified_runs WHERE id=?'){
    const first=stmt.first;
    stmt.first=async(...args)=>{const row=await first(...args);db.sqlite.prepare('UPDATE puzzle_verified_runs SET submitted=1 WHERE id=?').run(session);return row;};
   }
   return stmt;
  };
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof2',solution:'b1b2'})).status,409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM puzzle_verified_solves').get().c,2);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,2);
 }finally{Date.now=originalNow;}
});

test('public answer bots cannot inflate puzzle rankings faster than server time permits',async()=>{
 const env=fixture(),db=env.SUS_DB,originalNow=Date.now;
 let now=1800000000000;Date.now=()=>now;
 try{
  const session=await start(env);
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof0',solution:'b1b2'})).status,200);
  // Different valid answers submitted immediately must not increase the score.
  const flood=await Promise.all(bank.slice(1,20).map(row=>post(env,{action:'solve',session,puzzleId:row[0],solution:'b1b2'})));
  assert.equal(flood.filter(response=>response.status===200).length,0);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,1);
  now+=1199;
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof1',solution:'b1b2'})).status,429);
  now++;
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof1',solution:'b1b2'})).status,200);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,2);
  now+=1200;
  assert.equal((await post(env,{action:'solve',session,puzzleId:'proof2',solution:'b1b2'})).status,200);
  assert.equal(db.sqlite.prepare('SELECT score FROM puzzle_verified_runs WHERE id=?').get(session).score,3);
  // Client-supplied totals remain unable to bypass server-verified scores.
  assert.equal((await post(env,{action:'submit',session,mode:'survival',nickname:'FastBot',score:19})).status,409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM puzzle_score_entries').get().n,0);
 }finally{Date.now=originalNow}
});

test('a concurrent solve invalidates a stale score submission; an unknown run cannot write scores',async()=>{
 const env=fixture(),db=env.SUS_DB,session=await start(env);
 db.sqlite.prepare('UPDATE puzzle_verified_runs SET score=1 WHERE id=?').run(session);
 const prepare=db.prepare;
 db.prepare=function(sql){
  const stmt=prepare(sql);
  if(sql.startsWith('UPDATE puzzle_verified_runs SET submitted=1')){
   const run=stmt.run;
   stmt.run=async()=>{db.sqlite.prepare('UPDATE puzzle_verified_runs SET score=2 WHERE id=?').run(session);return run();};
  }
  return stmt;
 };
 const data={mode:'survival',nickname:'ChessFox',score:1,session};
 assert.equal((await post(env,data)).status,409);
 assert.equal(db.sqlite.prepare('SELECT submitted FROM puzzle_verified_runs WHERE id=?').get(session).submitted,0);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM puzzle_hourly_scores').get().c,0);
 assert.equal((await post(env,{...data,session:crypto.randomUUID()})).status,409);
 assert.equal((await post(env,{...data,nickname:'<svg onload=alert(1)>'})).status,400);
 assert.equal((await post(env,{...data,score:99999})).status,409);
});

test('anonymous puzzle leaderboard rejects staff impersonation even after a valid proof',async()=>{
 const env=fixture(),session=await start(env);
 assert.equal((await post(env,{action:'solve',session,puzzleId:'proof0',solution:'b1b2'})).status,200);
 const attempt=await post(env,{action:'submit',mode:'survival',nickname:'Elo Scanner',score:1,session});
 assert.equal(attempt.status,400);
 assert.equal(env.SUS_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM puzzle_score_entries').get().n,0);
 assert.equal(env.SUS_DB.sqlite.prepare('SELECT submitted FROM puzzle_verified_runs WHERE id=?').get(session).submitted,0);
});

test('expired puzzle history is cleaned in bounded batches without deleting active runs or rankings',async()=>{
 const env=fixture(),db=env.SUS_DB,active=await start(env),old=crypto.randomUUID();
 db.sqlite.prepare('INSERT INTO puzzle_verified_runs(id,mode,started_at,score) VALUES(?,?,?,0)').run(old,'survival',Date.now()-90000000);
 const insert=db.sqlite.prepare('INSERT INTO puzzle_verified_solves VALUES(?,?)');
 for(let i=0;i<510;i++)insert.run(old,'expired'+i);
 db.sqlite.prepare('INSERT INTO puzzle_hourly_scores (hour,mode,nickname,score,created_at) VALUES(1,?,?,?,?)').run('survival','ChessFox',10,Date.now());
 await start(env);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM puzzle_verified_solves WHERE run_id=?').get(old).c,10);
 assert.ok(db.sqlite.prepare('SELECT id FROM puzzle_verified_runs WHERE id=?').get(old));
 await start(env);
 assert.equal(db.sqlite.prepare('SELECT id FROM puzzle_verified_runs WHERE id=?').get(old),undefined);
 assert.ok(db.sqlite.prepare('SELECT id FROM puzzle_verified_runs WHERE id=?').get(active));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM puzzle_hourly_scores').get().c,1);
});

test('automated knight-maze levels cannot inflate faster than elapsed server time',async()=>{
 const env=fixture(),db=env.SUS_DB,originalNow=Date.now;
 let now=1800000000000;Date.now=()=>now;
 try{
  const started=await post(env,{action:'start'},mazePost);
  assert.equal(started.status,200);
  const id=(await started.json()).run.id;
  const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  const next=square=>{const x=square%8,y=Math.floor(square/8);for(const [dx,dy] of jumps){const a=x+dx,b=y+dy;if(a>=0&&a<8&&b>=0&&b<8)return b*8+a;}throw Error('No knight jump')};
  let row=db.sqlite.prepare('SELECT * FROM knight_maze_runs WHERE id=?').get(id);
  let goal=next(row.position);
  db.sqlite.prepare('UPDATE knight_maze_runs SET goal=?,blocked=? WHERE id=?').run(goal,'[]',id);
  assert.equal((await post(env,{action:'move',id,to:goal},mazePost)).status,200);
  row=db.sqlite.prepare('SELECT * FROM knight_maze_runs WHERE id=?').get(id);
  goal=next(row.position);
  db.sqlite.prepare('UPDATE knight_maze_runs SET goal=?,blocked=? WHERE id=?').run(goal,'[]',id);
  assert.equal((await post(env,{action:'move',id,to:goal},mazePost)).status,429);
  assert.equal(db.sqlite.prepare('SELECT score FROM knight_maze_runs WHERE id=?').get(id).score,1);
  now+=750;
  assert.equal((await post(env,{action:'move',id,to:goal},mazePost)).status,200);
  assert.equal(db.sqlite.prepare('SELECT score FROM knight_maze_runs WHERE id=?').get(id).score,2);
 }finally{Date.now=originalNow}
});

test('global anonymous start budgets are atomic, saturate without extra writes, and reset by window',async()=>{
 const db=database(),now=1800000000000;
 const allowed=await Promise.all(Array.from({length:65},()=>consumeGameStart(db,'puzzle',now)));
 assert.equal(allowed.filter(Boolean).length,60);
 const changes=db.sqlite.prepare('SELECT total_changes() n').get().n;
 assert.equal(await consumeGameStart(db,'puzzle',now),false);
 assert.equal(db.sqlite.prepare('SELECT total_changes() n').get().n,changes);
 assert.equal(await consumeGameStart(db,'puzzle',now+60000),true);
 db.sqlite.prepare('UPDATE game_start_limits SET day_count=3000').run();
 assert.equal(await consumeGameStart(db,'puzzle',now+120000),false);
 assert.equal(await consumeGameStart(db,'knight-maze',now),true);
 assert.equal(await consumeGameStart(db,'puzzle',now+86400000),true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM game_start_limits').get().c,2);
 await assert.rejects(consumeGameStart(db,'unbounded-attacker-key',now));
});

test('both public game endpoints enforce capacity before allocating runs, without affecting active gameplay',async()=>{
 const env=fixture(),db=env.SUS_DB;
 const p=await start(env);
 const m=await post(env,{action:'start'},mazePost);assert.equal(m.status,200);
 const maze=(await m.json()).run;
 db.sqlite.prepare('UPDATE game_start_limits SET day_count=3000').run();
 assert.equal((await post(env,{action:'start',mode:'survival'})).status,429);
 assert.equal((await post(env,{action:'start'},mazePost)).status,429);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM puzzle_verified_runs').get().c,1);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM knight_maze_runs').get().c,1);
 assert.equal((await post(env,{action:'solve',session:p,puzzleId:'proof0',solution:'b1b2'})).status,200);
 assert.equal((await post(env,{action:'finish',id:maze.id},mazePost)).status,200);
 assert.equal((await post(env,{action:'move',id:crypto.randomUUID(),to:0},mazePost)).status,404);
 assert.equal((await post(env,{action:'start'},mazePost,{Origin:'https://evil.example'})).status,403);
});

test('public build excludes nested secrets, dumps, symlinks and vendor demos; keeps runtime assets and CSP hashes',()=>{
 const root=mkdtempSync(join(tmpdir(),'elo-public-test-'));
 try{
  for(const dir of ['assets','vendor','client-v87','lib'])mkdirSync(join(root,dir));
  const source={
   'index.html':'<!doctype html><html><head><script>window.expected=true;</script></head><body></body></html>',
   'credentials.json':'PRIVATE', 'package.json':'PRIVATE', 'assets/.env':'PRIVATE', 'assets/auth.db':'PRIVATE',
   'vendor/secrets.json':'PRIVATE', 'assets/backup.txt':'PRIVATE', 'vendor/console.html':'<script src="https://example.com"></script>',
   'lib/auth.js':'PRIVATE', 'client-v87/runner.py':'print(1)', 'vendor/runtime.zip':'RUNTIME', 'assets/board.svg':'<svg/>', 'app.js':'window.ok=true;'
  };
  for(const [name,value] of Object.entries(source))writeFileSync(join(root,name),value);
  symlinkSync(join(root,'lib'),join(root,'assets','linked'));
  symlinkSync(join(root,'lib/auth.js'),join(root,'linked.js'));
  buildSite(root);
  for(const name of ['credentials.json','package.json','assets/.env','assets/auth.db','vendor/secrets.json','assets/backup.txt','vendor/console.html','lib/auth.js','assets/linked/auth.js','linked.js'])assert.equal(existsSync(join(root,'dist',name)),false,name);
  for(const name of ['client-v87/runner.py','vendor/runtime.zip','assets/board.svg','app.js'])assert.equal(existsSync(join(root,'dist',name)),true,name);
  const html=readFileSync(join(root,'dist/index.html'),'utf8');
  assert.match(html,/http-equiv="Content-Security-Policy"/);
  assert.match(html,/'sha256-[A-Za-z0-9+/=]+'/);
  assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script>'));
  assert.ok(!html.includes("'unsafe-inline'")&&!html.includes("'unsafe-eval'"));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('legacy engine routes use only deployed assets and do not accept an upstream URL',async()=>{
 const {serveEngineAsset}=await import('../../lib/engine-assets.js');
 const seen=[];
 const context={request:new Request('https://eloscanner.com/engine/stockfish-19-lite-single.js?url=https://attacker.invalid'),env:{ASSETS:{fetch:async r=>{seen.push(r.url);return new Response('BUNDLED ENGINE');}}}};
 const response=await serveEngineAsset(context,'stockfish-19-lite-single.js');
 assert.equal(await response.text(),'BUNDLED ENGINE');
 assert.deepEqual(seen,['https://eloscanner.com/vendor/stockfish/stockfish-19-lite-single.js']);
 assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal((await serveEngineAsset(context,'../../secret.js')).status,503);
 assert.equal((await serveEngineAsset({...context,env:{}},'stockfish-19-lite-single.js')).status,503);
});
