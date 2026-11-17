import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
for(const [slug,account] of [['hikaru-nakamura','hikaru'],['magnus-carlsen','magnuscarlsen']]){
 test('verified saved Chess.com example for '+account+' exists and contains exactly 5000 games',()=>{
  const path=new URL('assets/example-reports-v2/'+slug+'.json',root);
  if(account==='magnuscarlsen' && !existsSync(path)){
   const markerPath=new URL('assets/example-reports-v2/magnus-carlsen-unavailable.json',root);
   assert.ok(existsSync(markerPath),'Missing verified Magnus unavailable marker');
   const marker=JSON.parse(readFileSync(markerPath,'utf8'));
   assert.deepEqual(marker.source,{platform:'chess.com',account});
   assert.equal(marker.available,false);
   assert.equal(marker.reason,'no_public_archives');
   assert.equal(marker.actualGames,0);
   return;
  }
  assert.ok(existsSync(path),
   'Precomputed Chess.com report is missing. Do not merge or deploy this PR until the generator has committed the real JSON.');
  const j=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(j.schema,2);
  assert.deepEqual(j.source,{platform:'chess.com',account});
  assert.equal(j.report.username,account);
  assert.equal(j.report.version,'fairplay-v87-review-reliability');
  assert.equal(j.report.games,5000);
  assert.equal(j.sample.actualGames,5000);
  assert.equal(j.sample.requestedGames,5000);
  assert.equal(j.insights.length,5000);
  assert.equal(Object.values(j.sample.timeControls).reduce((a,b)=>a+b,0),5000);
 });
}
