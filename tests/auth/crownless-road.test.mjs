import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
const root=resolve(import.meta.dirname,'../..');
const page=readFileSync(resolve(root,'crownless-road.html'),'utf8');
const game=readFileSync(resolve(root,'crownless-road.js'),'utf8');
const hub=readFileSync(resolve(root,'minigames.html'),'utf8');

test('Crownless Road is a separate first-person WebGL adventure with valid JavaScript',()=>{
 assert.doesNotThrow(()=>new Script(game,{filename:'crownless-road.js'}));
 assert.match(game,/getContext\('webgl'/);
 assert.match(game,/gl\.drawArrays\(gl\.TRIANGLES,0,count\)/);
 assert.match(game,/requestPointerLock/);
 assert.match(game,/mousemove/);
 assert.match(page,/The Fallen King 2\.0/);
 assert.match(page,/crownless-road\.js\?v=2/);
});
test('Crownless Road is admin gated through the same protected API as Fallen King',()=>{
 assert.match(game,/fetch\('\/api\/fallen-king\/world',\{credentials:'same-origin',cache:'no-store'\}\)/);
 assert.match(game,/if\(!res\.ok\)/);
 assert.match(game,/res\.status===403/);
 assert.match(page,/noindex,nofollow/);
 assert.match(page,/id="game" hidden/);
});
test('The Crownless Road keeps the original prison-sewer-forest-watchtower-village sequence',()=>{
 for(const stage of ["cell","sewer","forest","watchtower"])assert.match(game,new RegExp("name==='"+stage+"'"));
 assert.ok(game.includes("w=create(61,43"));
 for(const text of ['King Oliver','Edwin took my crown','Willowmere Village','Merrick the Bishop','Travelling Bishop','barrier key','repair the bridge'])assert.ok(game.includes(text),text);
 assert.match(game,/state\.watchKey=true/);
 assert.match(game,/state\.bridge=true/);
});
test('spare coming soon slot contains only Coming soon in its description',()=>{
 assert.match(hub,/href="\/crownless-road\.html"/);
 assert.match(hub,/<h2>The Fallen King 2\.0<\/h2><p>Coming soon\.<\/p>/);
 assert.match(hub,/The Fallen King/);
});

test('original five illustrated story panels are shown before prison gameplay',()=>{
 assert.match(page,/id="story-art"/);
 assert.match(page,/id="story-image"/);
 assert.match(game,/\/assets\/fallen-king-intro\/intro-/);
 assert.match(game,/storyFrame>=5/);
 assert.match(game,/finishStoryIntro/);
});
test('Space jump, Ctrl crouch, Shift run and Esc pause keep unique controls',()=>{
 assert.match(game,/jumpSpeed=5\.1/);
 assert.match(game,/jumpSpeed-=13\.8\*dt/);
 assert.match(game,/keys\.has\('control'\)/);
 assert.match(game,/crouch\+=/);
 assert.match(game,/keys\.has\('shift'\)/);
 assert.match(game,/k==='escape'/);
 assert.match(game,/setPause\(!menuOpen\)/);
 assert.match(page,/id="pause-menu"/);
 assert.match(page,/id="resume"/);
 assert.match(page,/id="pause-restart"/);
 assert.match(page,/id="pause-sound"/);
});
test('prison bars, neighbouring sleeping prisoners and village collection quest are physical',()=>{
 assert.match(game,/name:'Sleeping Prisoner'/);
 assert.match(game,/name:'Exhausted Prisoner'/);
 assert.match(game,/stage==='cell'&&\(x===6\|\|x===18\)/);
 assert.match(game,/npc\.sleeping/);
 assert.match(game,/world\.solids/);
 assert.match(game,/tile==='w'/);
 assert.match(game,/state\.timber=true/);
 assert.match(game,/state\.ropes=true/);
 assert.match(game,/state\.metMerrick/);
});
