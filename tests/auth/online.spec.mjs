import {test,expect} from '@playwright/test';
const base='http://localhost:8788',password='Local-test-only-orchard-57931!';
const post=(request,route,data)=>request.post(base+route,{headers:{Origin:base},data});
async function login(page,username){
 await page.goto(base+'/account.html');
 await page.locator('#username').fill(username);
 await page.locator('#password').fill(password);
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await expect(page.locator('#profile-username')).toHaveText(username,{timeout:30000});
}
test('optimistic move appears without a server reply and rolls back on rejection',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();
 const pa=await a.newPage(),pb=await b.newPage();
 try{
  await pa.goto(base+'/online.html?friend=1');
  await pa.locator('#online-name').fill('FastAlice');
  await pa.getByRole('button',{name:'Play a Friend · Send a Link'}).click();
  await expect(pa.locator('#online-link')).toHaveValue(/invite=[a-f0-9]{32}/);
  const invitation=await pa.locator('#online-link').inputValue();
  await pb.goto(invitation);
  await pb.locator('#online-name').fill('FastBob');
  await pb.getByRole('button',{name:'Join game'}).click();
  await expect(pa.locator('#online-status')).toContainText('Your move',{timeout:15000});
  await expect(pb.locator('#online-status')).toContainText('Opponent to move',{timeout:15000});
  let unblock;
  const blocked=new Promise(resolve=>{unblock=resolve});
  let requested;
  const submitted=new Promise(resolve=>{requested=resolve});
  await pa.route('**/api/online/move',async route=>{
   requested();
   await blocked;
   await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Move rejected by server'})});
  });
  const sample=await pa.evaluate(()=>{
   const start=performance.now();
   document.querySelector('#online-board button[data-sq="e2"]').click();
   document.querySelector('#online-board button[data-sq="e4"]').click();
   const displayed=!!document.querySelector('#online-board button[data-sq="e4"] img');
   return {displayed,elapsed:performance.now()-start,status:document.querySelector('#online-status').textContent};
  });
  expect(sample.displayed).toBe(true);
  expect(sample.status).toContain('Sending move');
  console.log('LOCAL OPTIMISTIC CHESS DISPLAY: visible synchronously after',sample.elapsed.toFixed(3),'ms of JavaScript interaction; not server latency');
  await submitted;
  await expect(pa.locator('#online-board button[data-sq="e4"] img')).toHaveCount(1);
  await expect(pb.locator('#online-board button[data-sq="e4"] img')).toHaveCount(0);
  unblock();
  await expect(pa.locator('#online-status')).toContainText('Move rejected by server',{timeout:15000});
  await expect(pa.locator('#online-board button[data-sq="e4"] img')).toHaveCount(0);
  await expect(pa.locator('#online-board button[data-sq="e2"] img')).toHaveCount(1);
  await expect(pa.locator('#online-moves')).not.toContainText('e4');
 }finally{await a.close();await b.close()}
});

