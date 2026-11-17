import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../../',import.meta.url);
const worker=readFileSync(new URL('client-v87-worker.js',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');

async function runSimulatedReview({firstCount,secondCount,firstReported,secondReported}){
 const prefix='https://api.chess.com/pub/player/hikaru';
 const months=[prefix+'/games/2026/11',prefix+'/games/2026/10'];
 const row={rules:'chess',time_class:'blitz',rated:true,end_time:1790000000};
 const rows=[Array(firstCount).fill(row),Array(secondCount).fill(row)];
 const messages=[],visited=[],progressMessages=[];
 let latestInput=null,clock=0;
 const python={
  FS:{
   writeFile(_path,payload){latestInput=JSON.parse(payload);},
   readFile(){
    const count=Object.keys(latestInput.archives).length===1?firstReported:secondReported;
    return JSON.stringify({version:'fairplay-v87-review-reliability',username:'hikaru',games:count});
   }
  },
  globals:{set(){}},
  runPython(){}
 };
 const context={
  loading:null,
  preparePython:async()=>python,
  chessJSON:async url=>{
   if(url===prefix)return {username:'hikaru'};
   if(url===prefix+'/games/archives')return {archives:months};
   const index=months.indexOf(url);
   assert.ok(index>=0,'Unexpected Chess.com archive '+url);
   visited.push(url);
   return {games:rows[index]};
  },
  progress:message=>progressMessages.push(message),
  self:{postMessage:message=>messages.push(message)},
  Date:{now:()=>{clock+=600;return clock}},
  setTimeout,Promise,Math,JSON,Number,String,RegExp,Set,Error,encodeURIComponent
 };
 const a=worker.indexOf('async function run(username){');
 const b=worker.indexOf('self.v87Progress=',a);
 assert.ok(a>0&&b>a,'Worker run() must exist');
 await runInNewContext(worker.slice(a,b)+'\nrun("hikaru")',context);
 return {visited,messages,progressMessages};
}

test('the v87 worker does not publish a 164-game review while older Chess.com archives remain',async()=>{
 const {visited,messages,progressMessages}=await runSimulatedReview({
  firstCount:5300,secondCount:5300,firstReported:164,secondReported:5000
 });
 assert.equal(visited.length,2,'Must fetch the older month after an underfilled review');
 assert.deepEqual(messages.map(m=>m.type),['profile','complete']);
 assert.equal(messages[1].result.games,5000,'Never publish the 164-game intermediate result');
 assert.equal(messages[1].result.archive_months_checked,2);
 assert.equal(messages[1].result.source_platform,'chess.com');
 assert.ok(progressMessages.some(m=>m.includes('164 / 5,000')));
});

test('a review reports the honest available game count when all archives are exhausted',async()=>{
 const {visited,messages}=await runSimulatedReview({
  firstCount:5300,secondCount:0,firstReported:164,secondReported:164
 });
 assert.equal(visited.length,2);
 assert.equal(messages[1].result.games,164);
 assert.equal(messages[0].result.archive_months_checked,2);
 assert.equal(messages[1].result.archive_months_available,2);
});

test('the main script always loads the updated review worker',()=>{
 assert.ok(script.includes('/client-v87-worker.js?v=20261117-backfill-194'));
 assert.ok(script.includes('report.archive_months_checked'));
 assert.ok(script.includes('of up to 5,000 eligible games reviewed'));
});

test('the minigames leaderboard link has no blue box or button padding',()=>{
 const html=readFileSync(new URL('minigames.html',root),'utf8');
 assert.match(html,/View all leaderboards<\/a>/);
 const style=html.match(/\.hub-intro a\{([^}]+)\}/)?.[1];
 assert.ok(style);
 assert.match(style,/font-weight:850/);
 assert.match(style,/text-decoration:underline/);
 assert.doesNotMatch(style,/(?:background|border:|border-radius|padding:)/);
});

test('example player worker starts before any optional Chess.com profile or stats fetch',()=>{
 const index=script.indexOf('if(activeExample){',script.indexOf('form.addEventListener("submit"'));
 const profile=script.indexOf('const profileController=new AbortController()',index);
 assert.ok(index>=0&&profile>index);
 const fastPath=script.slice(index,profile);
 assert.match(fastPath,/await runReview\(username,requestId\)/);
 assert.doesNotMatch(fastPath,/await getJSON|await Promise\.race|profileController/);
 assert.ok(script.includes('if(data.type==="profile"){'));
 assert.ok(script.includes('renderPlayer(data.profile,{},username,{preset:true})'));
});
