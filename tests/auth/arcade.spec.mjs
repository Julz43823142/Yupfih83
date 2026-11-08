import {test,expect} from '@playwright/test';
const base='http://localhost:8788';
const games=['endgame-survivor','guess-the-elo','chess-memory','missing-piece','safe-square-rush','falling-board','queen-chase','chess-block-party'];
async function stubScores(page){
 await page.route('**/api/arcade**',async route=>{
  if(route.request().url().includes('/api/arcade-game'))return route.fulfill({json:{id:'PpwPOZMq',link:'https://lichess.org/PpwPOZMq',side:'white',elo:1650,moves:['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','d2d3','g8f6','c2c3','d7d6','e1g1','e8g8']}});
  if(route.request().method()==='GET')return route.fulfill({json:{entries:[],unverified:true}});
  return route.fulfill({json:{session:'11111111-1111-4111-8111-111111111111'}});
 });
}
async function drag(page,source,target){
 const a=await source.boundingBox(),b=await target.boundingBox();
 expect(a).toBeTruthy();expect(b).toBeTruthy();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await page.mouse.down();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});
 await page.mouse.up();
}

test('all playable chessboard modes load a stable board, SVGs and clock/score without errors',async({page})=>{
 await stubScores(page);
 const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')network.push(m.text())});
 page.on('response',r=>{if(r.status()>=400&&/arcade|chess-board|chess-1.4/i.test(r.url()))network.push(r.status()+' '+r.url())});
 page.on('requestfailed',r=>network.push(r.url()+' '+r.failure()?.errorText));
 await page.goto(base+'/minigames.html');
 await expect(page.locator('.hub-card.live')).toHaveCount(10); // Knight Maze + nine playable arcade games.
 const links=await page.locator('.hub-card.live').evaluateAll(cards=>cards.map(a=>new URL(a.href).pathname+new URL(a.href).search));
 expect(new Set(links).size).toBe(10);
 expect(links).toContain('/knight-maze.html');
 for(const game of games)expect(links).toContain('/arcade.html?game='+game);
 for(const game of games){
  await page.goto(base+'/arcade.html?game='+game);
  await expect.poll(()=>page.evaluate(()=>window.__eloArcadeLoaded===true)).toBe(true);
  await page.waitForTimeout(350);
  if(await page.locator('#arcade-board .arcade-square').count()!==64)console.log('ARCADE FAILURE',game,JSON.stringify({errors,network,location:page.url(),scripts:await page.locator('script').evaluateAll(all=>all.map(e=>e.src))}));
  await expect(page.locator('#arcade-board .arcade-square')).toHaveCount(64);
  await expect(page.locator('#arcade-board .arcade-marks')).toHaveCount(1);
  await page.getByRole('button',{name:'Start game'}).click();
  if(game!=='guess-the-elo')await expect.poll(()=>page.locator('#arcade-board .chess-piece').count()).toBeGreaterThan(0);
  await expect(page.locator('#arcade-score')).toHaveText('0');
  await expect(page.locator('#arcade-level')).toHaveText('1');
 }
 expect(errors).toEqual([]);
});

test('Block Party supports dragging pieces and right-mouse arrows; Falling Board supports mouse dragging',async({page})=>{
 await stubScores(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/arcade.html?game=chess-block-party');
 await page.locator('#arcade-start').click();
 const source=page.locator('#arcade-board .arcade-square:has(.chess-piece)').first();
 await source.click();
 const legal=page.locator('#arcade-board .arcade-square').filter({hasNot:page.locator('.chess-piece')}).first();
 await expect(page.locator('#arcade-board .goal-colour')).toHaveCount(0);
 await expect(legal).toBeVisible();
 const a=await source.boundingBox(),b=await legal.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await page.mouse.down({button:'right'});
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});
 await page.mouse.up({button:'right'});
 await expect.poll(()=>page.locator('#arcade-board .arcade-marks polygon, #arcade-board .arcade-marks polyline').count()).toBeGreaterThan(0);
 await drag(page,source,legal);
 await expect(page.locator('#arcade-score')).toBeVisible();
 await page.goto(base+'/arcade.html?game=falling-board');
 await page.locator('#arcade-start').click();
 const knight=page.locator('#arcade-board .arcade-square:has(.chess-piece.piece-blue)').first();
 await knight.click();
 const target=page.locator('#arcade-board .arcade-square.available').first();
 await drag(page,knight,target);
 await expect(page.locator('#arcade-score')).toHaveText('1');
 await page.locator('#arcade-finish').click();
 await expect(page.locator('#arcade-review')).toBeVisible();
 await expect(page.locator('.arcade-review-board span')).toHaveCount(64);
 expect(errors).toEqual([]);
});

