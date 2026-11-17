import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../../script.js',import.meta.url),'utf8');

test('Magnus and Hikaru example cards are native navigation links',()=>{
 for(const name of ['MagnusCarlsen','Hikaru']){
  const escaped=name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('<a\\s+class="sample-button"\\s+href="/\\?analyze='+escaped+'"\\s+data-username="'+escaped+'"');
  assert.match(html,pattern,'Expected a real, directly navigable link for '+name);
 }
 assert.doesNotMatch(html,/<button[^>]+class="sample-button"/);
});

test('analysis starts on the first page load for a clicked example link',()=>{
 const begin=script.indexOf('const requestedAnalysis=');
 const end=script.indexOf('/* Load public Chess.com Insights',begin);
 assert.ok(begin>=0&&end>begin);
 for(const name of ['MagnusCarlsen','Hikaru']){
  const calls=[];
  const location={search:'?analyze='+name,hash:''};
  const context={
   location,document:{body:{dataset:{}}},usernameInput:{value:''},
   form:{requestSubmit(){calls.push(context.usernameInput.value)}},
   URLSearchParams,
  };
  runInNewContext(script.slice(begin,end),context);
  assert.deepEqual(calls,[name],'Analysis must start immediately for '+name);
 }
});

test('old hash links remain supported for existing bookmarks',()=>{
 const begin=script.indexOf('const requestedAnalysis=');
 const end=script.indexOf('/* Load public Chess.com Insights',begin);
 const context={
  location:{search:'',hash:'#analyze=Hikaru'},document:{body:{dataset:{}}},
  usernameInput:{value:''},form:{requestSubmit(){assert.equal(context.usernameInput.value,'Hikaru')}},
  URLSearchParams,
 };
 runInNewContext(script.slice(begin,end),context);
});
