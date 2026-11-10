import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPawnDashModel} from '../../pawn-world-logic.mjs';

test('Pawn Dash lanes and bridge geometry are stable across camera movement',()=>{
 const a=createPawnDashModel('pawn-dash-seed'),b=createPawnDashModel('pawn-dash-seed');
 for(let row=0;row<220;row++){
  assert.equal(a.lane(row),b.lane(row));
  for(let x=0;x<9;x++){
   assert.equal(a.random(row*111+x),b.random(row*111+x));
   assert.equal(a.isBridge(row,x),b.isBridge(row,x));
  }
  if(a.lane(row)==='river'){
   const bridge=Array.from({length:9},(_,x)=>x).filter(x=>a.isBridge(row,x));
   assert.deepEqual(bridge,[bridge[0],bridge[0]+1,bridge[0]+2]);
   for(let x=0;x<9;x++)assert.equal(a.collision(x,row,17),!a.isBridge(row,x));
  }
  if(a.lane(row)==='meadow'){
   for(let x=0;x<9;x++)assert.equal(a.collision(x,row,0),false);
  }
 }
});

test('Visible pawns and collisions use exactly the same enemy coordinates',()=>{
 const m=createPawnDashModel('another-seed');
 for(let row=2;row<70;row++){
  const count=m.enemyCount(row);
  assert.equal(count,m.lane(row)==='court'?3:m.lane(row)==='road'?2:0);
  for(const t of [0,.8,3.5,30.7]){
   for(let k=0;k<count;k++){
    const x=m.enemyX(row,k,t);
    assert.ok(Number.isFinite(x));
    if(x>=0&&x<=8)assert.equal(m.collision(x,row,t),true);
   }
  }
 }
});

test('Pawn Dash contains pointer-only movement and deterministic scenery model',()=>{
 const js=readFileSync(new URL('../../pawn-world.js',import.meta.url),'utf8');
 assert.match(js,/createPawnDashModel\(seed\)/);
 assert.match(js,/function drawPawn\(/);
 assert.match(js,/function tree\(/);
 assert.match(js,/controls\.addEventListener\('pointerdown',controlPointer\)/);
 assert.match(js,/root\.addEventListener\('dblclick',preventZoom/);
 assert.match(js,/canvas\.addEventListener\('pointerup',gestureEnd/);
 assert.doesNotMatch(js,/touchend.*move\(/);
 assert.doesNotMatch(js,/Math\.random\(/);
});
