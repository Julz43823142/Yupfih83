import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });

test('Fallen King opens account slots, launches New Game and displays first intro', async ({page}) => {
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 const base='http://localhost:8788';
 const baseWorld={width:52,height:40,version:5,spawn:{x:26,y:29},tiles:Array(40).fill('.'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],music:'willowmere'};
 const saves={A:null,B:null,C:null};
 await page.route('**/api/fallen-king/world',route=>route.fulfill({json:baseWorld}));
 await page.route('**/api/fallen-king/saves**',async route=>{
  const method=route.request().method();
  const slot=new URL(route.request().url()).searchParams.get('slot');
  if(method==='GET'&&!slot){await route.fulfill({json:{slots:Object.fromEntries(Object.entries(saves).map(([k,v])=>[k,v?{savedAt:new Date().toISOString(),scene:v.chapter.scene,step:v.chapter.step}:null]))}});return;}
  if(method==='GET'){await route.fulfill({json:{slot,save:saves[slot]}});return;}
  if(method==='PUT'){saves[slot]=route.request().postDataJSON();await route.fulfill({json:{ok:true,slot}});return;}
  await route.fulfill({status:405,json:{error:'unsupported'}});
 });
 await page.goto(base+'/fallen-king.html');
 await expect(page.locator('#fallen-start-menu')).toBeVisible({timeout:20000});
 await expect(page.locator('#fallen-start-status')).toContainText('Select New Game');
 await page.locator('#fallen-start-slots .fallen-slot-row').first().getByRole('button',{name:'New Game'}).click();
 await expect(page.locator('#fallen-story-intro')).toBeVisible({timeout:20000});
 await expect(page.locator('#fallen-story-next')).toBeVisible();
 await expect(page.locator('#fallen-start-menu')).toBeHidden();
 const intro=await page.locator('#fallen-story-art').evaluate(e=>({w:e.width,h:e.height}));
 expect(intro).toEqual({w:960,h:720});
 await page.locator('#fallen-story-skip').click();
 await expect(page.locator('#fallen-story-intro')).toBeHidden();
 await expect(page.locator('#fallen-dialogue')).toBeVisible();
 expect(errors).toEqual([]);
});
