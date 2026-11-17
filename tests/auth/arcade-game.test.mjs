import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../../functions/api/arcade-game.js';

const url='https://eloscanner.com/api/arcade-game';
const pgn='[Event "Live Chess"]\n[Site "Chess.com"]\n[White "PlayerA"]\n[Black "PlayerB"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. c3 d6 6. O-O O-O 1-0';
const games=['123456789','987654321'].map((id,i)=>({
 url:'https://www.chess.com/game/live/'+id, rated:true, rules:'chess',
 time_class:i?'blitz':'rapid', pgn,
 white:{rating:1837+i*100}, black:{rating:1722+i*100}
}));
const realFetch=globalThis.fetch;
const realCaches=globalThis.caches;
function mockChesscom({entries=games, unavailable=false}={}){
 const visited=[];
 globalThis.caches=undefined;
 globalThis.fetch=async (input,options)=>{
  const target=String(input);
  visited.push({url:target,ua:options?.headers?.['User-Agent']});
  assert.ok(target.startsWith('https://api.chess.com/pub/player/'),
   'Never fetch from Lichess or any third-party game source: '+target);
  if(unavailable)return new Response('Unavailable',{status:503});
  if(target.endsWith('/games/archives'))return Response.json({
   archives:['https://api.chess.com/pub/player/public/games/2026/08']
  });
  return Response.json({games:entries});
 };
 return visited;
}
function restore(){
 globalThis.fetch=realFetch;
 globalThis.caches=realCaches;
}
test('Guess the Elo only serves genuine rated Chess.com game PGNs and source ratings',async()=>{
 const visited=mockChesscom();
 try{
  const response=await onRequestGet({request:new Request(url)});
  assert.equal(response.status,200);
  const game=await response.json();
  assert.equal(game.platform,'chesscom');
  assert.match(game.link,/^https:\/\/www\.chess\.com\/game\/live\/\d+$/);
  assert.ok(['123456789','987654321'].includes(game.id));
  assert.equal(game.elo,game.side==='white'?
   games.find(g=>g.url.endsWith(game.id)).white.rating:
   games.find(g=>g.url.endsWith(game.id)).black.rating);
  const board=new Chess();
  board.loadPgn(game.pgn);
  assert.equal(board.history().length,12);
  assert.ok(visited.some(v=>v.url.endsWith('/games/archives')));
  assert.ok(visited.some(v=>/\/games\/2026\/08$/.test(v.url)));
  assert.ok(visited.every(v=>v.ua?.includes('EloScanner')));
 }finally{restore()}
});
test('excluded Chess.com games are not repeated, without Lichess fallback',async()=>{
 mockChesscom();
 try{
  const response=await onRequestGet({request:new Request(url+'?exclude=987654321')});
  assert.equal(response.status,200);
  assert.equal((await response.json()).id,'123456789');
  const other=await onRequestGet({request:new Request(url+'?exclude=123456789')});
  assert.equal(other.status,200);
  assert.equal((await other.json()).id,'987654321');
  const empty=await onRequestGet({request:new Request(url+'?exclude=123456789,987654321')});
  assert.equal(empty.status,503);
  assert.match((await empty.json()).error,/Chess.com games/i);
 }finally{restore()}
});
test('unavailable Chess.com archives never display an unrelated Lichess game',async()=>{
 const visited=mockChesscom({unavailable:true});
 try{
  const response=await onRequestGet({request:new Request(url)});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.platform,undefined);
  assert.match(body.error,/Chess.com/);
  assert.ok(visited.every(v=>v.url.startsWith('https://api.chess.com/')));
 }finally{restore()}
});
test('unrated, nonstandard or unverified games are rejected',async()=>{
 const bad=[
  {...games[0],rated:false},
  {...games[0],rules:'chess960'},
  {...games[0],url:'https://lichess.org/PpwPOZMq'},
  {...games[0],time_class:'daily'}
 ];
 mockChesscom({entries:bad});
 try{
  const response=await onRequestGet({request:new Request(url)});
  assert.equal(response.status,503);
 }finally{restore()}
});
test('a warm server pool supplies verified games without another Chess.com request',async()=>{
 const store=new Map(),visited=mockChesscom();
 globalThis.caches={default:{
  match:async request=>store.get(request.url)?.clone()||null,
  put:async (request,response)=>{store.set(request.url,response.clone())}
 }};
 try{
  const first=await (await onRequestGet({request:new Request(url+'?exclude=987654321')})).json();
  assert.equal(first.id,'123456789');
  const requests=visited.length;
  const second=await (await onRequestGet({request:new Request(url+'?exclude=123456789')})).json();
  assert.equal(second.id,'987654321');
  assert.equal(visited.length,requests,'warm pool uses Cloudflare cache');
 }finally{restore()}
});
test('Guess the Elo hides How to play and rejects non-Chess.com URLs in browser',()=>{
 const html=readFileSync(new URL('../../arcade.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../../arcade.js',import.meta.url),'utf8');
 assert.match(html,/id="arcade-how-to-play"/);
 assert.match(script,/if\(mode==='guess-the-elo'\)\$\('arcade-how-to-play'\)\?\.remove\(\)/);
 assert.match(script,/data\.platform!=='chesscom'/);
 assert.match(script,/Try another Chess\.com game/);
 assert.doesNotMatch(script,/real Lichess game|state\.eloPlatform=data\.platform/);
});