test('Missing Piece is playable again and opens its first puzzle',async({page})=>{
 await stubScores(page);await page.goto(base+'/arcade.html?game=missing-piece');
 await expect(page.locator('#arcade-start')).toBeEnabled();
 await page.locator('#arcade-start').click();
 await expect(page.locator('#arcade-board .chess-piece').first()).toBeVisible();
});
test('Guess the Elo reviews authentic-game-shaped moves, allows manual rating and reveals source afterwards',async({page})=>{
 await stubScores(page);await page.goto(base+'/arcade.html?game=guess-the-elo');
 await page.locator('#arcade-start').click();
 await expect(page.getByRole('button',{name:'Next move ▶'})).toBeVisible();
 await page.getByRole('button',{name:'Next move ▶'}).click();
 await expect(page.locator('#arcade-elo-progress')).toHaveText('1 / 12 half-moves');
 await page.keyboard.press('ArrowLeft');
 await expect(page.locator('#arcade-elo-progress')).toHaveText('0 / 12 half-moves');
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('#arcade-elo-progress')).toHaveText('1 / 12 half-moves');
 await page.getByRole('spinbutton',{name:'Your Elo estimate'}).fill('1650');
 await page.getByRole('button',{name:'Reveal Elo & score'}).click();
 await expect(page.locator('#arcade-score')).toHaveText('10');
 await expect(page.locator('.arcade-elo-reveal')).toContainText('Actual white Elo: 1650');
 await expect(page.getByRole('link',{name:/real Lichess game/})).toHaveAttribute('href','https://lichess.org/PpwPOZMq');
});
test('Pawn Dash starts instantly, fills the viewport and supports Escape pause',async({page})=>{
 await stubScores(page);await page.goto(base+'/arcade.html?game=pawn-dash');
 // Do not click Start: entering Pawn Dash launches the world automatically.
 await expect(page.locator('.pawn-world-canvas')).toBeVisible();
 await expect(page.locator('.pawn-world-immersive')).toBeVisible();
 await expect(page.locator('.pawn-world-canvas')).toHaveCSS('position','static');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Resume game'})).toBeVisible();
 await page.getByRole('button',{name:'Resume game'}).click();
 await expect(page.locator('#arcade-board')).toBeHidden();
 await page.keyboard.press('ArrowUp');
 await expect(page.locator('#arcade-score')).toHaveText('1');
});
test('Chess Memory palette has draggable SVGs and mobile board stays inside viewport',async({page})=>{
 await stubScores(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/arcade.html?game=chess-memory');
 await page.locator('#arcade-start').click();
 await expect(page.getByRole('button',{name:'Pick white Knight'})).toBeVisible({timeout:9000});
 const source=page.getByRole('button',{name:'Pick white Knight'});
 const to=page.locator('#arcade-board [data-square="d4"]');
 await drag(page,source,to);
 await expect(page.locator('#arcade-score')).toBeVisible();
 const overflow=await page.evaluate(()=>({vw:innerWidth,width:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,cls:el.className?.baseVal||el.className,id:el.id,right:Math.round(el.getBoundingClientRect().right),left:Math.round(el.getBoundingClientRect().left)})).filter(el=>el.right>innerWidth+1||el.left< -1).slice(0,15)}));
 if(overflow.width>overflow.vw)console.log('ARCADE MOBILE OVERFLOW',JSON.stringify(overflow));
 expect(overflow.width<=overflow.vw).toBe(true);
 expect(errors).toEqual([]);
});

