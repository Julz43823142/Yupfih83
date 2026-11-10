import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './fixture.mjs';
import {allowGameStartSource} from '../../lib/game-capacity.js';
import {onRequestPost as arcadeStart} from '../../functions/api/arcade.js';
import {onRequestPost as mazeStart} from '../../functions/api/knight-maze.js';
import {onRequestPost as puzzleStart} from '../../functions/api/puzzle-leaderboard.js';
const secret='Source-game-allowance-test-secret-12345678';
const env=()=>({AUTH_DB:database(),SUS_DB:database(),BETTER_AUTH_SECRET:secret});
const request=(ip,body)=>new Request('https://eloscanner.com/api/game',{
 method:'POST',headers:{'Content-Type':'application/json','Origin':'https://eloscanner.com','CF-Connecting-IP':ip},
 body:JSON.stringify(body)
});
test('one IPv6 /64 cannot starve other users by exhausting a shared game quota',async()=>{
 const e=env(),ip='2001:db8:aaaa:bbbb::';
 for(let i=0;i<12;i++){
  const req=request(ip+(i+1),{action:'start',mode:'pawn-dash'});
  req.headers.set('X-Forwarded-For','198.51.100.'+(i+1));
  assert.equal(await allowGameStartSource(e,req,'arcade'),true);
 }
 assert.equal(await allowGameStartSource(e,request(ip+'13',{action:'start'}),'arcade'),false);
 assert.equal(await allowGameStartSource(e,request('2001:db8:aaaa:bbbc::1',{action:'start'}),'arcade'),true);
 assert.equal(await allowGameStartSource(e,request(ip+'14',{action:'start'}),'knight-maze'),true);
 const stored=JSON.stringify(e.AUTH_DB.sqlite.prepare('SELECT key FROM auth_attempts').all());
 assert.ok(!stored.includes('2001:db8'));
});
test('every public minigame creation enforces the source limit before allocating a run',async()=>{
 for(const [handler,game,body] of [
  [arcadeStart,'arcade',{action:'start',mode:'pawn-dash'}],
  [mazeStart,'knight-maze',{action:'start'}],
  [puzzleStart,'puzzle',{action:'start',mode:'survival'}]
 ]){
  const e=env();
  for(let i=0;i<12;i++){
   const response=await handler({env:e,request:request('192.0.2.7',body)});
   assert.equal(response.status,200,game+' '+i);
  }
  const count=e.SUS_DB.sqlite.prepare('SELECT COUNT(*) AS count FROM game_start_limits WHERE game=?').get(game).count;
  assert.equal(count,1);
  assert.equal((await handler({env:e,request:request('192.0.2.7',body)})).status,429);
  // A different address still gets its own allowance.
  assert.equal((await handler({env:e,request:request('192.0.2.8',body)})).status,200);
 }
});
test('active gameplay remains available when the optional source limiter database is absent',async()=>{
 assert.equal(await allowGameStartSource({SUS_DB:database()},request('192.0.2.5',{action:'start'}),'puzzle'),true);
 await assert.rejects(allowGameStartSource({},request('192.0.2.5',{}),'unknown'));
});
