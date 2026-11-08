import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../../functions/api/arcade-game.js';
import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
const url='https://eloscanner.com/api/arcade-game';
test('Guess the Elo serves real-game metadata, exact player rating and source link without fabrication',async()=>{
 const original=globalThis.fetch,visited=[];
 globalThis.fetch=async input=>{
  const request=String(input);visited.push(request);
  if(request.endsWith('/api/tv/channels'))return Response.json({rapid:{user:{id:'PublicChessPlayer'}}});
  if(request.includes('/api/games/user/'))return new Response(JSON.stringify({
   id:'PpwPOZMq',moves:'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3 g8f6 c2c3 d7d6 e1g1 e8g8',
   players:{white:{rating:1712},black:{rating:1885}}
  })+'\n',{headers:{'Content-Type':'application/x-ndjson'}});
  throw Error('Unexpected upstream '+request);
 };
 try{
  const r=await onRequestGet({request:new Request(url)});
  assert.equal(r.status,200);
  const game=await r.json();
  assert.equal(game.link,'https://lichess.org/PpwPOZMq');
  assert.equal(game.id,'PpwPOZMq');
  assert.equal(game.moves.length,12);
  assert.ok([1712,1885].includes(game.elo));
  assert.equal(game.elo,game.side==='white'?1712:1885);
  assert.ok(visited.some(link=>link.includes('/api/games/user/PublicChessPlayer')));
 }finally{globalThis.fetch=original}
});
test('Guess the Elo falls back to a verified archived real game when upstream fails',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 try{const r=await onRequestGet({request:new Request(url)});assert.equal(r.status,200);const game=await r.json();assert.equal(game.id,'PpwPOZMq');assert.equal(game.archived,true);assert.ok([2100,2000].includes(game.elo));const chess=new Chess();for(const uci of game.moves)assert.ok(chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]}));assert.equal(chess.history().length,26)}
 finally{globalThis.fetch=previous}
});
