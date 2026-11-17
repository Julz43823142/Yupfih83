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
  assert.ok(page.includes('script.js?v=195-precomputed-chesscom-examples'));
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