test('Safe Square Rush shows legal move dots without revealing attacked squares; Queen Chase supports dragging',async({page})=>{
 await stubScores(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/arcade.html?game=safe-square-rush');
 await page.locator('#arcade-start').click();
 const source=page.locator('#arcade-board .arcade-square:has(.chess-piece[alt^="White"])').first();
 await source.click();
 await expect(page.locator('#arcade-board .arcade-square.safe-zone')).toHaveCount(0);
 await expect(page.locator('#arcade-board .arcade-square.threatened')).toHaveCount(0);
 await expect.poll(()=>page.locator('#arcade-board .arcade-square.available').count()).toBeGreaterThan(0);
 await page.goto(base+'/arcade.html?game=queen-chase');
 await page.locator('#arcade-start').click();
 const rook=page.locator('#arcade-board .arcade-square:has(.chess-piece[alt="White Rook"])').first();
 await rook.click();
 const dest=page.locator('#arcade-board .arcade-square.available').first();
 const target=await dest.getAttribute('data-square');
 await drag(page,rook,dest);
 await expect(page.locator('#arcade-board [data-square="'+target+'"] .chess-piece')).toBeVisible();
 expect(errors).toEqual([]);
});

test('Endgame Survivor shows the latest bot-move arrow and executes a legal premove',async({page})=>{
 await stubScores(page);
 await page.addInitScript(()=>{
  const RealWorker=window.Worker;
  window.Worker=function(url,options){
   if(!String(url).includes('/play-strong-bot-worker.js'))return new RealWorker(url,options);
   return {
    onmessage:null,onerror:null,
    postMessage(message){if(message?.fen){window.__testBotFen=message.fen;window.__testBot=this}},
    terminate(){}
   };
  };
 });
 await page.goto(base+'/arcade.html?game=endgame-survivor');
 await page.locator('#arcade-start').click();
 const whites=page.locator('#arcade-board .arcade-square:has(.chess-piece[alt^="White"])');
 let moved=false;
 for(let i=0;i<await whites.count();i++){
  await whites.nth(i).click();
  const targets=page.locator('#arcade-board .arcade-square.available');
  if(await targets.count()){await targets.first().click();moved=true;break}
 }
 expect(moved).toBe(true);
 await expect.poll(()=>page.evaluate(()=>!!window.__testBotFen)).toBe(true);
 const sequence=await page.evaluate(async()=>{
  const {Chess}=await import('/vendor/chess/chess-1.4.0.mjs');
  const board=new Chess(window.__testBotFen);
  const reply=board.moves({verbose:true})[0];board.move(reply);
  const premove=board.moves({verbose:true})[0];
  return {reply:{from:reply.from,to:reply.to,promotion:reply.promotion},premove:{from:premove.from,to:premove.to}};
 });
 expect(sequence.premove).toBeTruthy();
 await page.locator('#arcade-board [data-square="'+sequence.premove.from+'"]').click();
 await page.locator('#arcade-board [data-square="'+sequence.premove.to+'"]').click();
 await expect(page.locator('#arcade-status')).toContainText('Premove queued');
 await expect(page.locator('#arcade-board .arcade-marks polygon')).toHaveCount(1);
 await page.evaluate(move=>window.__testBot.onmessage({data:{move}}),sequence.reply);
 await expect.poll(async()=>page.locator('#arcade-board [data-square="'+sequence.premove.to+'"] .chess-piece').count()).toBeGreaterThan(0);
 await expect(page.locator('#arcade-status')).toContainText(/Stockfish is choosing|Checkmate|position ended/i);
});

test('Endgame Survivor highlights the newest opponent reply with an arrow',async({page})=>{
 await stubScores(page);
 await page.addInitScript(()=>{
  const RealWorker=window.Worker;
  window.Worker=function(url,options){
   if(!String(url).includes('/play-strong-bot-worker.js'))return new RealWorker(url,options);
   return {onmessage:null,onerror:null,postMessage(message){if(message?.fen){window.__testFen=message.fen;window.__testWorker=this}},terminate(){}};
  };
 });
 await page.goto(base+'/arcade.html?game=endgame-survivor');
 await page.locator('#arcade-start').click();
 const whites=page.locator('#arcade-board .arcade-square:has(.chess-piece[alt^="White"])');
 for(let i=0;i<await whites.count();i++){await whites.nth(i).click();if(await page.locator('#arcade-board .arcade-square.available').count()){await page.locator('#arcade-board .arcade-square.available').first().click();break}}
 await expect.poll(()=>page.evaluate(()=>!!window.__testFen)).toBe(true);
 const reply=await page.evaluate(async()=>{const {Chess}=await import('/vendor/chess/chess-1.4.0.mjs');const m=new Chess(window.__testFen).moves({verbose:true})[0];return {from:m.from,to:m.to,promotion:m.promotion}});
 await page.evaluate(move=>window.__testWorker.onmessage({data:{move}}),reply);
 await expect(page.locator('#arcade-board .arcade-marks polygon')).toHaveCount(1);
 await expect(page.locator('#arcade-status')).toContainText(/Stockfish played|position ended|Checkmate/i);
});
