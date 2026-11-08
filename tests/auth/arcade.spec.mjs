import {test,expect} from '@playwright/test';
const base='http://localhost:8788';
const games=['endgame-survivor','guess-the-elo','chess-memory','missing-piece','safe-square-rush','falling-board','queen-chase','chess-block-party','pawn-dash'];
async function stubScores(page){
 await page.route('**/api/arcade**',async route=>{
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

test('all nine games load a stable 64-square board, piece SVGs and clock/score with no JS exceptions',async({page})=>{
 await stubScores(page);
 const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')network.push(m.text())});
 page.on('response',r=>{if(r.status()>=400&&/arcade|chess-board|chess-1.4/i.test(r.url()))network.push(r.status()+' '+r.url())});
 page.on('requestfailed',r=>network.push(r.url()+' '+r.failure()?.errorText));
 await page.goto(base+'/minigames.html');
 await expect(page.locator('.hub-card.live')).toHaveCount(10); // Knight Maze plus nine new games.
 const links=await page.locator('.hub-card.live').evaluateAll(cards=>cards.map(a=>new URL(a.href).pathname+new URL(a.href).search));
 expect(new Set(links).size).toBe(10);
 expect(links).toContain('/knight-maze.html');
 for(const game of games)expect(links).toContain('/arcade.html?game='+game);
 for(const game of games){
  await page.goto(base+'/arcade.html?game='+game);
  await page.waitForTimeout(350);
  if(await page.locator('#arcade-board .arcade-square').count()!==64)console.log('ARCADE FAILURE',game,JSON.stringify({errors,network,location:page.url(),scripts:await page.locator('script').evaluateAll(all=>all.map(e=>e.src))}));
  await expect(page.locator('#arcade-board .arcade-square')).toHaveCount(64);
  await expect(page.locator('#arcade-board .arcade-marks')).toHaveCount(1);
  await page.getByRole('button',{name:'Start game'}).click();
  await expect.poll(()=>page.locator('#arcade-board .chess-piece').count()).toBeGreaterThan(0);
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
 const legal=page.locator('#arcade-board .arcade-square.available.goal-colour').first();
 await expect(legal).toBeVisible();
 const a=await source.boundingBox(),b=await legal.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await page.mouse.down({button:'right'});
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});
 await page.mouse.up({button:'right'});
 await expect.poll(()=>page.locator('#arcade-board .arcade-marks polygon, #arcade-board .arcade-marks polyline').count()).toBeGreaterThan(0);
 await drag(page,source,legal);
 await expect(page.locator('#arcade-score')).toHaveText('1');
 await page.goto(base+'/arcade.html?game=falling-board');
 await page.locator('#arcade-start').click();
 const knight=page.locator('#arcade-board .arcade-square:has(.chess-piece.piece-blue)').first();
 await knight.click();
 const target=page.locator('#arcade-board .arcade-square.available').first();
 await drag(page,knight,target);
 await expect(page.locator('#arcade-score')).toHaveText('1');
 expect(errors).toEqual([]);
});

test('Missing Piece allows palette placement followed by a real chess.js checkmate',async({page})=>{
 await stubScores(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/arcade.html?game=missing-piece');
 await page.locator('#arcade-start').click();
 await page.getByRole('button',{name:'Pick white Queen'}).click();
 await page.locator('#arcade-board [data-square="g6"]').click();
 await expect(page.locator('#arcade-status')).toContainText('Now find mate in one');
 await page.locator('#arcade-board [data-square="g6"]').click();
 await expect(page.locator('#arcade-board [data-square="g7"]')).toHaveClass(/available/);
 await page.locator('#arcade-board [data-square="g7"]').click();
 await expect(page.locator('#arcade-score')).toHaveText('1');
 expect(errors).toEqual([]);
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

test('Safe Square Rush, Pawn Dash and Queen Chase all support actual piece dragging',async({page})=>{
 await stubScores(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/arcade.html?game=safe-square-rush');
 await page.locator('#arcade-start').click();
 const source=page.locator('#arcade-board .arcade-square:has(.chess-piece[alt^="White"])').first();
 await source.click();
 const dest=page.locator('#arcade-board .arcade-square.available.safe-zone').first();
 await expect(dest).toBeVisible();
 await drag(page,source,dest);
 await expect(page.locator('#arcade-score')).toHaveText('1');

 await page.goto(base+'/arcade.html?game=pawn-dash');
 await page.locator('#arcade-start').click();
 const pawn=page.locator('#arcade-board [data-square="e1"]');
 await expect(pawn.locator('.chess-piece')).toBeVisible();
 await pawn.click();
 const dest2=page.locator('#arcade-board .arcade-square.available:not(:has(.chess-piece))').first();
 await expect(dest2).toBeVisible();
 const pawnTarget=await dest2.getAttribute('data-square');
 await drag(page,pawn,dest2);
 await expect(page.locator('#arcade-score')).toHaveText('1');
 await expect(page.locator('#arcade-board [data-square="'+pawnTarget+'"] .chess-piece[alt^="White"]')).toBeVisible();

 await page.goto(base+'/arcade.html?game=queen-chase');
 await page.locator('#arcade-start').click();
 const rook=page.locator('#arcade-board [data-square="a8"]');
 await expect(rook.locator('.chess-piece')).toBeVisible();
 await rook.click();
 const dest3=page.locator('#arcade-board .arcade-square.available').first();
 const target=await dest3.getAttribute('data-square');
 await drag(page,rook,dest3);
 await expect(page.locator('#arcade-board [data-square="'+target+'"] .chess-piece')).toBeVisible();
 expect(errors).toEqual([]);
});
