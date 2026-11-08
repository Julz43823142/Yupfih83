import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './fixture.mjs';
import {onRequestPost} from '../../functions/api/puzzle-report.js';
const request=(mode,nickname,score)=>new Request('https://eloscanner.com/api/puzzle-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,nickname,score})});
test('all arcade and Knight Maze rankings validate real entries before accepting reports',async()=>{
 const db=database(),original=globalThis.fetch;
 db.sqlite.exec("CREATE TABLE arcade_score_entries(mode TEXT,nickname TEXT,score INTEGER)");
 db.sqlite.exec("CREATE TABLE knight_maze_score_entries(nickname TEXT,score INTEGER)");
 db.sqlite.prepare("INSERT INTO arcade_score_entries VALUES(?,?,?)").run('endgame-survivor','sharkmeister',5);
 db.sqlite.prepare("INSERT INTO knight_maze_score_entries VALUES(?,?)").run('sharkmeister',7);
 const sent=[];globalThis.fetch=async(_url,opts)=>{sent.push(JSON.parse(opts.body));return new Response('OK')};
 const env={SUS_DB:db,REPORT_SECRET:'test-only-secret'};
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
