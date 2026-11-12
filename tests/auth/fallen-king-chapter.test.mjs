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
 assert.doesNotMatch(source,/if\(scene==='village'&&!complete\('pip'\)/);
});

test('dialogue advances before story interaction, preventing soft-lock',()=>{
 const dialogue=engine.indexOf('function talk(){');
 const advance=engine.indexOf('if(dialogue){dialogue.i++',dialogue);
 const story=engine.indexOf('if(window.FallenKingStory?.talk())return;',dialogue);
 assert.ok(dialogue>=0&&advance>dialogue&&story>advance);
 assert.match(engine,/dialog\.addEventListener\('click'/);
});
test('six English-language comic illustrations replace overhead gameplay screenshots',()=>{
 assert.match(source,/function renderIntroFrame\(\)/);
 assert.match(source,/function introWorld\(kind\)/);
 assert.match(source,/drawIntroImage\(step\.scene\)/);
 assert.match(source,/assets\/fallen-king-intro/);
 assert.match(source,/introArtworkScenes=new Set\(\['bedroom','approach','theft','confrontation','arrest','prison'\]\)/);
 assert.match(engine,/window\.FallenKingStory\?\.renderIntroFrame\(canvas\)/);
 assert.match(source,/function isPrisoner\(\)/);
 assert.match(engine,/oliver\(visual\.x\+\.5,visual\.z\+\.5\)/);
 for(const key of ['bedroom','approach','theft','confrontation','arrest','prison']){
  const art=readFileSync(resolve(root,'assets/fallen-king-intro',key+'.svg'),'utf8');
  assert.match(art,/<svg /);
  assert.match(art,/THE |EDWIN|KING /);
 }
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

test('chapter scenes are distinct and restored hint coins are capped at two',()=>{
 assert.match(source,/scene:'approach'/);
 assert.match(source,/scene:'theft'/);
 assert.match(source,/royal crown is kept on an obvious velvet-topped pedestal/);
 assert.match(source,/createWorld\(84,53,'H'\)/);
 assert.match(source,/function forestWorld\(\)/);
 assert.match(source,/function arch\(x,z\)/);
 assert.match(source,/v\.coins=v\.coins\.slice\(0,2\)/);
 assert.match(source,/const coinSpots=\{cell:\[\[12,13\]\]\}/);
 assert.match(source,/if\(scene==='cell'\)return x===16&&y===10;/);
 const moveBlock=source.match(/function beforeMove\(x,y\)\{[\s\S]*?\n\}/)?.[0];
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
 chapter.talk();assert.equal(world.width,84);
 assert.equal(world.height,53);assert.equal(world.tiles[18][18],'s');
 assert.equal(chapter.beforeMove(18,18),false);
 assert.equal(element('fallen-story-puzzle').hidden,true);
 assert.equal(world.tiles[26][32],'s');
 player={x:48,y:38};chapter.talk();chapter.talk();answer();
 player={x:75,y:25};chapter.talk();answer();
 assert.equal(world.width,36);assert.equal(world.height,23);
 assert.ok(world.npcs.some(n=>n.id==='forest-traveller'));
 assert.ok(world.npcs.some(n=>n.id==='forest-woodcutter'));
 // The new enclosed watchtower requires entering through its door, opening the
 // chest inside, and then crossing the unlocked four-tile barrier.
 player={x:27,y:8};chapter.talk();assert.equal(world.width,17);
 assert.equal(world.height,14);
 player={x:8,y:5};chapter.talk();chapter.talk();answer();
 player={x:8,y:11};chapter.talk();assert.equal(world.width,36);
 player={x:33,y:8};chapter.talk();assert.equal(world.width,52);
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
 assert.equal(world.width,84);
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
 assert.match(props,/function royalBed\(x,z\)/);
 assert.match(props,/if\(!model\('bed',x,0,z/);
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
 assert.match(source,/A SMALL, unmistakeable window/);
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
 assert.equal(world.width,84);
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
 assert.match(source,/tri\(a,b,c,'#719a9b'\)/);
 assert.match(source,/stream\[z\*world\.width\+x\]/);
});

test('extended story has pawn Edwin, room arrest, sleeper, window coin, sewer monster, forest and hidden map',()=>{
 assert.match(source,/scene:'confrontation'/);assert.match(source,/scene:'arrest'/);
 assert.match(source,/Edwin was a blue pawn/);
 assert.match(source,/function edwin\(x,z,wearingCrown=false\)\{[\s\S]*?piece\(x,z,'P','blue'/);
 assert.match(source,/if\(kind==='arrest'\)/);
 assert.match(source,/for\(const x of \[6\.5,11\]\)/);
 assert.match(source,/scene==='intro'&&steps\[Math\.min\(chapter.step,steps.length-1\)\]\.scene==='prison'/);
 assert.match(source,/A SMALL, unmistakeable window/);
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

test('one hint coin is found only at the southern window and the sleeping guard can be inspected with E',()=>{
 const items=new Map();
 const document={getElementById(id){if(!items.has(id))items.set(id,{hidden:true,textContent:'',children:[],addEventListener(k,fn){this[k]=fn;},replaceChildren(...c){this.children=c;},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return items.get(id);},addEventListener(){},createElement(){return{dataset:{},closest(){return this;}};}};
 const state=new Map(),storage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},player={x:26,y:29},said=[];
 const api={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player={...p};},say:(speaker,lines)=>said.push([speaker,...lines]),enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,document,storage,{},()=>true);
 win.FallenKingStory.start(api);for(let i=0;i<12;i++)document.getElementById('fallen-story-next').click();
 player={x:12,y:12};win.FallenKingStory.talk();
 assert.match(document.getElementById('fallen-story-hintcoins').textContent,/1/);
 assert.match(said.at(-1).join(' '),/window ledge/i);
 win.FallenKingStory.talk();assert.match(document.getElementById('fallen-story-hintcoins').textContent,/1/);
 player={x:12,y:7};win.FallenKingStory.talk();assert.match(said.at(-1).join(' '),/I think he is asleep/);
 assert.equal(win.FallenKingStory.hasMap(),false);
});
test('larger sewer maze remains navigable and the woodland path reaches the village',()=>{
 const elements=new Map();
 const doc={getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',children:[],addEventListener(k,fn){this[k]=fn;},replaceChildren(...c){this.children=c;},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return elements.get(id);},addEventListener(){},createElement(){return{dataset:{},closest(){return this;}}}};
 const saved={scene:'sewer',step:12,flags:{cell:true,sluice:true,lantern:true},coins:[],position:{x:6,y:25,facing:'right'}};
 const storage={getItem:k=>k==='fallen-king-chapter-one-v2'?JSON.stringify(saved):null,setItem(){}};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},player={x:26,y:29};
 const api={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player={...p};},say(){},enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,doc,storage,{},()=>true);
 const game=win.FallenKingStory;game.start(api);assert.equal(world.width,84);assert.equal(world.height,53);
 assert.equal(world.tiles.flatMap(r=>r.split('')).filter(t=>t==='w').length,0);
 assert.ok(world.streamTiles.filter(Boolean).length>100);
 assert.equal(world.tiles[18][18],'s');assert.equal(world.tiles[26][32],'s');
 function path(start,end){const queue=[start],seen=new Set([start.join(',')]);for(const [x,y] of queue){if(x===end[0]&&y===end[1])return queue.length;for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){const xx=x+dx,zz=y+dz,k=xx+','+zz;if(!seen.has(k)&&['s','p'].includes(world.tiles[zz]?.[xx])){seen.add(k);queue.push([xx,zz]);}}}return 0;}
 assert.ok(path([6,25],[18,18])>10);assert.ok(path([6,25],[49,38])>40);assert.ok(path([6,25],[76,25])>40);
 assert.equal(world.tiles[39][5],'s');assert.equal(world.tiles[4][24],'s'); // Actual dead ends
 const geometry={box(){},cylinder(){},cone(){},sphere(){},tri(){},piece(){},features(){},tree(){}};
 assert.doesNotThrow(()=>game.drawProps(geometry));assert.doesNotThrow(()=>game.drawEffects(geometry,2.7));
 player={x:48,y:38};game.talk();game.talk();doc.getElementById('fallen-story-puzzle-continue').click();
 player={x:75,y:25};game.talk();doc.getElementById('fallen-story-puzzle-continue').click();
 assert.equal(world.width,36);
 assert.ok(path([3,10],[24,12])>20,'forest road reaches the enclosed watchtower approach');
 assert.equal(world.tiles[7][27],'D','watchtower has a door');
 assert.equal(world.tiles[8][32],'p','gate has a marked crossing');
 assert.ok(world.npcs.some(n=>/Bishop/.test(n.name)&&/joking/.test(n.lines[0])));
 assert.ok(world.npcs.some(n=>/Woodcutter/.test(n.name)));
 assert.doesNotThrow(()=>game.drawProps(geometry));assert.doesNotThrow(()=>game.drawEffects(geometry,1.8));
 player={x:27,y:8};game.talk();assert.equal(world.width,17);
 player={x:8,y:5};game.talk();game.talk();doc.getElementById('fallen-story-puzzle-continue').click();
 player={x:8,y:11};game.talk();assert.equal(world.width,36);
 player={x:33,y:8};game.talk();assert.equal(world.width,52);
 assert.doesNotThrow(()=>game.drawVillageProps(geometry));
});

test('rendering contract passes required geometry to every scene and frames the expanded prison intro',()=>{
 assert.match(engine,/drawProps\(\{box,cylinder,cone,sphere,piece,oliver,features,tree,recliningKing,recliningPiece,tri\}\)/);
 assert.match(engine,/drawEffects\?\.\(\{box,sphere,cylinder,cone,tri\},t\)/);
 assert.match(engine,/drawVillageProps\?\.\(\{box,cylinder,cone,sphere,tri\}\)/);
 assert.match(source,/function drawVillageProps\(g\)\{[\s\S]*?const \{box,cylinder,cone,sphere\}=g/);
 assert.match(source,/step\.scene==='prison'\?\{x:12,y:7/);
 assert.match(engine,/world\.width>20\?\(aspect<1\?8\.3:7\.3\)/);
 assert.match(source,/kind==='confrontation'/);
 assert.match(source,/kind==='arrest'/);
 assert.match(source,/if\(scene==='forest'\)\{/);
 assert.match(source,/model\('stones',49\.4,\.15,38\.4/);
});

test('Oliver matches his bare cinematic mesh in gameplay, Edwin remains visually distinct',()=>{
 assert.match(engine,/function oliver\(x,z\)\{/);
 assert.match(engine,/function oliver\(x,z\)\{[\s\S]*?oliverPrototype\(x,z,1\)/,'gameplay Oliver uses the approved crownless prototype');
 assert.match(engine,/recliningKing\(x,z\)\{[\s\S]*?oliver\(x,z\)/);
 assert.match(engine,/oliver\(visual\.x\+\.5,visual\.z\+\.5\)/);
 assert.match(source,/const drawOliver=\(x,z\)=>oliver\?oliver\(x,z\)/);
 assert.match(source,/else drawOliver\(8\.9,7\.0\)/);
 assert.match(source,/if\(scene==='intro'\)\{drawOliver\(12\.5,9\.4\)/);
 assert.match(source,/function edwin\(x,z,wearingCrown=false\)/);
 assert.match(source,/piece\(x,z,'P','blue',false\)/);
 assert.match(source,/if\(wearingCrown\)dp\?\.crown\?\./);
});
test('five-wide sewer maze and walkable forest are encoded in the actual collision maps',()=>{
 const elements=new Map();
 const doc={getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',children:[],addEventListener(k,fn){this[k]=fn;},replaceChildren(...c){this.children=c;},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return elements.get(id);},addEventListener(){},createElement(){return{dataset:{},closest(){return this;}}}};
 const saved={scene:'sewer',step:12,flags:{cell:true},coins:[],position:{x:6,y:25,facing:'right'}};
 const store=new Map([['fallen-king-chapter-one-v2',JSON.stringify(saved)]]);
 const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:26,y:29}},player={x:26,y:29};
 const api={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player={...p}},say(){},enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,doc,localStorage,{},()=>true);
 const game=win.FallenKingStory;game.start(api);
 assert.equal(world.width,84);assert.equal(world.height,53);
 for(let x=5;x<=9;x++)assert.equal(world.tiles[25][x],'s');
 for(let x=16;x<=20;x++){assert.equal(world.tiles[18][x],'s');assert.equal(game.beforeMove(x,18),false);}
 for(let x=30;x<=34;x++){assert.equal(world.tiles[26][x],'s');assert.equal(game.beforeMove(x,26),false);}
 function route(a,b){
  const seen=new Set([a.join(',')]),q=[a];
  for(const [x,y] of q){
   if(x===b[0]&&y===b[1])return true;
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+dx,yy=y+dy,k=xx+','+yy;if(!seen.has(k)&&['s','p','.'].includes(world.tiles[yy]?.[xx])){q.push([xx,yy]);seen.add(k);}}
  }return false;
 }
 assert.ok(route([6,25],[18,16]));
 assert.ok(route([6,25],[32,28]));
 assert.ok(route([6,25],[49,38]));assert.ok(route([6,25],[76,25]));
 player={x:48,y:38};game.talk();game.talk();doc.getElementById('fallen-story-puzzle-continue').click();
 player={x:75,y:25};game.talk();doc.getElementById('fallen-story-puzzle-continue').click();
 assert.equal(world.width,36);assert.equal(world.height,23);
 assert.equal(world.tiles[12][4],'.');
 assert.equal(world.tiles[12][10],'.');
 assert.equal(world.tiles[1][1],'T');
 assert.ok(route([3,10],[4,12]));
 assert.equal(world.tiles[4][34],'T');
 assert.equal(route([3,10],[33,8]),true);
 const g={box(){},cylinder(){},sphere(){},cone(){},piece(){},features(){},tri(){},tree(){}};
 assert.doesNotThrow(()=>game.drawProps(g));
});

test('royal intro, blue pawn, awake rook and spy windows all use consistent assets',()=>{
 assert.match(engine,/function oliver\(x,z\)\{[\s\S]*?oliverPrototype\(x,z,1\)/);
 assert.match(engine,/function recliningKing\(x,z\)\{[\s\S]*?oliver\(x,z\)/);
 assert.match(engine,/vertices\[i\+1\]=1\.10\+\(pz-z\)/);
 assert.match(source,/piece\(x,z,'P','blue',false\)/);
 assert.match(engine,/blue:\['#487ec4','#294d85','#91bbed'\]/);
 assert.match(source,/if\(scene==='intro'\)\{[\s\S]*?The guard is still AWAKE/);
 assert.match(source,/else if\(g\.recliningPiece\)/);
 assert.match(source,/Solid stone partitions left and right/);
 assert.match(source,/One narrow barred peephole/);
 assert.match(source,/if\(\(x===6\|\|x===18\)&&z>=9&&z<=10\)return false/);
 assert.doesNotMatch(source,/cylinder\(8\.25,\.09,11\.45/);
});
test('free-flowing walkable sewer has darkness, wet flagstones and only monster and exit puzzles',()=>{
 assert.match(source,/createWorld\(84,53,'H'\)/);
 assert.doesNotMatch(source,/openPuzzle\('sluice'\)/);
 assert.doesNotMatch(source,/openPuzzle\('lantern'\)/);
 assert.match(source,/openPuzzle\('monster'\)/);
 assert.match(source,/openPuzzle\('exit'\)/);
 assert.match(source,/scene==='sewer'\)return \{enabled:true,radius:10,isOpaque:sightOpaque\}/);
 assert.match(source,/if\(scene==='sewer'\)return w\.tiles\[z\]\?\.\[x\]==='H'/);
 assert.match(source,/const stream=w\.streamTiles\?\.\[z\*w\.width\+x\]/);
 assert.match(source,/tile==='s'/);
 assert.match(source,/const direction=stream\[z\*world\.width\+x\]/);
 assert.doesNotMatch(source,/Gate wheels can be operated/);
 assert.match(source,/No large gold wheels and no lamps/);
 const elements=new Map(),doc={getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',children:[],addEventListener(k,fn){this[k]=fn;},replaceChildren(...a){this.children=a;},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return elements.get(id);},addEventListener(){},createElement(){return{dataset:{},closest(){return this;}}}};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},player={x:26,y:29};
 const state={scene:'sewer',step:12,flags:{cell:true},coins:[],position:{x:6,y:25,facing:'right'}};
 const storage={getItem:k=>k==='fallen-king-chapter-one-v2'?JSON.stringify(state):null,setItem(){}};
 const api={getWorld:()=>world,getPlayer:()=>player,setWorld:(w,p)=>{world=w;player={...p}},say(){},enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,doc,storage,{},()=>true);
 const game=win.FallenKingStory;game.start(api);
 assert.equal(world.tiles[18][18],'s');assert.equal(world.tiles[26][32],'s');
 assert.equal(game.beforeMove(18,18),false);
 const visibility=game.fieldOfView();
 assert.ok(visibility.enabled);assert.equal(visibility.radius,10);
 assert.equal(visibility.isOpaque(18,18),false);
 assert.equal(visibility.isOpaque(0,0),true);
 const geom={box(){},tri(){},sphere(){},cone(){},cylinder(){},piece(){},features(){}};
 assert.doesNotThrow(()=>game.drawGround(geom,18,18));
 assert.doesNotThrow(()=>game.drawEffects(geom,0.5));
 assert.equal(doc.getElementById('fallen-story-puzzle').hidden,true);
 player={x:18,y:20};game.talk();
 assert.equal(doc.getElementById('fallen-story-puzzle').hidden,true);
 player={x:48,y:38};game.talk();game.talk();
 assert.equal(doc.getElementById('fallen-story-puzzle').hidden,false);
});

test('single connected sewer stream, optional monster, no Pip, smooth royal bed and stable village colors',()=>{
 assert.match(source,/w\.streamTiles=new Uint8Array\(w\.width\*w\.height\)/);
 assert.match(source,/for\(let i=1;i<sewerRoute\.length;i\+\+\)/);
 assert.match(source,/g\.box\(x\+\.5,\.025,z\+\.5,1\.005,\.017,1\.005,'#426871'\)/);
 assert.match(source,/const vertical=direction>=3/);
 assert.match(source,/scene==='sewer'\)return !complete\('exit'\)/);
 assert.doesNotMatch(source,/I cannot leave yet\. The strange creature/);
 assert.match(source,/n\.id!=='pip'/);
 assert.doesNotMatch(source,/say\('Pip'/);
 assert.match(source,/function drawFollowers\(g\)\{\/\* Pip is reserved/);
 assert.match(engine,/const npcPalette=\['white','black','blue','red','green','purple','orange'\]/);
 assert.match(engine,/Math\.imul\(hash\^id\.charCodeAt\(i\),16777619\)/);
 assert.match(engine,/const tone=npcColor\(n\)/);
 assert.match(engine,/const dpr=Math\.min\(window\.devicePixelRatio\|\|1,1\.4\)/);
 assert.match(engine,/gl\.polygonOffset\(-1,-1\)/);
 assert.match(engine,/vertices\[i\]=x\+\.88-py/);
 assert.match(engine,/vertices\[i\+1\]=1\.10\+\(pz-z\)/);
 assert.match(source,/Low, open royal bed/);
 assert.match(source,/The pillow is removed so Oliver's head remains visible/);
 assert.match(source,/A SMALL, unmistakeable window/);
});

test('water network reaches the outlet and every blind side passage, with ladder exit and off-path forest spawn',()=>{
 const els=new Map(),doc={getElementById(id){if(!els.has(id))els.set(id,{hidden:true,textContent:'',children:[],addEventListener(k,fn){this[k]=fn},replaceChildren(...c){this.children=c},getContext(){return{drawImage(){},fillRect(){}}},focus(){}});return els.get(id)},addEventListener(){},createElement(){return{dataset:{},closest(){return this}}}};
 const saved={scene:'sewer',step:12,flags:{cell:true},coins:[],position:{x:6,y:25,facing:'right'}};
 const mem=new Map([['fallen-king-chapter-one-v2',JSON.stringify(saved)]]);
 const store={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
 let world={width:52,height:40,version:5,tiles:Array(40).fill('p'.repeat(52)),npcs:[],houses:[],showcase:[],collectibles:[],spawn:{x:26,y:29}},p={x:26,y:29},lines=[];
 const api={getWorld:()=>world,getPlayer:()=>p,setWorld:(w,np)=>{world=w;p={...np}},say:(name,text)=>lines.push([name,text]),enableSound(){},soundCue(){}};
 const win={};new Function('window','document','localStorage','location','confirm',source)(win,doc,store,{},()=>true);
 const game=win.FallenKingStory;game.start(api);
 assert.equal(world.width,84);assert.equal(world.streamTiles[25*84+3]>0,true);
 const destinations=[[5,39],[12,17],[23,12],[24,4],[41,17],[23,31],[40,46],[56,28],[56,5],[73,18],[70,36],[56,36],[76,25]];
 for(const [x,z] of destinations){
  assert.equal(world.tiles[z][x],'s','branch terminates on walkable stone '+x+','+z);
  assert.ok(world.streamTiles[z*world.width+x]>0,'water reaches branch '+x+','+z);
 }
 assert.match(source,/for\(let y=\.35;y<=2\.75;y\+=\.30\)/);
 assert.match(source,/box\(76\.5,y,25\.48,\.99,\.064,\.12/);
 assert.doesNotMatch(source,/Portal to forest after the final PUZZLE/);
 // The last puzzle is still required, but the creature remains skippable.
 p={x:75,y:25};game.talk();
 assert.equal(doc.getElementById('fallen-story-puzzle').hidden,false);
 doc.getElementById('fallen-story-puzzle-continue').click();
 assert.equal(world.width,36);assert.equal(world.height,23);
 assert.equal(p.x,4);assert.equal(p.y,12);
 assert.equal(world.tiles[p.y][p.x],'.');
 assert.match(source,/The torches are stationed on grass OUTSIDE the walking path/);
});
test('king has two white-stone bands instead of high yellow neck rim',()=>{
 assert.match(engine,/cylinder\(x,\.15,z,\.43,\.40,\.16,rim,16\)/);
 assert.match(engine,/cylinder\(x,1\.28,z,\.40,\.39,\.14,light,16\)/);
 assert.doesNotMatch(engine,/cylinder\(x,1\.53,z,\.41,\.34,\.13,'#c7a469'/);
 assert.match(source,/if\(x>=11&&x<=13\)wall\(x\+\.5,15\.48,1,\.55\)/);
});

test('account save interface has three server-backed slots and no localStorage save fallback',()=>{
 const api=readFileSync(resolve(root,'functions/api/fallen-king/saves.js'),'utf8');
 for(const id of ['fallen-start-menu','fallen-start-slots','fallen-save-game','fallen-pause-slots','fallen-save-status'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(engine,/const slots=\['A','B','C'\]/);
 assert.match(engine,/async function initializeSaveSlots\(\)/);
 assert.match(engine,/await gameSaveRequest\('PUT',slot,initial\)/);
 assert.match(engine,/await gameSaveRequest\('PUT',slot,payload\)/);
 assert.match(engine,/window\.FallenKingPendingSave=continued\?payload\.save:null/);
 assert.match(source,/window\.FallenKingSlotSession/);
 assert.match(source,/function exportSave\(\)/);
 assert.match(api,/requireAdmin\(\{request,env\}\)/);
 assert.match(api,/auth\.session\.user\.id/);
 assert.match(api,/PRIMARY KEY\(user_id,slot\)/);
 assert.match(api,/WHERE user_id=\? AND slot=\?/);
 assert.match(api,/new Set\(\['A','B','C'\]\)/);
});

test('black-screen recovery permits playing when cloud saves or intro art fail',()=>{
 assert.match(engine,/function switchToLocalSaves\(\)/);
 assert.match(engine,/const data=switchToLocalSaves\(\)/);
 assert.match(engine,/displayStartSlots\(\)/);
 assert.match(engine,/saveMode==='local'/);
 assert.match(source,/img\.onerror=\(\)=>/);
 assert.match(source,/bedroom\.svg\?v=1/);
 assert.match(page,/fallen-king-story\.js\?v=/);
});
test('production build includes the approved AVIF intro picture',()=>{
 const build=readFileSync(resolve(root,'scripts/build-site.mjs'),'utf8');
 assert.match(build,/webp\|avif\|ico/);
 assert.match(source,/\.avif\?v=1/);
});