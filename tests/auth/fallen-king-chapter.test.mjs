import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root=resolve(import.meta.dirname,'../..');
const source=readFileSync(resolve(root,'fallen-king-story.js'),'utf8');
const engine=readFileSync(resolve(root,'fallen-king.js'),'utf8');
const page=readFileSync(resolve(root,'fallen-king.html'),'utf8');
const detail=readFileSync(resolve(root,'fallen-king-detailplus.js'),'utf8');
const assets=readFileSync(resolve(root,'fallen-king-detailplus-assets.js'),'utf8');

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
test('intro art, input, quest and deferred puzzle checkpoints are present',()=>{
 assert.match(source,/drawIntroImage/);
 assert.match(source,/\['e','enter',' '\]/);
 assert.match(source,/const coinSpots=/);
 assert.match(source,/function continuePuzzle\(\)/);
 assert.match(source,/\$\('fallen-story-puzzle-name'\)\.textContent='PUZZLE'/);
 assert.match(page,/id="fallen-story-puzzle-continue"/);
 for(const id of ['cell','sluice','lantern','merrick','lumber','ropes','bridge'])assert.match(source,new RegExp(id+':\\{'));
});
test('story respects original map and blocks bypassing the east river',()=>{
 assert.match(source,/baseWorld=api\.getWorld\(\)/);
 assert.match(source,/for\(let y=2;y<=37;y\+\+\)/);
 assert.match(source,/complete\('bridge'\)/);
 assert.match(source,/complete\('pip'\)/);
});

