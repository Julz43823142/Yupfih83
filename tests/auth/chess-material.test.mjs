import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
import {materialSnapshot} from '../../chess-material.mjs';

const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Starting board has equal 39-point material, no captured pieces',()=>{
 const game=new Chess();
 const result=materialSnapshot(game.fen(),{moves:game.history({verbose:true})});
 assert.equal(result.white,39);
 assert.equal(result.black,39);
 assert.equal(result.lead,0);
 assert.deepEqual(result.captured,{w:[],b:[]});
});

test('Capturing a pawn displays a pawn icon and a +1 material lead',()=>{
 const game=new Chess();
 for(const move of ['e4','d5','exd5'])game.move(move);
 const result=materialSnapshot(game.fen(),{moves:game.history({verbose:true})});
 assert.equal(result.lead,1);
 assert.equal(result.black,38);
 assert.equal(result.white,39);
 assert.deepEqual(result.captured.w,['p']);
 assert.deepEqual(result.captured.b,[]);
});

test('An exchange correctly shows all captured piece types and net points',()=>{
 const game=new Chess('4k3/8/8/8/8/8/3r4/3QK3 w - - 0 1');
 // Current position is authoritative: a 9-point white queen and a 5-point black rook.
 const result=materialSnapshot(game.fen());
 assert.equal(result.white,9);
 assert.equal(result.black,5);
 assert.equal(result.lead,4);
});

test('En passant uses the actual chess move capture, not target-square occupancy',()=>{
 const game=new Chess();
 for(const move of ['e4','a6','e5','d5','exd6'])game.move(move);
 const result=materialSnapshot(game.fen(),{moves:game.history({verbose:true})});
 assert.equal(result.lead,1);
 assert.deepEqual(result.captured.w,['p']);
});

test('Promotions do not appear as captured pawns when history is available',()=>{
 const game=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
 game.move('a8=Q');
 const result=materialSnapshot(game.fen(),{moves:game.history({verbose:true})});
 assert.equal(result.white,9);
 assert.deepEqual(result.captured.b,[]);
});

test('All main chessboards load one shared material UI with their own position',()=>{
 const sources={
  'arcade.js':/updateMaterial\(board,state\.eloView\.fen\(\)/,
  'play.js':/updateMaterial\(board,chess\.fen\(\)/,
  'analysis-stockfish-fixed.js':/updateMaterial\(board,pos\.fen\(\)/,
  'player-prep.js':/updateMaterial\(board,game\.fen\(\)/
 };
 for(const [file,pattern] of Object.entries(sources)){
  assert.match(read(file),pattern,file);
  assert.match(read(file),/import \{updateMaterial\} from ['"]\.\/chess-material\.mjs['"]/);
 }
 for(const html of ['arcade.html','play.html','analysis.html','player-prep.html']){
  assert.match(read(html),/chess-material\.css\?v=200/,html);
 }
 const css=read('chess-material.css');
 assert.match(css,/--elo-shared-board-size:700px/);
 assert.match(css,/\.elo-material-captures img/);
 assert.match(read('chess-material.mjs'),/\+lead/);
});
