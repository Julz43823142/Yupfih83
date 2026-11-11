import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root=resolve(import.meta.dirname,'../..');
const source=readFileSync(resolve(root,'fallen-king-story.js'),'utf8');
const engine=readFileSync(resolve(root,'fallen-king.js'),'utf8');
const page=readFileSync(resolve(root,'fallen-king.html'),'utf8');

test('chapter one and existing WebGL engine are valid browser scripts',()=>{
 assert.doesNotThrow(()=>new Script(source));
 assert.doesNotThrow(()=>new Script(engine));
});
test('original fullscreen engine and server-admin gate remain in place',()=>{
 assert.match(engine,/getContext\('webgl'/);
 assert.match(page,/id="fallen-fullscreen"/);
 assert.match(page,/id="fallen-gate"/);
 assert.match(engine,/\/api\/fallen-king\/world/);
 assert.match(page,/fallen-king-story\.js/);
 assert.ok(page.indexOf('fallen-king-story.js')<page.indexOf('fallen-king.js'),'story controller must load before engine');
});
test('intro art, input, quest and four graduated hints are present',()=>{
 assert.match(source,/drawIntroImage/);
 assert.match(source,/\['e','enter',' '\]/);
 assert.match(source,/const coinSpots=/);
 assert.match(source,/Math\.min\(4,hintLevel\+1\)/);
 for(const id of ['cell','sluice','lantern','merrick','lumber','ropes','bridge'])assert.match(source,new RegExp(id+':\\{'));
});
test('story respects original map and blocks bypassing the east river',()=>{
 assert.match(source,/baseWorld=api\.getWorld\(\)/);
 assert.match(source,/for\(let y=2;y<=37;y\+\+\)/);
 assert.match(source,/complete\('bridge'\)/);
 assert.match(source,/complete\('pip'\)/);
});