test('benchmark: measure local move acknowledgement and opponent visibility, without external traffic',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();
 const pa=await a.newPage(),pb=await b.newPage();
 try{
  await pa.goto(base+'/online.html?friend=1');
  await pa.locator('#online-name').fill('BenchAlice');
  await pa.getByRole('button',{name:'Play a Friend · Send a Link'}).click();
  await expect(pa.locator('#online-link')).toHaveValue(/invite=[a-f0-9]{32}/,{timeout:15000});
  const invitation=await pa.locator('#online-link').inputValue();
  expect(invitation).toMatch(/invite=[a-f0-9]{32}/);
  await pb.goto(invitation);
  await pb.locator('#online-name').fill('BenchBob');
  await pb.getByRole('button',{name:'Join game'}).click();
  await expect(pa.locator('#online-status')).toContainText('Your move',{timeout:15000});
  await expect(pb.locator('#online-status')).toContainText('Opponent to move',{timeout:15000});
  const moveResponsePromise=pa.waitForResponse(response=>response.url().includes('/api/online/move'),{timeout:15000});
  // Start before submitting clicks; otherwise we underreport end-to-end latency.
  const origin=Date.now();
  const starts=await pa.evaluate(()=>{
   const start=performance.now();
   window.__benchMoveStart=start;
   document.querySelector('#online-board button[data-sq="e2"]').click();
   document.querySelector('#online-board button[data-sq="e4"]').click();
   return start;
  });
  const moveResponse=await moveResponsePromise;
  const serverTiming=await moveResponse.headerValue('Server-Timing');
  expect(serverTiming).toMatch(/^chess;dur=\d+(?:\.\d+)?$/);
  await expect(pa.locator('#online-moves')).toContainText('e4',{timeout:15000});
  const ownMs=Date.now()-origin;
  await expect(pb.locator('#online-moves')).toContainText('e4',{timeout:15000});
  const opponentMs=Date.now()-origin;
  console.log('LOCAL-ONLY MOVE BENCHMARK (not internet): server processing',serverTiming,'; own board <=',ownMs,'ms; opponent board <=',opponentMs,'ms; local origin perf',starts);
  const samples=[Number(serverTiming.split('=')[1])];
  const deliverySamples=[opponentMs];
  for(const [player,peer,from,to,san] of [
   [pb,pa,'e7','e5','e5'],
   [pa,pb,'g1','f3','Nf3'],
   [pb,pa,'b8','c6','Nc6'],
   [pa,pb,'f1','c4','Bc4'],
   [pb,pa,'g8','f6','Nf6']
  ]){
   const responsePromise=player.waitForResponse(response=>response.url().includes('/api/online/move'),{timeout:15000});
   const started=Date.now();
   await player.evaluate(({from,to})=>{
    document.querySelector('#online-board button[data-sq="'+from+'"]').click();
    document.querySelector('#online-board button[data-sq="'+to+'"]').click();
   },{from,to});
   const response=await responsePromise;
   expect(response.status()).toBe(200);
   const timing=await response.headerValue('Server-Timing');
   expect(timing).toMatch(/^chess;dur=\d+(?:\.\d+)?$/);
   samples.push(Number(timing.split('=')[1]));
   await expect(peer.locator('#online-moves')).toContainText(san,{timeout:15000});
   deliverySamples.push(Date.now()-started);
  }
  const ordered=[...samples].sort((a,b)=>a-b);
  const deliveryOrdered=[...deliverySamples].sort((a,b)=>a-b);
  console.log('LOCAL CHESS BENCHMARK 6 MOVES (not internet): handler samples ms',JSON.stringify(samples),
   'median',ordered[Math.floor(ordered.length/2)],'p95-observed',ordered[Math.ceil(ordered.length*.95)-1],
   'opponent delivery samples ms',JSON.stringify(deliverySamples),
   'p95-observed delivery',deliveryOrdered[Math.ceil(deliveryOrdered.length*.95)-1]);
 }finally{await a.close();await b.close()}
});

