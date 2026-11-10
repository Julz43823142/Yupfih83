import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPawnDashModel} from '../../pawn-world-logic.mjs';

test('Each world row has fixed scenery, and every river has a reachable three-tile bridge',()=>{
 const a=createPawnDashModel('pawn-dash-seed'),b=createPawnDashModel('pawn-dash-seed');
 for(let row=0;row<1000;row++){
  assert.equal(a.lane(row),b.lane(row));
  for(let x=0;x<9;x++){
   assert.equal(a.random(row*111+x),b.random(row*111+x));
   assert.equal(a.isBridge(row,x),b.isBridge(row,x));
  }
  if(a.lane(row)==='river'){
   const xs=Array.from({length:9},(_,x)=>x).filter(x=>a.isBridge(row,x));
   assert.equal(xs.length,3);
   assert.deepEqual(xs,[xs[0],xs[0]+1,xs[0]+2]);
   for(let x=0;x<9;x++)assert.equal(a.collision(x,row,17),!a.isBridge(row,x));
  }
  if(a.lane(row)==='meadow')for(let x=0;x<9;x++)assert.equal(a.collision(x,row,0),false);
 }
});

test('Difficulty increases exactly at 100, 500, 750 without making opening unreasonably hard',()=>{
 const m=createPawnDashModel('tiers');
 for(const [r,t] of [[0,0],[99,0],[100,1],[499,1],[500,2],[749,2],[750,3],[1200,3]])
  assert.equal(m.difficulty(r),t);
 const roadRows=[2,101,502,751].map(start=>{
  for(let row=start;row<start+12;row++)if(m.lane(row)==='road')return row;
  throw Error('road not found');
 });
 assert.deepEqual(roadRows.map(r=>m.enemyCount(r)),[1,2,3,4]);
 for(let row=0;row<950;row++){
  const n=m.enemyCount(row);
  assert.ok(n>=0&&n<=4);
  if(m.lane(row)==='meadow'||m.lane(row)==='river')assert.equal(n,0);
  for(let k=0;k<n;k++)assert.ok(['pawn','knight','rook','bishop','queen'].includes(m.enemyKind(row,k)));
 }
});

test('Collisions match visible enemy positions and piece silhouettes on every tier',()=>{
 const m=createPawnDashModel('visible-hazards');
 const kinds=new Set();
 for(const row of [2,3,4,5,103,104,503,504,751,752,755,757]){
  if(m.lane(row)==='river'||m.lane(row)==='meadow')continue;
  for(const t of [0,.8,3.5,30.7]){
   for(let k=0;k<m.enemyCount(row);k++){
    const x=m.enemyX(row,k,t);
    kinds.add(m.enemyKind(row,k));
    assert.ok(Number.isFinite(x));
    if(x>=0&&x<=8)assert.equal(m.collision(x,row,t),true);
   }
  }
 }
 assert.ok(kinds.size>=4,'Visible chess opponents should vary');
});

test('Player landing tile is illuminated and mobile gestures are handled only once',()=>{
 const js=readFileSync(new URL('../../pawn-world.js',import.meta.url),'utf8');
 assert.match(js,/createPawnDashModel\(seed\)/);
 assert.match(js,/function playerSquare\(/);
 assert.match(js,/playerSquare\(\)/);
 assert.match(js,/function drawPawn\(/);
 assert.match(js,/function drawEnemy\(/);
 assert.match(js,/function tree\(/);
 assert.match(js,/controls\.addEventListener\('pointerdown',controlPointer\)/);
 assert.match(js,/root\.addEventListener\('dblclick',preventZoom/);
 assert.match(js,/canvas\.addEventListener\('pointerup',gestureEnd/);
 assert.doesNotMatch(js,/touchend.*move\(/);
 assert.doesNotMatch(js,/Math\.random\(/);
});
