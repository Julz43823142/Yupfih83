import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const script=readFileSync(new URL('script.js',root),'utf8');
const css=readFileSync(new URL('style.css',root),'utf8');
const home=readFileSync(new URL('index.html',root),'utf8');
const headers=readFileSync(new URL('_headers',root),'utf8');

test('offscreen report charts are deferred and stale chart observers disconnected',()=>{
 assert.match(script,/const deferredTimelineObservers=new WeakMap\(\)/);
 assert.match(script,/typeof IntersectionObserver==="function"/);
 assert.match(script,/parent\.getBoundingClientRect\(\)\.top>window\.innerHeight\+450/);
 assert.match(script,/previous\.disconnect\(\)/);
 assert.match(script,/parent\.dataset\.timelineReady="true"/);
 assert.match(css,/\.timeline-plot\.timeline-awaiting-paint/);
});

test('large hidden opening lists are built only on expansion',()=>{
 assert.match(script,/details\.addEventListener\("toggle"/);
 assert.match(script,/if\(!details\.open\|\|details\.dataset\.populated\)return/);
 assert.match(script,/document\.createDocumentFragment\(\)/);
 assert.match(script,/for\(const item of ranked\.slice\(6\)\)openingRow\(fragment,item,fullTotal\)/);
});

test('homepage reuses rankings rather than polling API while cache is fresh',()=>{
 assert.match(home,/if\(hasCache\)\{loading=false;return;\}/);
 assert.match(home,/await Promise\.all\(\[\['sprint5','home-sprint-rank'\]/);
});

test('large precomputed reports and stable fonts use longer public caching',()=>{
 assert.match(headers,/\/assets\/example-reports-v2\/\*[\s\S]*?Cache-Control: public, max-age=86400/);
 assert.match(headers,/\/vendor\/fonts\/\*[\s\S]*?max-age=31536000, immutable/);
 assert.match(headers,/\/account\n  Cache-Control: no-store/);
 assert.match(headers,/\/\n  Cache-Control: no-store/);
});

test('successful review no longer waits for a cosmetic multi-second progress animation',()=>{
 const start=script.indexOf('async function finishReviewProgress(){');
 const end=script.indexOf('function placeExampleCardsNearOverview()',start);
 assert.ok(start>=0&&end>start);
 const complete=script.slice(start,end);
 assert.match(complete,/showReviewProgress\("Review complete\.","complete",true\)/);
 assert.match(complete,/stopReviewProgress\(\)/);
 assert.doesNotMatch(complete,/await wait\(|duration=2600/);
});
