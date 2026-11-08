import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_CATALOG,IDs,moves,at,cell,square,blockPartyLevel,safeSquareLevel,memoryLevel,freshFalling,knightOptions,stepKnight,knightsAlive,queenEscape,threatened,safeMoves} from '../../arcade-rules.mjs';
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
  assert.ok(candidates.some(i=>b.palette[i]===b.target),'no target for level '+n);
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

test('memory boards use stable valid squares and bounded difficulty',()=>{
 for(let n=1;n<30;n++){
  const p=memoryLevel('unit-test',n);
  assert.equal(Object.keys(p).length,Math.min(11,3+Math.ceil(n/2)));
  for(const [k,v] of Object.entries(p)){assert.ok(Number(k)>=0&&Number(k)<64);assert.ok('KQRBNP'.includes(v.type));}
 }
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
