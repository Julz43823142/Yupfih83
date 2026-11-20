import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_CATALOG,IDs,MISSING_PUZZLES,moves,at,cell,square,blockPartyLevel,safeSquareLevel,memoryLevel,memoryPosition,memoryArea,MEMORY_DIFFICULTIES,freshFalling,knightOptions,stepKnight,knightsAlive,queenEscape,threatened,safeMoves} from '../../arcade-rules.mjs';
import {onRequestGet,onRequestPost} from '../../functions/api/arcade.js';

test('nine standalone modes have unique URLs and score/ranking identities',()=>{
 assert.equal(GAME_CATALOG.length,9);
 assert.equal(new Set(GAME_CATALOG.map(g=>g.id)).size,9);
 for(const item of GAME_CATALOG){assert.ok(IDs.has(item.id));assert.ok(item.name&&item.description);}
 assert.ok(GAME_CATALOG.some(g=>g.name==='Queen Chase'));
 assert.ok(GAME_CATALOG.some(g=>g.name==='Chess Block Party'));
 assert.ok(GAME_CATALOG.some(g=>g.name==='Pawn Dash'));
});

test('all chessboard moves use a8=0 to h1=63 and respect blockers',()=>{
 assert.equal(cell('a8'),0);assert.equal(cell('h1'),63);assert.equal(square(0),'a8');assert.equal(square(63),'h1');
 assert.deepEqual(moves('N',cell('a1')).sort((a,b)=>a-b),[cell('b3'),cell('c2')].sort((a,b)=>a-b));
 const occupied={[cell('a4')]:{type:'P',side:'player'}};
 assert.deepEqual(moves('R',cell('a1'),occupied).sort((a,b)=>a-b),[cell('a2'),cell('a3'),cell('b1'),cell('c1'),cell('d1'),cell('e1'),cell('f1'),cell('g1'),cell('h1')].sort((a,b)=>a-b));
 assert.deepEqual(moves('B',cell('a1')),[cell('b2'),cell('c3'),cell('d4'),cell('e5'),cell('f6'),cell('g7'),cell('h8')]);
});

test('block party always offers a legal move to the announced colour',()=>{
 for(let n=1;n<55;n++){
  const b=blockPartyLevel('regression-seed',n);
  const candidates=moves(b.type,b.pos);
  assert.ok(candidates.length>0);
  assert.ok(candidates.every(i=>b.palette[i]!==b.target),'target reachable in one move at level '+n);
   assert.ok(candidates.some(i=>moves(b.type,i).some(dest=>b.palette[dest]===b.target)),'no two-move route at level '+n);
 }
});

test('safe square rush always has at least one unthreatened destination',()=>{
 for(let n=1;n<55;n++){
  const s=safeSquareLevel('regression-seed',n);
  assert.ok(s.safe.length>0,'no safe move at level '+n);
  for(const i of s.safe)assert.equal(threatened(i,s.pieces,'enemy'),false);
  assert.ok(moves(s.type,s.pos,s.pieces).some(i=>s.safe.includes(i)));
 }
});

test('falling board starts with four distinct knights, never captures and removes departed cells',()=>{
 const f=freshFalling('unit-test');
 assert.equal(f.knights.length,4);
 assert.equal(new Set(f.knights.map(k=>k.pos)).size,4);
 const old=f.knights[0].pos,to=knightOptions(f,0)[0];
 assert.ok(Number.isInteger(to));
 assert.equal(stepKnight(f,0,to,123),true);
 assert.equal(f.knights[0].pos,to);
 assert.ok(f.gone.includes(old));
 assert.equal(stepKnight(f,0,old,456),false);
 assert.equal(knightsAlive(f),4);
});

test('Chess Memory generates reachable legal games and correct 3x3, 5x5, 8x8 windows',()=>{
 assert.deepEqual(Object.keys(MEMORY_DIFFICULTIES),['easy','medium','hard']);
 for(const [difficulty,size] of [['easy',3],['medium',5],['hard',8]]){
  const area=memoryArea(difficulty);
  assert.equal(area.length,size*size);
  assert.equal(new Set(area).size,size*size);
  for(let level=1;level<=5;level++){
   const challenge=memoryPosition('unit-test',level,difficulty);
   const chess=new Chess(challenge.fen);
   assert.equal(chess.isCheckmate()&&chess.isStalemate(),false);
   assert.deepEqual(challenge.area,area);
   if(level===1)assert.deepEqual(memoryLevel('unit-test',level,difficulty),challenge.pieces);
   assert.ok(Object.keys(challenge.pieces).length>=1);
   for(const [index,p] of Object.entries(challenge.pieces)){
    assert.ok(area.includes(Number(index)),'piece must be inside visible window');
    const actual=chess.get(square(Number(index)));
    assert.ok(actual);
    assert.equal(p.type,actual.type.toUpperCase());
    assert.equal(p.side,actual.color==='w'?'player':'enemy');
   }
   // A legal full position always has exactly one king per side.
   assert.equal(chess.board().flat().filter(p=>p?.type==='k'&&p.color==='w').length,1);
   assert.equal(chess.board().flat().filter(p=>p?.type==='k'&&p.color==='b').length,1);
  }
 }
});

