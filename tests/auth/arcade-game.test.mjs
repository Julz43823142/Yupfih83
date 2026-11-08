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

test('Guess the Elo prefers genuine rated Chess.com archive PGNs with original player ratings',async()=>{
 const previous=globalThis.fetch, visited=[];
 const pgn='[Event "Live Chess"]\\n[Site "Chess.com"]\\n[White "PlayerA"]\\n[Black "PlayerB"]\\n[Result "1-0"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. c3 d6 6. O-O O-O 1-0';
 globalThis.fetch=async input=>{visited.push(String(input));return Response.json({games:[{rated:true,rules:'chess',time_class:'rapid',url:'https://www.chess.com/game/live/123456789',pgn,white:{rating:1837},black:{rating:1722}}]})};
 try{
  const response=await onRequestGet({request:new Request(url)}),game=await response.json();
  assert.equal(response.status,200);assert.equal(game.platform,'chesscom');
  assert.equal(game.link,'https://www.chess.com/game/live/123456789');
  assert.ok([1837,1722].includes(game.elo));assert.equal(game.elo,game.side==='white'?1837:1722);
  const board=new Chess();board.loadPgn(game.pgn);assert.equal(board.history().length,12);
  assert.ok(visited.some(x=>x.startsWith('https://api.chess.com/pub/player/')));
 }finally{globalThis.fetch=previous}
});
