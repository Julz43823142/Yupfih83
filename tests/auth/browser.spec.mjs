import { test, expect } from '@playwright/test';
const base = 'http://localhost:8788';
test('real Workers/D1 login, closed signup, responsive account UI and logout', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/account.html?view=signup');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.locator('#signup-submit')).toBeDisabled();
  await expect(page.locator('#account-status')).toContainText('Registration is currently unavailable.');
  await expect(page.locator('#login-form')).toBeHidden();
  const closed = await page.request.post(base + '/api/auth/sign-up/email', { headers: { Origin: base }, data: { email: 'must-not-register@example.com', name: 'someone', password: 'LongButNeverUsed-password!' } });
  expect(closed.status()).toBe(403);
  await page.goto(base + '/account.html');
  await expect(page.locator('#login-form button')).toBeEnabled();
  await page.locator('#username').fill('local_tester');
  await page.locator('#password').fill('Local-test-only-orchard-57931!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
  await expect(page.locator('.account-nav')).toHaveText('Local_tester');
  const cookies = await page.context().cookies();
  expect(cookies.some(c => c.httpOnly && c.name.includes('session_token'))).toBeTruthy();
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => /token|session/i.test(k)))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/eloscanner-account-mobile.png', fullPage: true });
  await page.locator('#sign-out').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await page.reload(); await expect(page.locator('#login-form')).toBeVisible();
  expect(errors).toEqual([]);
  // Homepage chess API calls may fail offline; assess only new auth scripts there.
  errors.length = 0;
  await page.goto(base + '/');
  await expect(page.locator('.account-nav a')).toHaveText(['Log in', 'Sign up']);
  await expect(page.locator('header .mobile-chess-menu')).toHaveCount(0);
  await page.goto(base + '/minigames.html');
  await expect(page.locator('header .elo-global-menu')).toBeVisible();
  await expect(page.locator('.account-nav a')).toHaveText(['Log in', 'Sign up']);
});

test('site-wide script policy blocks injected code while legitimate inline scripts and chess workers operate', async ({ page, context }) => {
  const violations=[];
  page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))violations.push(m.text());});
  // Deterministic public data, no request to a real player or write to production.
  await context.route('https://api.chess.com/**',route=>route.fulfill({json:route.request().url().endsWith('/archives')?{archives:[]}:{username:'security_fixture',chess_rapid:{last:{rating:1400}}}}));
  await context.route('**/api/puzzle-leaderboard**',route=>route.fulfill({json:{entries:[{nickname:'<img src=x onerror=alert(1)>',score:12}]}}));
  await context.route('**/api/opening-catalog**',route=>route.fulfill({json:[]}));
  await context.route('**/api/opening-explorer**',route=>route.fulfill({json:{white:1,black:1,draws:1,moves:[]}}));
  for(const path of ['/','/account.html','/analysis.html','/play.html','/puzzles.html','/player-prep.html','/opening-explorer.html','/puzzle-top100.html']){
    await page.goto(base+path);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(page.locator('.account-nav')).toBeVisible();
  }
  // Ranking text is displayed literally, not interpreted as HTML.
  await expect(page.getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible();
  expect(await page.locator('table img').count()).toBe(0);
  expect(violations).toEqual([]);
  await page.goto(base+'/analysis.html?fen='+encodeURIComponent('<svg onload=alert(1)>'));
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).not.toContain("'unsafe-inline'");
  for (const enginePath of ['/vendor/stockfish/stockfish-19-lite-single.js','/engine/stockfish-19-lite-single.js','/stockfish-worker.js']) {
  const engine=await page.evaluate(path=>new Promise((resolve,reject)=>{
    const worker=new Worker(path);
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Engine timeout'));},25000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
    worker.onmessage=e=>{if(String(e.data).includes('uciok')){clearTimeout(timer);worker.terminate();resolve(true);}};
    worker.postMessage('uci');
  }),enginePath);
  expect(engine).toBe(true);
  }
  await page.goto(base+'/');
  const pythonReady=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const worker=new Worker('/client-v87-worker.js');
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Python runtime timeout'));},40000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
    worker.onmessage=e=>{
      if(e.data.phase==='analyzing'){clearTimeout(timer);worker.terminate();resolve(true);}
      else if(e.data.type==='error'){clearTimeout(timer);worker.terminate();reject(Error(e.data.error));}
    };
    worker.postMessage({type:'run',username:'security_fixture'});
  }));
  expect(pythonReady).toBe(true);
  expect(violations).toEqual([]);
  const blocked=await page.evaluate(async()=>{
    const seen=[];document.addEventListener('securitypolicyviolation',e=>seen.push(e.effectiveDirective));
    const script=document.createElement('script');script.textContent='window.injectionRan=true';document.head.append(script);
    const image=document.createElement('img');image.setAttribute('onerror','window.injectionRan=true');image.src='/nonexistent-test-image.png';document.body.append(image);
    const remote=document.createElement('script');remote.src='https://attacker.invalid/attack.js';document.head.append(remote);
    await new Promise(resolve=>setTimeout(resolve,300));
    return {ran:window.injectionRan===true,seen};
  });
  expect(blocked.ran).toBe(false);
  expect(blocked.seen).toContain('script-src-elem');
  expect(blocked.seen).toContain('script-src-attr');
  for(const path of ['/vendor/pyodide/console.html','/.env','/lib/auth/config.mjs','/migrations/auth/0001_auth.sql','/scripts/provision-auth-user.mjs']){
    expect((await page.request.get(base+path)).status()).toBe(404);
  }
});

test('real Workers/D1 validates puzzle scores and denies replay, fabricated scores and illegal maze moves',async({request})=>{
  const post=(path,data)=>request.post(base+path,{headers:{Origin:base},data});
  const path='/api/puzzle-leaderboard';
  const started=await post(path,{action:'start',mode:'survival'});
  expect(started.status()).toBe(200);
  const {session}=await started.json();
  const bank=await(await request.get(base+'/assets/puzzle-bank.json')).json();
  const row=bank[0];
  expect((await post(path,{action:'solve',session,puzzleId:String(row[0]),solution:String(row[2]).trim().toLowerCase().split(/\s+/).slice(1).join(' ')})).status()).toBe(200);
  const score={mode:'survival',nickname:'SecurityFixture',score:1,session};
  expect((await post(path,{...score,score:99999})).status()).toBe(409);
  expect((await post(path,score)).status()).toBe(200);
  expect((await post(path,score)).status()).toBe(409);
  const ranking=await(await request.get(base+path+'?mode=survival')).json();
  expect(ranking.entries.some(e=>e.nickname==='SecurityFixture'&&e.score===1)).toBe(true);
  const maze=await post('/api/knight-maze',{action:'start'});
  expect(maze.status()).toBe(200);
  const {run}=await maze.json();
  expect((await post('/api/knight-maze',{action:'move',id:run.id,to:run.position})).status()).toBe(400);
  expect((await post('/api/knight-maze',{action:'move',id:crypto.randomUUID(),to:run.position})).status()).toBe(404);
});
