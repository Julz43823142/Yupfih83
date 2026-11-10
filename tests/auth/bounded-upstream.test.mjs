import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedText,readBoundedJSON} from '../../lib/bounded-upstream.mjs';

test('small JSON and UTF-8 responses stream without loss',async()=>{
 const response=Response.json({value:'Sicilië'});
 assert.deepEqual(await readBoundedJSON(response,128),{value:'Sicilië'});
 assert.equal(await readBoundedText(new Response('French Defense'),128),'French Defense');
});
test('Content-Length and actual streamed bytes are both bounded',async()=>{
 await assert.rejects(readBoundedText(new Response('small',{headers:{'Content-Length':'1000'}}),100),/size limit/);
 const tooLong=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(80));controller.enqueue(new Uint8Array(80));controller.close()}}));
 await assert.rejects(readBoundedText(tooLong,120),/size limit/);
});
test('invalid UTF-8, invalid JSON and impossible limits fail closed',async()=>{
 await assert.rejects(readBoundedText(new Response(new Uint8Array([0xC3,0x28])),64),/encoded|UTF-8|valid/i);
 await assert.rejects(readBoundedJSON(new Response('{oops'),64),SyntaxError);
 await assert.rejects(readBoundedText(new Response('ok'),0),/limit/);
});
