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

test('Pawn shop prices are premium and cosmetics are earned with finite coins',async()=>{
 const {PAWN_SHOP,readPawnWallet,earnPawnCoins,buyPawnSkin,pawnCoinAt}=await import('../../pawn-shop.mjs');
 assert.equal(PAWN_SHOP[0].id,'ivory');
 assert.equal(PAWN_SHOP[0].cost,0);
 assert.deepEqual(PAWN_SHOP.filter(s=>s.kind!=='pawn').map(s=>s.kind),['knight','bishop','rook','queen','king']);
 assert.deepEqual(PAWN_SHOP.filter(s=>s.kind!=='pawn').map(s=>s.cost),[2200,3500,5000,9000,14000]);
 const clean=readPawnWallet('{"coins":-100,"owned":["queen","not-a-skin"],"selected":"not-a-skin"}');
 assert.equal(clean.coins,0);
 assert.deepEqual(clean.owned,['ivory','queen']);
 assert.equal(clean.selected,'ivory');
 assert.equal(readPawnWallet('not json').coins,0);
 let wallet=readPawnWallet(null);
 assert.equal(buyPawnSkin(wallet,'queen').ok,false);
 wallet=earnPawnCoins(wallet,150);
 const buy=buyPawnSkin(wallet,'emerald');
 assert.equal(buy.ok,true);
 assert.equal(buy.wallet.selected,'emerald');
 assert.equal(buy.wallet.coins,0);
 const equip=buyPawnSkin(buy.wallet,'ivory');
 assert.equal(equip.wallet.coins,0);
 assert.equal(equip.wallet.selected,'ivory');
 assert.equal(earnPawnCoins(wallet,-10).coins,150);
 assert.ok(PAWN_SHOP.every(x=>x.cost>=0));
 const model=createPawnDashModel('coins');
 let count=0;
 for(let row=0;row<150;row++)for(let x=0;x<9;x++){
  if(!pawnCoinAt(model,row,x))continue;
  count++;
  assert.equal(model.lane(row)!=='river',true);
  assert.equal(row%4,2);
 }
 assert.ok(count>=20);
});

test('World renders continuous water, edge scenery, shop and smaller grounded skin',()=>{
 const js=readFileSync(new URL('../../pawn-world.js',import.meta.url),'utf8');
 assert.match(js,/function drawRiver\(/);
 assert.match(js,/function drawCoin\(/);
 assert.match(js,/pawnCoinAt\(model,nr,nx\)/);
 assert.match(js,/collected\.add\(/);
 assert.match(js,/persistWallet\(\)/);
 assert.match(js,/readPawnWallet\(/);
 assert.match(js,/buyPawnSkin\(/);
 assert.match(js,/function playerSquare\(/);
 assert.doesNotMatch(js,/strokePolygon\(q,'#fff8de'/);
 assert.doesNotMatch(js,/for\(let x=0;x<9;x\+\+\)tile\(x,row,type,time\);\s*\}/);
});
