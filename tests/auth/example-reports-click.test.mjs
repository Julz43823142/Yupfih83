import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');
const examples=[
 {name:'MagnusCarlsen',slug:'magnus-carlsen',source:'lichess',account:'drnykterstein'},
 {name:'Hikaru',slug:'hikaru-nakamura',source:'chess.com',account:'hikaru'}
];

test('homepage example cards open the saved reports, not a fresh multi-month analysis',()=>{
 for(const {name,slug} of examples){
  assert.ok(html.includes('href="/example-'+slug+'.html" data-username="'+name+'"'),
    name+' must link to its saved report');
  assert.ok(!html.includes('href="/?analyze='+name+'" data-username="'+name+'"'),
    name+' must not launch an expensive live scan on example click');
 }
});

test('example pages do not redirect back into a new homepage scan',()=>{
 for(const {name,slug} of examples){
  const page=readFileSync(new URL('example-'+slug+'.html',root),'utf8');
  assert.ok(page.includes("data-example-player='"+name+"'"));
  assert.ok(!page.includes('location.replace('));
  assert.ok(page.includes('script.js?v=192-instant-examples'));
 }
});

test('bundled snapshot metadata matches exactly the number and source shown to users',()=>{
 for(const {name,slug,source,account} of examples){
  const snapshot=JSON.parse(readFileSync(new URL('assets/example-reports/'+slug+'.json',root),'utf8'));
  assert.equal(snapshot.username,name.toLowerCase());
  assert.equal(snapshot.source.platform,source);
  assert.equal(snapshot.source.account,account);
  assert.equal(snapshot.report.username,account);
  assert.equal(snapshot.report.version,'fairplay-v87-review-reliability');
  assert.ok(snapshot.report.games>0);
  assert.equal(snapshot.insights.length,snapshot.report.games);
 }
});

test('saved source transparency and optional fresh-scan link remain visible',()=>{
 assert.ok(script.includes('preset.report?.username!==source.account'));
 assert.ok(script.includes('preset.insights.length!==preset.report.games'));
 assert.ok(script.includes('This is a snapshot, not a live 5,000-game scan.'));
 assert.ok(script.includes('liveLink.href="/?analyze="+encodeURIComponent(exampleUsername)'));
 assert.ok(script.includes('renderReview(preset.report);'));
});

test('explicit fresh-analysis query remains supported separately',()=>{
 assert.ok(script.includes('new URLSearchParams(location.search).get("analyze")'));
 assert.ok(script.includes('form.requestSubmit();'));
});
