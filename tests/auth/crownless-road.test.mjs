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
 assert.match(page,/crownless-road\.js\?v=5/);
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
test('Fallen King 2.0 points to the new admin prison preview',()=>{
 assert.match(hub,/href="\/crownless-prison\.html"/);
 assert.match(hub,/<h2>The Fallen King 2\.0<\/h2><p>Coming soon\.<\/p>/);
 assert.match(hub,/The Fallen King/);
});

test('the five original Fallen King intro images are restored while first-person art stays distinct',()=>{
 assert.match(page,/id="story-art"/);
 assert.match(page,/id="story-scene"/);
 assert.match(page,/id="story-heading"/);
 assert.match(page,/id="story-line"/);
 assert.match(page,/id="story-image"/);
 assert.match(page,/\/assets\/fallen-king-intro\/intro-1\.png/);
 assert.match(game,/\/assets\/fallen-king-intro\/intro-/);
 assert.match(game,/const originalStory=/);
 assert.match(game,/Edwin, now posing as the king/);
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

test('high-resolution physically lit first-person renderer and rich environmental geometry',()=>{
 assert.match(game,/Math\.min\(devicePixelRatio\|\|1,2\.5\)/);
 assert.match(game,/attribute vec3 normal/);
 assert.match(game,/varying vec3 vnormal/);
 assert.match(game,/normalize\(vnormal\)/);
 assert.match(game,/lightPosition/);
 assert.match(game,/float noise\(vec2 p\)/);
 assert.match(game,/gl\.uniform3fv\(u\.sunDirection/);
 assert.match(game,/function tree\(x,z,seed\)/);
 assert.match(game,/Continuous overhead vaults/);
 assert.match(game,/Heavy cross-braces/);
 assert.match(game,/Genuine sloped roof planes/);
 assert.match(page,/id="story-scene"/);
});

test('non-block terrain is replaced by rounded organic geometry and sunset sky',()=>{
 assert.match(game,/function organicBall\(/);
 assert.match(game,/function branchTube\(/);
 assert.match(game,/function shrub\(/);
 assert.match(game,/function organicRock\(/);
 assert.match(game,/function paintSky\(/);
 assert.match(game,/skyProgram=gl\.createProgram/);
 assert.match(game,/function tree\(x,z,seed\)/);
 assert.doesNotMatch(game,/function tree\(x,z,seed\)\{const size=/);
 assert.match(game,/Genuine sloped roof planes/);
 assert.match(game,/Full porcelain toilet/);
 assert.match(game,/Articulated human silhouettes/);
});

test('admin can teleport to every authored scene and major checkpoint without Q camera rotation',()=>{
 assert.match(page,/id="dev-teleport"/);
 assert.match(page,/id="teleport-destination"/);
 assert.match(page,/id="teleport-go"/);
 for(const id of ['cell','sewer','sewer-middle','sewer-exit','forest','forest-tower','forest-gate','watchtower','village','village-bridge']){
  assert.ok(page.includes('value="'+id+'"'),'missing destination '+id);
 }
 assert.match(game,/const teleportPoints=/);
 assert.match(game,/function teleportTo\(target\)/);
 assert.match(game,/beginScene\(stageName,destination\.position\)/);
 assert.doesNotMatch(game,/if\(keys\.has\('q'\)\)yaw/);
 assert.match(game,/ADMIN TELEPORT|Camera rotation is mouse-only/);
});

test('Babylon prison preview is admin-gated, in English, and supports jumping',()=>{
 const preview=readFileSync(resolve(root,'crownless-prison.html'),'utf8');
 const prison=readFileSync(resolve(root,'crownless-prison.js'),'utf8');
 assert.doesNotThrow(()=>new Script(prison,{filename:'crownless-prison.js'}));
 assert.ok(prison.includes("fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'})"));
 assert.ok(preview.includes('id="game" hidden'));
 assert.ok(preview.includes('cdn.babylonjs.com/babylon.js'));
 assert.ok(prison.includes('new BABYLON.Engine'));
 assert.ok(prison.includes('jumpVelocity=5.5'));
 assert.ok(prison.includes('jumpVelocity-=15.2*dt'));
 assert.ok(prison.includes('sleeping chess rook pivot'));
 assert.ok(prison.includes('neighbor cell forged bars'));
 assert.ok(preview.includes('Space jump'));
 assert.ok(preview.includes('WASD move'));
 assert.ok(preview.includes('#game{position:fixed;inset:0'));
});

test('Babylon prison artwork contains only Babylon meshes and has a sleeping rook, no white floor decals',()=>{
 const prison=readFileSync(resolve(root,'crownless-prison.js'),'utf8');
 assert.match(prison,/sleeping chess rook pivot/);
 assert.match(prison,/rook tower crenellation/);
 assert.match(prison,/rook sleep ZZZ billboard/);
 assert.match(prison,/side arch pier/);
 assert.doesNotMatch(prison,/CreateDisc\('subtle damp patch'/);
 assert.doesNotMatch(prison,/sphere\('rounded rubble stone'/);
});

test('prison hall redesign remains admin-only and includes chess neighbor, repeated cell gates and cot landing',()=>{
 const page=readFileSync(resolve(root,'crownless-prison.html'),'utf8');
 const game=readFileSync(resolve(root,'crownless-prison.js'),'utf8');
 assert.match(page,/crownless-prison\.js\?v=4/);
 assert.match(game,/fetch\('\/api\/fallen-king\/world'/);
 assert.match(game,/left prisoner pawn head/);
 assert.match(game,/neighbor entrance prison bars/);
 assert.match(game,/repeated barred hall cell/);
 assert.match(game,/distant chess pawn base/);
 assert.match(game,/hall gas lamp/);
 assert.match(game,/onCot\(x,z\)/);
 assert.match(game,/jumpHeight>\.77/);
 assert.match(game,/ignorePointerExit/);
 assert.doesNotMatch(game,/new THREE\./);
});
