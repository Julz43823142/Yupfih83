import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../../functions/api/puzzles.js';

const payload={game:{pgn:'1. e4 e5'},puzzle:{id:'public-001',initialPly:0,rating:1200,solution:['e2e4']}};
const request=exclude=>new Request('https://eloscanner.com/api/puzzles'+(exclude?'?exclude='+encodeURIComponent(exclude):''));

test('non-daily public puzzles use shared cache before calling an upstream API',async()=>{
 const oldCache=globalThis.caches,oldFetch=globalThis.fetch;
 let remoteCalls=0;
 globalThis.caches={default:{match:async()=>Response.json(payload),put:async()=>{}}};
 globalThis.fetch=async()=>{remoteCalls++;throw Error('Upstream request should not be needed')};
 try{
  const response=await onRequestGet({request:request(),env:{}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).puzzle.id,'public-001');
  assert.equal(remoteCalls,0);
 }finally{globalThis.caches=oldCache;globalThis.fetch=oldFetch}
});

test('cached puzzle exclusion still forces a different upstream puzzle',async()=>{
 const oldCache=globalThis.caches,oldFetch=globalThis.fetch;
 let remoteCalls=0;
 globalThis.caches={default:{match:async()=>Response.json(payload),put:async()=>{}}};
 globalThis.fetch=async()=>{remoteCalls++;return Response.json({...payload,puzzle:{...payload.puzzle,id:'public-002'}})};
 try{
  const response=await onRequestGet({request:request('public-001'),env:{}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).puzzle.id,'public-002');
  assert.equal(remoteCalls,1);
 }finally{globalThis.caches=oldCache;globalThis.fetch=oldFetch}
});
