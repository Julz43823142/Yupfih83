import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');
const builder=readFileSync(new URL('scripts/build_verified_examples.py',root),'utf8');
const examples=[['MagnusCarlsen','magnus-carlsen'],['Hikaru','hikaru-nakamura']];

test('both example pages remain directly navigable from homepage and each other',()=>{
 for(const [name,slug] of examples){
  assert.ok(html.includes('href="/example-'+slug+'.html" data-username="'+name+'"'));
  const page=readFileSync(new URL('example-'+slug+'.html',root),'utf8');
  assert.ok(page.includes("data-example-player='"+name+"'"));
  assert.ok(page.includes('script.js?v=198-speed'));
  for(const [otherName,otherSlug] of examples)
   assert.ok(page.includes('href="/example-'+otherSlug+'.html" data-username="'+otherName+'"'));
 }
});

test('example pages fetch verified saved Chess.com reports, not a live web worker',()=>{
 assert.match(script,/async function openSavedExample\(\)/);
 assert.match(script,/fetch\("\/assets\/example-reports-v2\/"\+slug\+"\.json"/);
 assert.match(script,/saved\.source\?\.platform!=="chess\.com"/);
 assert.match(script,/saved\.source\?\.account!==account/);
 assert.match(script,/saved\.report\?\.games!==5000/);
 assert.match(script,/saved\.sample\?\.actualGames!==5000/);
 assert.match(script,/saved\.insights\.length!==5000/);
 assert.match(script,/renderReview\(saved\.report\)/);
 assert.match(script,/renderPlayer\(saved\.profile,saved\.stats\|\|\{\},exampleUsername,\{preset:true\}\)/);
 const start=script.lastIndexOf('if(activeExample){');
 const tail=script.slice(start);
 assert.match(tail,/openSavedExample\(\)/);
 assert.doesNotMatch(tail,/requestSubmit|runReview|analyzeOnVisitorDevice/);
});

test('no invalid or outdated short snapshots are promoted to 5000-game examples',()=>{
 assert.doesNotMatch(script.slice(script.indexOf('async function openSavedExample()'),script.indexOf('form.addEventListener("submit"')),/assets\/example-reports\//);
 assert.match(builder,/if len\(games\) != 5000:/);
 assert.match(builder,/Refusing incomplete example report/);
 assert.match(builder,/"platform": "chess\.com"/);
 assert.match(builder,/review\(account, progress=/);
 assert.match(builder,/datetime\.now\(timezone\.utc\)/);
});

test('users can explicitly start a fresh live analysis separately',()=>{
 assert.ok(script.includes('link.href="/?analyze="+encodeURIComponent(exampleUsername)'));
 assert.ok(script.includes('new URLSearchParams(location.search).get("analyze")'));
 assert.ok(script.includes('await runReview(username,requestId)'));
});

test('both Chess.com avatars display on homepage and on both example pages without API prefetch',()=>{
 const avatars=[
  ['MagnusCarlsen','3889224.121e2094.200x200o.361c2f8a59c2.jpg'],
  ['Hikaru','15448422.88c010c1.200x200o.3c5619f5441e.png']
 ];
 for(const file of ['index.html','example-hikaru-nakamura.html','example-magnus-carlsen.html']){
  const page=readFileSync(new URL(file,root),'utf8');
  for(const [account,image] of avatars){
   assert.ok(page.includes('data-player-avatar="'+account+'"'),'missing avatar for '+account+' in '+file);
   assert.ok(page.includes('images.chesscomfiles.com/uploads/v1/user/'+image));
  }
 }
 assert.match(script,/document\.querySelectorAll\("\[data-player-avatar\] img"\)/);
 assert.doesNotMatch(script,/if\(!document\.body\.dataset\.examplePlayer\)for\(const username of \["MagnusCarlsen","Hikaru"\]\)/);
});

test('Magnus example renders real Chess.com master-game aggregates without inventing a v87 review',()=>{
 const profile=JSON.parse(readFileSync(new URL('assets/example-reports-v2/magnus-carlsen-profile.json',root),'utf8'));
 assert.deepEqual(profile.source.platform,'chess.com');
 assert.equal(profile.source.account,'magnuscarlsen');
 assert.equal(profile.profile.username,'magnuscarlsen');
 assert.equal(profile.profile.title,'GM');
 assert.match(script,/async function showMagnusPublicProfile\(\)/);
 assert.match(script,/await showMagnusPublicProfile\(\)/);
 assert.ok(script.includes('renderPlayer(publicData.profile,{},"MagnusCarlsen",{preset:true})'));
 assert.ok(script.includes("masters-games-database"));
 assert.match(script,/insights\.hidden=true/);
 const css=readFileSync(new URL('style.css',root),'utf8');
 assert.match(css,/body\[data-example-player\] \.sample-section\{display:block!important\}/);
 assert.doesNotMatch(css,/body\[data-example-player\] \.sample-section\{display:none!important\}/);
});

test('Magnus saved master-games report has independently sourced games, colors, and openings',()=>{
 const masters=JSON.parse(readFileSync(new URL('assets/example-reports-v2/magnus-carlsen-master-games.json',root),'utf8'));
 assert.equal(masters.source.platform,'chess.com');
 assert.equal(masters.source.dataset,'masters-games-database');
 assert.equal(masters.source.url,'https://www.chess.com/games/magnus-carlsen');
 assert.equal(masters.games,6897);
 assert.equal(masters.colors.white.games+masters.colors.black.games,masters.games);
 assert.equal(masters.outcomes.winPercent+masters.outcomes.drawPercent+masters.outcomes.lossPercent,100);
 assert.equal(masters.openings.white.length,5);
 assert.equal(masters.openings.black.length,5);
 assert.ok(script.includes("magnus-carlsen-master-games.json"));
 assert.ok(script.includes("masters.games.toLocaleString"));
 assert.match(script,/Most played openings/);
 assert.match(script,/move accuracy, time-control splits and a 5,000-game v87 review are not claimed/);
});
