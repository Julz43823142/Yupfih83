import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('example report buttons start a scan immediately without refreshing the homepage',async()=>{
 const source=readFileSync(new URL('../../script.js',import.meta.url),'utf8');
 const from=source.indexOf('const exampleAccounts=new Set(');
 const to=source.indexOf('// Example pages render an already completed',from);
 assert.ok(from>=0&&to>from,'example click controller must exist');
 const buttons=['MagnusCarlsen','Hikaru'].map(username=>({
  dataset:{username},handlers:{},
  addEventListener(type,handler){this.handlers[type]=handler}
 }));
 const input={value:''},submitted=[],urls=[];
 const context={
  getJSON:async()=>({avatar:null}),
  document:{querySelector:()=>null,querySelectorAll:()=>buttons},
  usernameInput:input,
  form:{requestSubmit(){submitted.push(input.value)}},
  history:{state:null,replaceState(_state,_title,url){urls.push(url)}},
  location:{pathname:'/',search:''},
  results:{scrollIntoView(){}},
  window:{matchMedia:()=>({matches:true})},
  encodeURIComponent,
  Promise,Map,Set
 };
 runInNewContext(source.slice(from,to),context);
 for(const button of buttons){
  assert.equal(typeof button.handlers.click,'function');
  button.handlers.click();
 }
 assert.deepEqual(submitted,['MagnusCarlsen','Hikaru']);
 assert.deepEqual(urls,['/#analyze=MagnusCarlsen','/#analyze=Hikaru']);
});