test('dialogue advances before story interaction, preventing soft-lock',()=>{
 const dialogue=engine.indexOf('function talk(){');
 const advance=engine.indexOf('if(dialogue){dialogue.i++',dialogue);
 const story=engine.indexOf('if(window.FallenKingStory?.talk())return;',dialogue);
 assert.ok(dialogue>=0&&advance>dialogue&&story>advance);
 assert.match(engine,/dialog\.addEventListener\('click'/);
});
test('intro pictures reuse existing WebGL renderer and stage characters',()=>{
 assert.match(source,/function renderIntroFrame\(canvas\)/);
 assert.match(source,/function introWorld\(kind\)/);
 assert.match(source,/piece\(x,z,'K'/);
 assert.match(engine,/window\.FallenKingStory\?\.renderIntroFrame\(canvas\)/);
 assert.match(source,/function isPrisoner\(\)/);
 assert.match(engine,/const type=prisoner\?'P':'K'/);
 assert.doesNotMatch(source,/There was no spell/);
});
test('cell is furnished with realistic game geometry and toilet can be accessed nearby',()=>{
 for(const marker of ['function toilet(x,z)','function bed(x,z)','function rails(a,b,z)','function wall(x,z','function torch(x,z)'])assert.ok(source.includes(marker));
 assert.match(source,/if\(near\(p,16,10,2\)\)/);
 assert.match(source,/setScene\('sewer'/);
 assert.match(source,/function musicTheme\(\)/);
 assert.match(engine,/palace:\{notes:/);
 assert.match(engine,/prison:\{notes:/);
 assert.match(engine,/sewer:\{notes:/);
});

test('chapter scenes are distinct and the coin cap is one',()=>{
 assert.match(source,/scene:'approach'/);
 assert.match(source,/scene:'theft'/);
 assert.match(source,/royal crown is kept on an obvious velvet-topped pedestal/);
 assert.match(source,/createWorld\(48,29,'H'\)/);
 assert.match(source,/function forestWorld\(\)/);
 assert.match(source,/function arch\(x,z\)/);
 assert.match(source,/v\.coins=v\.coins\.slice\(0,1\)/);
 assert.match(source,/const coinSpots=\{cell:\[\[12,13\]\]\}/);
 assert.match(source,/if\(scene==='cell'\)return x===16&&y===10;/);
 const moveBlock=source.match(/function beforeMove\(x,y\)\{[\s\S]*?\n return false;\}/)?.[0];
 assert.ok(moveBlock);
 assert.doesNotMatch(moveBlock,/openPuzzle/);
 assert.match(source,/function drawVillageProps\(g\)/);
});
test('chapter can be completed by E interactions without any random puzzle on movement',()=>{
 const elements=new Map(),eventHandlers=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{
  hidden:true,textContent:'',disabled:false,children:[],listeners:{},
  addEventListener(type,fn){this.listeners[type]=fn;},
  replaceChildren(...items){this.children=items;},
  getContext(){return {fillRect(){},drawImage(){},set fillStyle(v){},set imageSmoothingEnabled(v){} };},
  focus(){}});
 return elements.get(id);}
 const document={getElementById:element,addEventListener(type,fn){eventHandlers.set(type,fn);},createElement(){return {dataset:{},closest(){return this;}};}};
 const state=new Map(),localStorage={getItem:key=>state.get(key)||null,setItem:(key,value)=>state.set(key,value),removeItem:key=>state.delete(key)};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('.'.repeat(52)),npcs:[{id:'pip',x:28,y:21,lines:[]}],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},player={x:26,y:29},said=[];
 const engine={getWorld:()=>world,getPlayer:()=>player,setWorld:(next,pos)=>{world=next;player={...pos};},say:(name,lines)=>said.push({name,lines}),enableSound(){},soundCue(){}};
 const window={};
 new Function('window','document','localStorage','location','confirm',source)(window,document,localStorage,{reload(){}},()=>true);
 const chapter=window.FallenKingStory;chapter.start(engine);
 const geometry={box(){},cylinder(){},cone(){},sphere(){},piece(){},features(){}};
 for(let i=0;i<12;i++){assert.doesNotThrow(()=>chapter.drawProps(geometry));element('fallen-story-next').listeners.click();}
 assert.equal(world.width,25);
 assert.equal(chapter.beforeMove(10,7),false);
 assert.equal(element('fallen-story-puzzle').hidden,true);
 player={x:14,y:10};chapter.talk();assert.equal(element('fallen-story-puzzle').hidden,true);
 chapter.talk();assert.equal(element('fallen-story-puzzle').hidden,false);
 function answer(){element('fallen-story-puzzle-continue').listeners.click();}
 answer(0);
 chapter.talk();assert.equal(world.width,48);
 assert.equal(world.height,29);assert.equal(world.tiles[12][10],'H');
 assert.equal(chapter.beforeMove(10,12),true);
 assert.equal(element('fallen-story-puzzle').hidden,true);
 player={x:10,y:13};chapter.talk();answer();
 assert.equal(world.tiles[12][10],'s');
 player={x:18,y:17};chapter.talk();answer();
 assert.equal(world.tiles[18][18],'s');
 player={x:26,y:22};chapter.talk();chapter.talk();answer();
 player={x:43,y:17};chapter.talk();answer();
 assert.equal(world.width,48);assert.equal(world.height,19);
 assert.ok(world.npcs.some(n=>n.id==='forest-traveller'));
 assert.ok(world.npcs.some(n=>n.id==='forest-woodcutter'));
 player={x:32,y:8};chapter.talk();assert.equal(world.width,52);
 player={x:28,y:22};chapter.afterMove();
 player={x:17,y:20};chapter.talk();answer(2);
 player={x:16,y:29};chapter.talk();answer(2);
 player={x:44,y:19};assert.equal(chapter.beforeMove(45,19),true);
 chapter.talk();answer(1);assert.equal(world.tiles[19][45],'p');
 assert.ok(said.length>5);
});

test('detailed scene geometry and atmosphere render without changing story route',()=>{
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{
  hidden:true,textContent:'',disabled:false,children:[],listeners:{},
  addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(...c){this.children=c;},
  getContext(){return {fillRect(){},drawImage(){},set fillStyle(v){},set imageSmoothingEnabled(v){}};},focus(){}});
 return elements.get(id);}
 const document={getElementById:el,addEventListener(){},createElement(){return {dataset:{},closest(){return this;}};}};
 const stored=new Map(),localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const window={};let world={width:52,height:40,version:5,tiles:Array(40).fill('.'.repeat(52)),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:26,y:29}},player={x:26,y:29},count=0;
 const callbacks={box(){count++;},cylinder(){count++;},cone(){count++;},sphere(){count++;},piece(){count++;},features(){count++;},recliningKing(){count++;}};
 const engine={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player={...p};},say(){},enableSound(){},soundCue(){}};
 new Function('window','document','localStorage','location','confirm',source)(window,document,localStorage,{reload(){}},()=>true);
 const game=window.FallenKingStory;game.start(engine);
 for(let i=0;i<12;i++){assert.doesNotThrow(()=>game.drawProps(callbacks));assert.doesNotThrow(()=>game.drawEffects(callbacks,i*.3));el('fallen-story-next').listeners.click();}
 assert.equal(world.width,25);
 assert.doesNotThrow(()=>game.drawProps(callbacks));
 assert.doesNotThrow(()=>game.drawEffects(callbacks,1));
 player={x:14,y:10};game.talk();game.talk();el('fallen-story-puzzle-continue').listeners.click();game.talk();
 assert.equal(world.width,48);
 assert.doesNotThrow(()=>game.drawProps(callbacks));
 assert.doesNotThrow(()=>game.drawEffects(callbacks,2));
 assert.ok(count>1000,'scenes contain substantial static and dynamic detail');
 assert.match(source,/function drawMicroDetail\(g,kind\)/);
 assert.match(source,/function drawVillageProps\(g\)/);
 assert.match(source,/function drawEffects\(g,t\)/);
});

