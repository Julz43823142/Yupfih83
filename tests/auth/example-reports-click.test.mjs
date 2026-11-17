import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');
const worker=readFileSync(new URL('client-v87-worker.js',root),'utf8');
const method=readFileSync(new URL('client-v87/fairplay_method3.py',root),'utf8');
const examples=[['MagnusCarlsen','magnus-carlsen'],['Hikaru','hikaru-nakamura']];

test('homepage and both example pages contain direct, working cross-navigation',()=>{
 for(const [name,slug] of examples){
  assert.ok(html.includes('href="/example-'+slug+'.html" data-username="'+name+'"'));
 }
 for(const [player,slug] of examples){
  const page=readFileSync(new URL('example-'+slug+'.html',root),'utf8');
  assert.ok(page.includes("data-example-player='"+player+"'"));
  for(const [name,target] of examples){
   assert.ok(page.includes('href="/example-'+target+'.html" data-username="'+name+'"'),
    slug+' must navigate to '+target);
  }
  assert.ok(page.includes('script.js?v=193-chesscom-5000-examples'));
  assert.ok(!page.includes('location.replace('));
 }
});

test('examples submit live Chess.com review once all form handlers are ready',()=>{
 const start=script.indexOf('const exampleUsername=document.body.dataset.examplePlayer;');
 const end=script.indexOf('form.addEventListener("submit"',start);
 assert.ok(start>0&&end>start);
 for(const [name] of examples){
  const hooks={};
  const input={value:''},messages={textContent:''};
  const context={
   document:{body:{dataset:{examplePlayer:name}}},
   usernameInput:input,statusText:messages,
  };
  runInNewContext(script.slice(start,end),context);
  assert.equal(input.value,name);
  assert.match(messages.textContent,/Chess.com.*5,000/);
 }
 const boot=script.slice(script.lastIndexOf('if(activeExample){'));
 assert.match(boot,/DOMContentLoaded/);
 assert.match(boot,/form\.requestSubmit\(\)/);
 assert.match(script,/await runReview\(username,requestId\)/);
});

test('old saved report files and Lichess sources cannot be used for live examples',()=>{
 const start=script.indexOf('const exampleUsername=document.body.dataset.examplePlayer;');
 const end=script.indexOf('form.addEventListener("submit"',start);
 const controller=script.slice(start,end);
 assert.doesNotMatch(controller,/assets\/example-reports|loadPreset|renderReview\(preset/);
 assert.doesNotMatch(controller,/lichess|drnykterstein/i);
 assert.doesNotMatch(script,/This is a snapshot, not a live 5,000-game scan/);
});

test('v87 runner collects recent Chess.com archives for up to 5,000 eligible games',()=>{
 assert.match(worker,/https:\/\/api\.chess\.com\/pub\/player\//);
 assert.match(worker,/\.sort\(\)\.reverse\(\)\.slice\(0,240\)/);
 assert.match(worker,/candidates<5300/);
 assert.match(method,/LIMIT=5000/);
 assert.match(method,/sample_limit=min\(LIMIT/);
 assert.match(method,/sorted\(\(g for g in games if type\(g\.rated\) is bool\),key=lambda g:\(g\.ended,g\.identity\)\)\[-sample_limit:\]/);
});

test('live example reports do not overlay partial independent snapshot game counts',()=>{
 assert.match(script,/if\(activeExample\|\|user==='magnuscarlsen'/);
 assert.match(script,/if\(exampleAccounts\.has\(username\.toLowerCase\(\)\)&&!activeExample\)/);
});
