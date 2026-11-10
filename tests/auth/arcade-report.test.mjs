import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './fixture.mjs';
import {onRequestPost} from '../../functions/api/puzzle-report.js';
const request=(mode,nickname,score,ip='192.0.2.5')=>new Request('https://eloscanner.com/api/puzzle-report',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://eloscanner.com','CF-Connecting-IP':ip},body:JSON.stringify({mode,nickname,score})});
const secret='Report-abuse-test-secret-1234567890';
test('all arcade and Knight Maze rankings validate real entries before accepting reports',async()=>{
 const db=database(),original=globalThis.fetch;
 db.sqlite.exec("CREATE TABLE arcade_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER)");
 db.sqlite.exec("CREATE TABLE knight_maze_score_entries(id INTEGER PRIMARY KEY,nickname TEXT,score INTEGER)");
 db.sqlite.prepare("INSERT INTO arcade_score_entries(mode,nickname,score) VALUES(?,?,?)").run('endgame-survivor','sharkmeister',5);
 db.sqlite.prepare("INSERT INTO knight_maze_score_entries(nickname,score) VALUES(?,?)").run('sharkmeister',7);
 const sent=[];globalThis.fetch=async(_url,opts)=>{sent.push(JSON.parse(opts.body));return new Response('OK')};
 const env={SUS_DB:db,AUTH_DB:database(),BETTER_AUTH_SECRET:secret,REPORT_SECRET:'test-only-secret'};
 try{
  const report=await onRequestPost({env,request:request('endgame-survivor','Sharkmeister',5)});
  assert.equal(report.status,200,await report.clone().text());
  assert.equal(sent.length,1);assert.equal(sent[0].mode,'endgame-survivor');
  assert.equal((await onRequestPost({env,request:request('endgame-survivor','Sharkmeister',5)})).status,200);
  assert.equal(sent.length,1,'one notification per reported leaderboard entry');
  assert.equal((await onRequestPost({env,request:request('knight-maze','Sharkmeister',7)})).status,200);
  assert.equal(sent.length,2);
  assert.equal((await onRequestPost({env,request:request('queen-chase','Sharkmeister',5)})).status,404,'a non-existent entry cannot be reported');
 }finally{globalThis.fetch=original}
});

test('removed scores are not reportable and historic puzzle entries must still be live',async()=>{
 const db=database(),auth=database(),previous=globalThis.fetch, sent=[];
 db.sqlite.exec("CREATE TABLE arcade_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER)");
 db.sqlite.exec("CREATE TABLE knight_maze_score_entries(id INTEGER PRIMARY KEY,nickname TEXT,score INTEGER)");
 db.sqlite.exec("CREATE TABLE puzzle_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER)");
 db.sqlite.exec("CREATE TABLE puzzle_hourly_scores(mode TEXT,nickname TEXT,score INTEGER)");
 const env={SUS_DB:db,AUTH_DB:auth,BETTER_AUTH_SECRET:secret,REPORT_SECRET:'only-test'};
 db.sqlite.exec("INSERT INTO arcade_score_entries VALUES(1,'pawn-dash','PlayerA',10)");
 db.sqlite.exec("INSERT INTO knight_maze_score_entries VALUES(2,'PlayerA',11)");
 db.sqlite.exec("INSERT INTO puzzle_score_entries VALUES(3,'sprint5','PlayerA',12)");
 db.sqlite.exec("INSERT INTO puzzle_hourly_scores VALUES('sprint5','PlayerA',12)");
 db.sqlite.exec("CREATE TABLE leaderboard_removed_scores(board TEXT,entry_id INTEGER,removed_at INTEGER,PRIMARY KEY(board,entry_id))");
 db.sqlite.exec("INSERT INTO leaderboard_removed_scores VALUES('arcade',1,1),('maze',2,1),('puzzle',3,1)");
 globalThis.fetch=async()=>{sent.push(true);return new Response('OK')};
 try{
  for(const [mode,score] of [['pawn-dash',10],['knight-maze',11],['sprint',12]]){
   const result=await onRequestPost({env,request:request(mode,'PlayerA',score)});
   assert.equal(result.status,404,mode);
  }
  assert.equal(sent.length,0);
 }finally{globalThis.fetch=previous}
});
test('public report mail endpoint uses cross-isolate D1 limits, not spoofable forwarded headers',async()=>{
 const db=database(),auth=database(),previous=globalThis.fetch, sent=[];
 db.sqlite.exec("CREATE TABLE arcade_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER)");
 const insert=db.sqlite.prepare("INSERT INTO arcade_score_entries VALUES(?,?,?,?)");
 for(let i=0;i<10;i++)insert.run(i+1,'pawn-dash','PlayerA',i+1);
 const env={SUS_DB:db,AUTH_DB:auth,BETTER_AUTH_SECRET:secret,REPORT_SECRET:'only-test'};
 globalThis.fetch=async()=>{sent.push(true);return new Response('OK')};
 try{
  for(let i=1;i<=6;i++){
   const req=request('pawn-dash','PlayerA',i,'2001:db8:1:2::'+i);
   req.headers.set('X-Forwarded-For','198.51.100.'+i);
   assert.equal((await onRequestPost({env,request:req})).status,200);
  }
  const blocked=await onRequestPost({env,request:request('pawn-dash','PlayerA',7,'2001:db8:1:2::7')});
  assert.equal(blocked.status,429);
  assert.equal(blocked.headers.get('Retry-After'),'60');
  assert.equal(sent.length,6,'rate limited reports never trigger more emails');
  assert.equal((await onRequestPost({env,request:request('pawn-dash','PlayerA',7,'192.0.2.9')})).status,200);
 }finally{globalThis.fetch=previous}
});
test('reporting fails closed when rate-limit database or signing key is missing',async()=>{
 const db=database();
 assert.equal((await onRequestPost({env:{SUS_DB:db,REPORT_SECRET:'only-test'},request:request('pawn-dash','PlayerA',1)})).status,503);
});