test('animated atmosphere receives the complete WebGL primitive API',()=>{
 assert.match(engine,/drawEffects\?\.\(\{box,sphere,cylinder,cone,tri\},t\)/);
 assert.match(source,/const \{sphere,cone\}=g/);
 const doc={getElementById:()=>({hidden:false,textContent:'',addEventListener(){},getContext(){return {fillRect(){},drawImage(){}};}}),addEventListener(){}};
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const window={};
 let current={version:1,width:52,height:40,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:10,y:10}},player={x:10,y:10};
 const engineApi={getWorld:()=>current,getPlayer:()=>player,setWorld:(w,p)=>{current=w;player=p;},say(){},enableSound(){},soundCue(){}};
 new Function('window','document','localStorage','location','confirm',source)(window,doc,storage,{},()=>true);
 window.FallenKingStory.start(engineApi);
 // Intro flame: the formerly omitted cone primitive must be present and usable.
 const calls={box(){},sphere(){},cylinder(){},cone(){}};
 assert.doesNotThrow(()=>window.FallenKingStory.drawEffects(calls,2));
 // Restored prison scene: repeat the same check without needing a browser.
 const saved={scene:'cell',flags:{},coins:[],step:10,position:{x:7,y:7,facing:'right'}};
 memory.set('fallen-king-chapter-one-v2',JSON.stringify(saved));
 const next={};
 new Function('window','document','localStorage','location','confirm',source)(next,doc,storage,{},()=>true);
 next.FallenKingStory.start(engineApi);
 assert.doesNotThrow(()=>next.FallenKingStory.drawEffects(calls,3));
});