test('Chess Memory area is centered and inactive cells cannot hold challenge pieces',()=>{
 const easy=new Set(memoryArea('easy')),medium=new Set(memoryArea('medium'));
 assert.equal(easy.size,9);assert.equal(medium.size,25);
 assert.ok([...easy].every(i=>medium.has(i)));
 assert.ok(!easy.has(cell('a8'))&&!medium.has(cell('a8')));
});
test('pawn crossing supports forward and diagonal arcade hops',()=>{
 assert.deepEqual(moves('P',cell('e2'),{}, {arcadePawn:true}),[cell('d3'),cell('e3'),cell('f3')]);
});

test('queen-only escape never lands on an attacked or occupied square',()=>{
 const pieces={[cell('a1')]:{type:'R',side:'player'},[cell('g8')]:{type:'B',side:'player'}};
 const to=queenEscape(pieces,cell('e5'));
 if(to>=0){assert.ok(moves('Q',cell('e5'),{...pieces,[cell('e5')]:{type:'Q',side:'enemy'}},{side:'enemy'}).includes(to));assert.equal(threatened(to,pieces,'player'),false);}
});

test('invalid arcade modes are rejected without touching database',async()=>{
 const r=await onRequestGet({request:new Request('https://eloscanner.com/api/arcade?mode=unknown'),env:{}});
 assert.equal(r.status,400);
 const s=await onRequestPost({request:new Request('https://eloscanner.com/api/arcade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',mode:'unknown'})}),env:{SUS_DB:{}}});
 assert.equal(s.status,400);
});

test('moving the king must not expose a rook attack along the vacated line',()=>{
 const king=cell('e3'),rook=cell('e8');
 const pieces={[king]:{type:'K',side:'player'},[rook]:{type:'R',side:'enemy'}};
 assert.equal(safeMoves('K',king,pieces).includes(cell('e2')),false);
});

test('queen cannot escape along a rook ray hidden behind her original square',()=>{
 const queen=cell('e5');
 const pieces={[cell('e1')]:{type:'R',side:'player'},[queen]:{type:'Q',side:'enemy'}};
 const target=queenEscape(pieces,queen);
 assert.notEqual(target,cell('e6'));
 assert.notEqual(target,cell('e7'));
 assert.notEqual(target,cell('e8'));
});

import {guessEloPoints} from '../../arcade-rules.mjs';
test('Elo prediction points respect exact, 50, 100, 200 and zero cutoffs',()=>{
 for(const [diff,points] of [[0,10],[10,9],[25,7],[50,5],[100,4],[200,3],[300,2],[450,1],[451,0]])assert.equal(guessEloPoints(diff),points);
});

test('Missing Piece mirrored setups preserve a legal pawn reply and valid mate in one',()=>{
 assert.equal(MISSING_PUZZLES.length,40);
 for(const [index,p] of MISSING_PUZZLES.entries()){
  const chess=new Chess(p.fen);
  assert.ok(chess.put({type:p.piece.toLowerCase(),color:'w'},p.square),'placement '+index);
  assert.ok(chess.move({from:p.response[0],to:p.response[1]}),'black reply '+index);
  assert.ok(chess.move({from:p.mate[0],to:p.mate[1]}),'mate move '+index);
  assert.ok(chess.isCheckmate(),'solution must mate '+index);
 }
});

test('Memory difficulty controls, inactive squares and distinct scoring modes',async()=>{
 const root=new URL('../../',import.meta.url);
 const html=readFileSync(new URL('arcade.html',root),'utf8');
 const script=readFileSync(new URL('arcade.js',root),'utf8');
 const css=readFileSync(new URL('arcade.css',root),'utf8');
 for(const [difficulty,size] of [['easy',3],['medium',5],['hard',8]]){
  assert.ok(html.includes('data-memory-difficulty="'+difficulty+'"'));
  assert.ok(html.includes(size+'×'+size));
  const result=await onRequestGet({request:new Request('https://eloscanner.com/api/arcade?mode=chess-memory-'+difficulty),env:{}});
  assert.equal(result.status,503,'valid score category, no DB configured');
 }
 assert.ok(script.includes('memoryPosition(state.seed,state.level,memoryDifficulty)'));
 assert.ok(script.includes('state.memoryArea=challenge.area'));
 assert.ok(script.includes('state.memoryArea?.includes(to)'));
 assert.ok(script.includes('mode:state.scoreMode,score:state.score'));
 assert.match(css,/\.arcade-square\.memory-inactive/);
 assert.ok(html.includes('/arcade-bundle.js?v=220-memory-difficulty'));
});

test('leaderboards expose three Memory difficulties and omit removed games',()=>{
 const root=new URL('../../',import.meta.url);
 const page=readFileSync(new URL('puzzle-top100.html',root),'utf8');
 const home=readFileSync(new URL('index.html',root),'utf8');
 for(const difficulty of ['easy','medium','hard']){
  assert.ok(page.includes('?mode=chess-memory-'+difficulty));
  assert.ok(home.includes("['chess-memory-"+difficulty+"'"));
 }
 assert.match(page,/id="memory-leaderboard-difficulties"[^>]*hidden/);
 assert.ok(page.indexOf('id="memory-leaderboard-difficulties"')>page.indexOf('Orange = nickname'));
 assert.doesNotMatch(page,/data-mode="missing-piece"|data-mode="queen-chase"/);
 assert.doesNotMatch(home,/\['missing-piece',|'queen-chase',/);
});
