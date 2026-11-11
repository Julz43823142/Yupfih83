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
 assert.match(source,/if\(near\(p,11,7,2\)\)/);
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
 assert.match(source,/createWorld\(36,13,'H'\)/);
 assert.match(source,/\[2,3,9,10\]/);
 assert.match(source,/function arch\(x,z\)/);
 assert.match(source,/v\.coins=v\.coins\.slice\(0,1\)/);
 assert.match(source,/const coinSpots=\{cell:\[\[3,8\]\]\}/);
 assert.match(source,/if\(scene==='cell'\)\{if\(x===11&&y===7\)return true;/);
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
 for(let i=0;i<10;i++){assert.doesNotThrow(()=>chapter.drawProps(geometry));element('fallen-story-next').listeners.click();}
 assert.equal(world.width,15);
 assert.equal(chapter.beforeMove(10,7),false);
 assert.equal(element('fallen-story-puzzle').hidden,true);
 player={x:9,y:7};chapter.talk();assert.equal(element('fallen-story-puzzle').hidden,true);
 chapter.talk();assert.equal(element('fallen-story-puzzle').hidden,false);
 function answer(index){element('fallen-story-answers').listeners.click({target:element('fallen-story-answers').children[index]});}
 answer(0);
 chapter.talk();assert.equal(world.width,36);
 assert.equal(world.tiles[2][7],'w');
 assert.equal(chapter.beforeMove(12,6),true);
 assert.equal(element('fallen-story-puzzle').hidden,true);
 player={x:11,y:6};chapter.talk();answer(2);
 player={x:23,y:6};chapter.talk();answer(1);
 player={x:30,y:6};chapter.talk();answer(0);
 player={x:33,y:6};chapter.talk();assert.equal(world.width,52);
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
 for(let i=0;i<10;i++){assert.doesNotThrow(()=>game.drawProps(callbacks));assert.doesNotThrow(()=>game.drawEffects(callbacks,i*.3));el('fallen-story-next').listeners.click();}
 assert.equal(world.width,15);
 assert.doesNotThrow(()=>game.drawProps(callbacks));
 assert.doesNotThrow(()=>game.drawEffects(callbacks,1));
 player={x:9,y:7};game.talk();game.talk();el('fallen-story-answers').listeners.click({target:el('fallen-story-answers').children[0]});game.talk();
 assert.equal(world.width,36);
 assert.doesNotThrow(()=>game.drawProps(callbacks));
 assert.doesNotThrow(()=>game.drawEffects(callbacks,2));
 assert.ok(count>1000,'scenes contain substantial static and dynamic detail');
 assert.match(source,/function drawMicroDetail\(g,kind\)/);
 assert.match(source,/function drawVillageProps\(g\)/);
 assert.match(source,/function drawEffects\(g,t\)/);
});

test('animated atmosphere receives the complete WebGL primitive API',()=>{
 assert.match(engine,/drawEffects\?\.\(\{box,sphere,cylinder,cone\},t\)/);
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
 assert.match(source,/dp\?\.crown\?\.\(g,9,2\.45/);
 assert.ok(page.indexOf('fallen-king-detailplus-assets.js')<page.indexOf('fallen-king-detailplus.js'));
 assert.ok(page.indexOf('fallen-king-detailplus.js')<page.indexOf('fallen-king-story.js'));
});

test('prison readability: iron bars, clear cot, metal pail and preserved candle',()=>{
 const props=source.slice(source.indexOf('function drawProps(g){'),source.indexOf('function drawVillageProps(g)'));
 assert.match(props,/Genuine forged-iron bars/);
 assert.doesNotMatch(props,/model\('gate'/);
 assert.match(props,/Narrow prison cot/);
 assert.doesNotMatch(props,/model\('bed'/);
 assert.match(props,/Metal pail rather than a large wooden barrel/);
 assert.match(props,/torch\(13,1\.45\)/);
 assert.match(props,/for\(const x of \[4,10\]\)/);
 assert.match(props,/One clearly recognizable locked cell door/);
 assert.match(source,/function drawGround\(g,x,z\)/);
});
