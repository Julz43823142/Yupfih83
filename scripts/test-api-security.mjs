import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../functions/_shared/read-json.js',import.meta.url),'utf8');
const {readJsonPayload}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
function request(body,headers={}){
 return new Request('https://eloscanner.com/api/puzzle-leaderboard',{
  method:'POST',headers:{'Content-Type':'application/json',...headers},body
 });
}
const good=await readJsonPayload(request(JSON.stringify({action:'start',mode:'sprint5'})));
assert.deepEqual(good.data,{action:'start',mode:'sprint5'});
assert.equal((await readJsonPayload(request('{"action":'))).status,400);
assert.equal((await readJsonPayload(request('null'))).status,400);
assert.equal((await readJsonPayload(request('[]'))).status,400);
assert.equal((await readJsonPayload(request('{"a":1}',{'Content-Type':'text/plain'}))).status,415);
assert.equal((await readJsonPayload(request('{"a":1}',{Origin:'https://other-site.example'}))).status,403);
assert.equal((await readJsonPayload(request('{"a":1}',{'Sec-Fetch-Site':'cross-site'}))).status,403);
assert.equal((await readJsonPayload(request('{"a":1}',{Origin:'https://eloscanner.com'}))).data.a,1);
assert.equal((await readJsonPayload(request(JSON.stringify({input:'X'.repeat(10000)})))).status,413);
assert.equal((await readJsonPayload(request('{"a":1}'),3)).status,413);
assert.equal((await readJsonPayload(new Request('https://eloscanner.com/api/puzzle-leaderboard',{method:'POST',headers:{'Content-Type':'application/json'}}))).status,400);
const frontend=readFileSync(new URL('../puzzles.js',import.meta.url),'utf8');
assert.ok(frontend.includes('prefetchNext(kind)'));
assert.ok(frontend.includes('prefetchedPuzzle.previousId===puzzle?.id'));
const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
assert.ok(headers.includes("form-action 'self'"));
assert.ok(headers.includes('max-age=3600'));
console.log('PASS: bounded JSON, origin checks, invalid inputs, static cache configuration and puzzle prefetch.');
