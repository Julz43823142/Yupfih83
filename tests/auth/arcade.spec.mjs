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
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/minigames.html');
 await expect(page.locator('.hub-card.live')).toHaveCount(10); // Knight Maze plus nine new games.
 for(const game of games){
  await page.goto(base+'/arcade.html?game='+game);
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
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