test('two isolated guest browsers join once, exchange moves and safely resume',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext(),pageA=await a.newPage(),pageB=await b.newPage();const errors=[];
 pageA.on('pageerror',error=>errors.push(error.message));pageB.on('pageerror',error=>errors.push(error.message));
 try{
  await pageA.goto(base+'/play.html');await expect(pageA.getByText('Play Online',{exact:true})).toBeVisible();
  await pageA.goto(base+'/online.html?friend=1');
  await pageA.locator('#online-name').fill('Alice');
  await pageA.getByRole('button',{name:'Play a Friend · Send a Link'}).click();
  await expect(pageA.locator('#online-link')).toHaveValue(/invite=[a-f0-9]{32}/);
  const invitation=await pageA.locator('#online-link').inputValue();
  await pageB.goto(invitation);await pageB.locator('#online-name').fill('Bob');
  await pageB.getByRole('button',{name:'Join game'}).click();
  await expect(pageA.locator('#online-status')).toContainText(/Your move|Opponent to move/,{timeout:15000});
  await expect(pageB.locator('#online-top-name')).toContainText('Guest · Alice');
  await pageA.locator('#online-board button[data-sq="e2"]').click();
  await pageA.locator('#online-board button[data-sq="e4"]').click();
  await expect(pageB.locator('#online-moves')).toContainText('e4',{timeout:15000});
  await pageB.locator('#online-board button[data-sq="e7"]').click();
  await pageB.locator('#online-board button[data-sq="e5"]').click();
  await expect(pageA.locator('#online-moves')).toContainText('e5',{timeout:15000});
  await pageA.reload();await expect(pageA.locator('#online-moves')).toContainText('e5',{timeout:15000});
  expect(errors).toEqual([]);
 }finally{await a.close();await b.close()}
});
test('signed-in member requests, consent, targeted challenges, game history and replay',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext(),anonymous=await browser.newContext();
 const pa=await a.newPage(),pb=await b.newPage();
 try{
  await login(pa,'local_tester');await login(pb,'local_friend');
  const request=await post(pa.request,'/api/social/add',{username:'local_friend'});expect(request.status()).toBe(200);
  const requests=await(await pb.request.get(base+'/api/social/friends')).json();
  expect(requests.requests.some(x=>x.fromUser==='local_tester')).toBe(true);
  const invite=requests.requests.find(x=>x.fromUser==='local_tester');
  const accept=await post(pb.request,'/api/social/friend-respond',{id:invite.id,action:'accept'});expect(accept.status()).toBe(200);
  const friendsA=await(await pa.request.get(base+'/api/social/friends')).json();expect(friendsA.friends.some(x=>x.username==='local_friend')).toBe(true);
  const create=await post(pa.request,'/api/online/create',{kind:'invite',name:'Anything',targetUsername:'local_friend'});expect(create.status()).toBe(200);const game=await create.json();
  // A leaked account seat token alone must not grant access without its session.
  expect((await post(anonymous.request,'/api/online/state',{id:game.id,secret:game.secret})).status()).toBe(404);
  const sent=await post(pa.request,'/api/social/challenge',{username:'local_friend',gameId:game.id,gameSecret:game.secret});expect(sent.status()).toBe(200);
  const guestJoin=await post(anonymous.request,'/api/online/join',{id:game.id,name:'Intruder'});expect(guestJoin.status()).toBe(403);
  const inbox=await(await pb.request.get(base+'/api/social/inbox')).json();expect(inbox.challenges.some(x=>x.gameId===game.id)).toBe(true);
  const join=await post(pb.request,'/api/online/join',{id:game.id,name:'Anything'});expect(join.status()).toBe(200);const challenger=await join.json();
  const stolen=await post(anonymous.request,'/api/online/state',{id:game.id,secret:'0'.repeat(32)});expect(stolen.status()).toBe(404);
  const bad=await post(pb.request,'/api/online/move',{id:game.id,secret:challenger.secret,from:'e7',to:'e5'});expect(bad.status()).toBe(409);
  expect((await post(pa.request,'/api/online/move',{id:game.id,secret:game.secret,from:'e2',to:'e4'})).status()).toBe(200);
  expect((await post(pb.request,'/api/online/move',{id:game.id,secret:challenger.secret,from:'e7',to:'e5'})).status()).toBe(200);
  expect((await post(pa.request,'/api/online/resign',{id:game.id,secret:game.secret})).status()).toBe(200);
  const history=await(await pa.request.get(base+'/api/social/history?username=local_tester&page=0')).json();
  expect(history.games.some(x=>x.id===game.id&&x.result==='0-1')).toBe(true);
  await pb.goto(base+'/online.html?review='+game.id);
  await expect(pb.locator('#online-status')).toContainText('Replay',{timeout:15000});
  await pb.goto(base+'/profile/local_tester/game-history');
  await expect(pb.getByText('3+0 Unrated').first()).toBeVisible();
  await pb.goto(base+'/members.html');
  await expect(pb.locator('.member-challenge').first()).toBeVisible();
 }finally{await a.close();await b.close();await anonymous.close()}
});


test('live multiplayer keeps peer IPs private and makes no peer-to-peer or third-party requests',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();
 const pa=await a.newPage(),pb=await b.newPage();
 const urls=[],issues=[];
 for(const page of [pa,pb]){
  page.on('request',request=>urls.push(request.url()));
  page.on('pageerror',error=>issues.push(error.message));
 }
 try{
  const response=await pa.goto(base+'/online.html');
  expect(response.status()).toBe(200);
  // Local Wrangler can serve the global _headers CSP; the page-level policy must still enforce restrictions.
  const csp=await pa.locator('meta[http-equiv="Content-Security-Policy"]').last().getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-src 'none'");
  expect(await pa.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
  await pb.goto(base+'/online.html');
  await pa.locator('#online-name').fill('PrivacyA');
  await pb.locator('#online-name').fill('PrivacyB');
  await pa.getByRole('button',{name:'Find opponent'}).click();
  await pb.getByRole('button',{name:'Find opponent'}).click();
  await expect(pa.locator('#online-status')).toContainText(/Your move|Opponent to move/,{timeout:15000});
  await expect(pb.locator('#online-status')).toContainText(/Your move|Opponent to move/,{timeout:15000});
  const stateA=await pa.evaluate(async()=>{
   const game=JSON.parse(sessionStorage.getItem('elo-online-game'));
   const result=await fetch('/api/online/state',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(game)});
   return {status:result.status,body:await result.json()};
  });
  expect(stateA.status).toBe(200);
  expect(Object.keys(stateA.body).some(key=>/ip|address|browser|cookie|session|secret|token/i.test(key))).toBe(false);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every(url=>new URL(url).origin===base)).toBe(true);
  expect(issues).toEqual([]);
 }finally{await a.close();await b.close()}
});
