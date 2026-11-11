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
