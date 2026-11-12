import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });

test('Fallen King opens account slots, launches New Game and displays first intro', async ({page}) => {
 test.setTimeout(45000);
 const errors=[];
 page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER CONSOLE',msg.text());});
 page.on('requestfailed',req=>{if(/fallen-king/.test(req.url()))console.log('FAILED REQUEST',req.url(),req.failure()?.errorText);});
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
 console.log('CHECKPOINT navigating game');
 await page.goto(base+'/fallen-king.html',{waitUntil:'domcontentloaded',timeout:15000});
 console.log('CHECKPOINT game DOM loaded');
 await expect(page.locator('#fallen-start-menu')).toBeVisible({timeout:10000});
 console.log('CHECKPOINT start menu visible',await page.locator('#fallen-start-status').textContent());
 await expect(page.locator('#fallen-start-status')).toContainText('Select New Game');
 console.log('CHECKPOINT click New Game');
 await page.locator('#fallen-start-slots .fallen-slot-row').first().getByRole('button',{name:'New Game'}).click({timeout:8000});
 console.log('CHECKPOINT New Game button clicked');
 await expect(page.locator('#fallen-story-intro')).toBeVisible({timeout:10000});
 console.log('CHECKPOINT intro visible');
 await expect(page.locator('#fallen-story-next')).toBeVisible();
 await expect(page.locator('#fallen-start-menu')).toBeHidden();
 const intro=await page.locator('#fallen-story-art').evaluate(e=>({w:e.width,h:e.height}));
 expect(intro).toEqual({w:960,h:720});
 // This panel contains baked-in English narration at the bottom. If the
 // image never decodes, the canvas remains a uniformly dark placeholder.
 await expect.poll(()=>page.locator('#fallen-story-art').evaluate(c=>{
  const p=c.getContext('2d').getImageData(480,630,1,1).data;
  return Math.max(p[0],p[1],p[2]);
 }),{timeout:15000}).toBeGreaterThan(120);
 console.log('CHECKPOINT approved illustration visibly rendered');
 console.log('CHECKPOINT click skip');
 await page.locator('#fallen-story-skip').click({timeout:8000});
 await expect(page.locator('#fallen-story-intro')).toBeHidden();
 await expect(page.locator('#fallen-dialogue')).toBeVisible({timeout:10000});
 console.log('CHECKPOINT gameplay playable');
 expect(errors).toEqual([]);
});