test('DetailPlus bundles eight real CC0 GLB meshes with valid embedded buffers',()=>{
 assert.match(assets,/Kenney CC0 1\.0/);
 const win={};new Script(assets).runInNewContext({window:win});
 const packed=win.FallenKingDetailPlusAssetData;
 for(const id of ['gate','wall','floor','table','barrel','chest','bed','stones']){
  assert.ok(packed[id]&&packed[id].length>1000,id+' must be an embedded mesh');
  const raw=Buffer.from(packed[id],'base64');assert.equal(raw.toString('ascii',0,4),'glTF');
  assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
 }
 assert.doesNotThrow(()=>new Script(detail));
});
test('DetailPlus renders real mesh triangles, curved toilet and the same crown everywhere',()=>{
 const win={};new Script(assets).runInNewContext({window:win});
 const fakeCanvas=()=>({width:64,height:64,getContext(){return {drawImage(){},getImageData(){const data=new Uint8ClampedArray(64*64*4);data.fill(155);return {data};}};}});
 const document={createElement:fakeCanvas};
 const URL={createObjectURL(){return 'blob:fake';},revokeObjectURL(){}};
 class Image{constructor(){this.width=64;this.height=64;}set src(_) {this.onload?.();}}
 new Script(detail).runInNewContext({window:win,document,atob:txt=>Buffer.from(txt,'base64').toString('binary'),TextDecoder,Image,Blob,URL,console});
 const dp=win.FallenKingDetailPlus,counts=dp.stats(),colors=[],points=[];
 for(const id of ['gate','wall','floor','table','barrel','chest','bed','stones'])assert.ok(counts[id]>0,'mesh '+id+' must contain triangles');
 const g={tri(a,b,c,color){points.push(...a,...b,...c);colors.push(color);},cylinder(){}};
 for(const id of Object.keys(counts))assert.equal(dp.draw(g,id,3,0,3,1.5,2,1),true);
 const crownStart=colors.length;dp.crown(g,2,2,3,1);const firstColors=colors.slice(crownStart);
 dp.crown(g,7,2,8,.8);assert.deepEqual(colors.slice(-firstColors.length),firstColors,'crown materials must remain identical');
 assert.ok(colors.includes('#8c263f'),'crown always has red velvet');
 const count=colors.length;dp.toilet(g,11,7);assert.ok(colors.length>count+100,'toilet must use curved mesh surfaces');
 assert.ok(points.every(Number.isFinite),'real GLB geometry must contain finite coordinates');
});
test('DetailPlus never applies outdoor grass or lilies to prison and sewer floors',()=>{
 assert.match(engine,/window\.FallenKingStory\.drawGround\(\{box,tri\},x,z\)/);
 assert.match(source,/function drawGround\(g,x,z\)/);
 assert.match(source,/if\(scene==='sewer'&&tile==='w'\)/);
 assert.doesNotMatch(source,/drawMicroDetail\(g,kind\);/);
 assert.doesNotMatch(source,/drawMicroDetail\(g,'cell'\);/);
 assert.doesNotMatch(source,/drawMicroDetail\(g,'sewer'\);/);
 assert.match(source,/dp\?\.crown\?\.\(g,13\.8/);
 assert.match(source,/dp\?\.crown\?\.\(g,12\.55/);
 assert.match(source,/dp\?\.crown\?\.\(g,x,1\.53,z,\.82\)/);
 assert.ok(page.indexOf('fallen-king-detailplus-assets.js')<page.indexOf('fallen-king-detailplus.js'));
 assert.ok(page.indexOf('fallen-king-detailplus.js')<page.indexOf('fallen-king-story.js'));
});

test('prison readability: iron bars, clear cot, metal pail and preserved candle',()=>{
 const props=source.slice(source.indexOf('function drawProps(g){'),source.indexOf('function drawVillageProps(g)'));
 assert.match(props,/Genuine forged-iron bars/);
 assert.doesNotMatch(props,/model\('gate'/);
 assert.match(props,/Narrow prison cot/);
 assert.doesNotMatch(props,/model\('bed'/);
 assert.match(props,/small iron pail/);
 assert.match(props,/torch\(15\.3,6\.0\)/);
 assert.match(props,/for\(const x of \[6\.5,18\.5\]\)/);
 assert.match(props,/The gate is centred at x=12/);
 assert.match(source,/function drawGround\(g,x,z\)/);
});

test('cell layout has north corridor, two side prisoners, south window and occluding walls',()=>{
 assert.match(source,/createWorld\(25,16,'H'\)/);
 assert.match(source,/for\(let x=1;x<=23;x\+\+\)updateTile\(w,x,5,'H'\)/);
 assert.match(source,/for\(const x of \[6,18\]\)updateTile\(w,x,y,'H'\)/);
 assert.match(source,/Sleeping guard's cot belongs to the corridor/);
 assert.match(source,/recliningPiece\(12\.1,2\.38,'R','black'\)/);
 assert.match(source,/Mara and Tovin/);
 assert.match(source,/SOUTH-facing window/);
 assert.match(source,/function fieldOfView\(\)/);
 assert.match(engine,/function prepareVision\(\)/);
 assert.match(engine,/uniform sampler2D visionTex/);
 assert.match(engine,/function recliningPiece\(x,z,type,color\)/);
 const elements=new Map();
 const doc={getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',children:[],addEventListener(n,fn){this[n]=fn;},getContext(){return{fillRect(){},drawImage(){}}},replaceChildren(...c){this.children=c;},focus(){}});return elements.get(id);},addEventListener(){},createElement(){return{dataset:{},closest(){return this;}}}};
 const localStorage={getItem(){return null;},setItem(){}};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:26,y:29}},player={x:26,y:29};
 const e={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player=p;},say(){},enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,doc,localStorage,{},()=>true);
 const story=win.FallenKingStory;story.start(e);
 for(let i=0;i<12;i++)doc.getElementById('fallen-story-next').click();
 assert.equal(world.width,25);assert.equal(world.height,16);
 assert.equal(world.tiles[5][12],'H');assert.equal(world.tiles[9][6],'H');assert.equal(world.tiles[9][18],'H');
 assert.equal(world.tiles[3][12],'s');assert.equal(world.tiles[9][12],'s');assert.equal(world.tiles[14][12],'H');
 const vision=story.fieldOfView();
 assert.ok(vision.enabled);assert.ok(vision.radius>=12);
 assert.equal(vision.isOpaque(12,5),false,'north iron bars transmit sight');
 assert.equal(vision.isOpaque(6,9),false,'west iron bars transmit sight');
 assert.equal(vision.isOpaque(18,9),false,'east iron bars transmit sight');
 assert.equal(vision.isOpaque(12,14),false,'south window transmits sight');
 assert.equal(vision.isOpaque(10,14),true,'stone beside window blocks sight');
 assert.equal(vision.isOpaque(0,9),true,'exterior wall blocks sight');
 assert.equal(story.beforeMove(16,10),true,'toilet interaction remains explicit');
 const g={box(){},cylinder(){},cone(){},sphere(){},piece(){},features(){},tri(){},recliningPiece(){}};
 assert.doesNotThrow(()=>story.drawProps(g));
});

test('deferred PUZZLE is a single Continue checkpoint, and flowing water has no wraps or spawns',()=>{
 assert.match(page,/id="fallen-story-puzzle-continue" type="button">Continue/);
 assert.match(source,/function continuePuzzle\(\)/);
 assert.match(source,/chapter\.flags\[id\]=true;closePuzzle\(\)/);
 assert.doesNotMatch(source,/function pickAnswer\(/);
 assert.doesNotMatch(source,/function showHint\(/);
 const effect=source.slice(source.indexOf('function drawEffects(g,t)'),source.indexOf('function drawFollowers(g)'));
 assert.match(effect,/function drawEffects/);
 assert.match(effect,/Math\.sin\(x\*\.92-z\*\.43-t\*1\.25\+offset\)/);
 assert.doesNotMatch(effect,/\bshift\s*=\s*\(t/);
 assert.doesNotMatch(effect,/\bphase\s*=\s*\(x/);
 assert.doesNotMatch(effect,/\bglint\s*>\s*\.48/);
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',children:[],addEventListener(kind,fn){this[kind]=fn;},replaceChildren(...v){this.children=v;},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return elements.get(id);}
 const document={getElementById:el,addEventListener(){},createElement(){return {dataset:{},closest(){return this;}};}};
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},player={x:26,y:29};
 const engineApi={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player=p;},say(){},enableSound(){},soundCue(){}};
 const window={};new Function('window','document','localStorage','location','confirm',source)(window,document,storage,{},()=>true);
 const game=window.FallenKingStory;game.start(engineApi);
 for(let i=0;i<12;i++)el('fallen-story-next').click();
 player={x:14,y:10};game.talk();game.talk();assert.equal(el('fallen-story-puzzle-name').textContent,'PUZZLE');
 el('fallen-story-puzzle-continue').click();game.talk();
 assert.equal(world.width,48);
 const renderAt=(t)=>{const meshes=[],g={tri(...args){meshes.push(args)},box(...args){meshes.push(args)},sphere(){},cone(){},cylinder(){}};game.drawEffects(g,t);return meshes;};
 const a=renderAt(1),b=renderAt(1.01),c=renderAt(14),d=renderAt(14+Math.PI*2/1.25*25);
 assert.ok(a.length>200);assert.equal(a.length,b.length);assert.equal(a.length,c.length);assert.equal(a.length,d.length);
 const positions=items=>items.filter(x=>Array.isArray(x[0])).flatMap(x=>x.slice(0,3).flat());
 const p0=positions(a),p1=positions(b);
 assert.ok(p0.length>100);
 const delta=Math.max(...p0.map((v,i)=>Math.abs(v-p1[i])));
 assert.ok(delta<.002,'small time step must not teleport water surface');
});

test('sewer water uses real joined triangles from the original WebGL renderer',()=>{
 assert.match(engine,/drawEffects\?\.\(\{box,sphere,cylinder,cone,tri\},t\)/);
 assert.match(source,/tri\(\[x0,y\(x0,z0\),z0\]/);
 assert.match(source,/tri\(\[x0,y\(x0,z0\),z0\],\[x1,y\(x1,z1\),z1\]/);
});

test('extended story has pawn Edwin, room arrest, sleeper, window coin, sewer monster, forest and hidden map',()=>{
 assert.match(source,/scene:'confrontation'/);assert.match(source,/scene:'arrest'/);
 assert.match(source,/Edwin was an ordinary black pawn/);
 assert.match(source,/function edwin\(x,z,wearingCrown=false\)\{piece\(x,z,'P','black'/);
 assert.match(source,/if\(kind==='arrest'\)/);
 assert.match(source,/for\(const x of \[6\.5,11\]\)/);
 assert.match(source,/scene==='intro'&&steps\[Math\.min\(chapter.step,steps.length-1\)\]\.scene==='prison'/);
 assert.match(source,/SOUTH-facing window/);
 assert.match(source,/near\(p,12,13,2\)&&y>=11/);
 assert.match(source,/I think he is asleep/);
 assert.match(source,/function forestWorld\(\)/);
 assert.match(source,/Sewer Creature/);
 assert.match(source,/openPuzzle\('monster'\)/);
 assert.match(source,/openPuzzle\('exit'\)/);
 assert.match(source,/setScene\('forest'/);
 assert.match(source,/function hasMap\(\)/);
 assert.match(engine,/FallenKingStory\?\.hasMap\?\.\(\)/);
 assert.match(page,/id="fallen-map-button"[^>]* hidden>/);
});
