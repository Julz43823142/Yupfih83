(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2'; // Preserve existing chapter saves.
const steps=[
 {scene:'castle',title:'THE KINGDOM OF ALDEMAR',speaker:'Narrator',text:'King Oliver had ruled over the kingdom of Aldemar for many years.'},
 {scene:'bedroom',title:'A PEACEFUL NIGHT',speaker:'Narrator',text:'King Oliver slept peacefully, unaware of the darkness that awaited him.'},
 {scene:'approach',title:'THE STOLEN CROWN',speaker:'Narrator',text:'Edwin sneaks in and reaches for Oliver’s crown.'},
 {scene:'arrest',title:'THE FALSE KING',speaker:'Narrator',text:'Edwin, now posing as the king, orders the guards to arrest Oliver and lock him away, claiming that Oliver is a trespasser.'},
 {scene:'prison',title:'THE KING IMPRISONED',speaker:'Narrator',text:'Oliver was locked away, while Edwin took the throne.'}
];
// Placeholder stages only. Actual questions, answers and hints are intentionally deferred.
const puzzles={cell:{},sluice:{},lantern:{},monster:{},exit:{},watchChest:{},merrick:{},lumber:{},ropes:{},bridge:{}};

let engine=null,baseWorld=null,scene='intro',chapter={scene:'intro',flags:{},coins:[],step:0,position:null},activePuzzle=null;
const complete=id=>!!chapter.flags[id];
function persist(){try{if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};chapter.scene=scene;localStorage.setItem(KEY,JSON.stringify(chapter));}catch{}}
function restored(){try{const v=window.FallenKingSlotSession?(window.FallenKingPendingSave?.chapter||null):JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','forest','watchtower','village','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins)){v.coins=v.coins.slice(0,2);if(!Number.isInteger(v.step)||v.step<0)v.step=0;return v;}}catch{}return chapter;}
function createWorld(width,height,kind){const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'H':kind));return {width,height,tiles:rows.map(a=>a.join('')),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:3,y:5},version:baseWorld.version,music:'default'};}
function updateTile(w,x,y,v){const r=w.tiles[y].split('');r[x]=v;w.tiles[y]=r.join('');}
function cellWorld(){const w=createWorld(25,16,'H');
 // A continuous castle complex: guard corridor to the north, two flanking cells, Oliver's cell in the middle.
 for(let y=1;y<=13;y++)for(let x=1;x<=23;x++)updateTile(w,x,y,'s');
 for(let x=1;x<=23;x++)updateTile(w,x,5,'H'); // Locked northern cell fronts (visible iron bars).
 for(let y=5;y<=13;y++)for(const x of [6,18])updateTile(w,x,y,'H'); // Thick stone walls with narrow peephole windows.
 for(let x=1;x<=23;x++)updateTile(w,x,14,'H'); // South exterior wall and barred window.
 for(let x=1;x<=23;x++)updateTile(w,x,0,'H');
 for(let y=1;y<=14;y++){updateTile(w,0,y,'H');updateTile(w,24,y,'H');}
 // Guard has a bed in the northern passage; no direct passage through the cell bars.
 w.spawn={x:12,y:9};w.music='prison';return w;}

const sewerRoute=[[3,25],[6,25],[18,25],[18,10],[32,10],[32,38],[49,38],[49,13],[64,13],[64,25],[76,25]];
function sewerWorld(){
 // Five-tile-wide stone passages in an expanded winding underground maze.
 const w=createWorld(84,53,'H'),radius=2;
 function hall(x0,z0,x1,z1){
  const dx=Math.sign(x1-x0),dz=Math.sign(z1-z0);
  for(let x=x0,z=z0;;x+=dx,z+=dz){
   for(let oz=-radius;oz<=radius;oz++)for(let ox=-radius;ox<=radius;ox++)
    if(x+ox>0&&x+ox<w.width-1&&z+oz>0&&z+oz<w.height-1)updateTile(w,x+ox,z+oz,'s');
   if(x===x1&&z===z1)break;
  }
 }
 for(let i=1;i<sewerRoute.length;i++)hall(...sewerRoute[i-1],...sewerRoute[i]);
 // One continuous water network branches off through every dead-end passage.
 const branches=[[[5,25],[5,39]],[[12,25],[12,17]],[[18,12],[23,12]],
 [[24,10],[24,4]],[[32,17],[41,17]],[[32,31],[23,31]],
 [[40,38],[40,46]],[[49,28],[56,28]],[[56,13],[56,5]],
 [[64,18],[73,18]],[[70,25],[70,36]],[[49,36],[56,36]]];
 for(const [start,end] of branches)hall(...start,...end);
 w.streamTiles=new Uint8Array(w.width*w.height);
 for(const route of [sewerRoute,...branches]){
  for(let i=1;i<route.length;i++){
   const [sx,sz]=route[i-1],[ex,ez]=route[i],dx=Math.sign(ex-sx),dz=Math.sign(ez-sz);
   const flow=dx>0?1:dx<0?2:dz>0?3:4;
   for(let x=sx,z=sz;;x+=dx,z+=dz){
    w.streamTiles[z*w.width+x]=flow;
    if(x===ex&&z===ez)break;
   }
  }
 }
 // Remove unrelated water pockets against walls; the only stream is the centre line.
 // Open corridors throughout: there are NO puzzles or blocked floodgates before the creature and the exit.
 // The sewer creatures have physical presence; Oliver can still interact from beside them.
 w.blockers=[[49,38],[23,31],[40,45],[41,45]];
 w.spawn={x:6,y:25};w.music='sewer';return w;
}
function forestWorld(){
 // The path is a guide, not a fence: soft grassy ground is freely walkable.
 // Only the outer rows of dense old trees and small tree clusters are solid.
 const w=createWorld(36,23,'.');
 for(let y=1;y<22;y++)for(let x=1;x<35;x++){
  const forestEdge=x<=2||x>=33||y<=1||y>=20;
  if(forestEdge)updateTile(w,x,y,'T');
 }
 const carve=(a,b,c,d)=>{let x=a,z=b;const dx=Math.sign(c-a),dz=Math.sign(d-b);while(true){for(const ox of [0,1])for(const oz of [0,1])updateTile(w,x+ox,z+oz,'p');if(x===c&&z===d)break;x+=dx;z+=dz;}};
 const route=[[2,10],[8,10],[8,6],[16,6],[16,12],[25,12],[25,8],[33,8]];
 for(let i=1;i<route.length;i++)carve(...route[i-1],...route[i]);
 // Widely separated trees create landmarks without trapping Oliver on the road.
 for(const [x,y] of [[6,4],[13,14],[20,4],[28,14]]){
  for(const [dx,dz] of [[0,0],[1,0],[0,1]])if(w.tiles[y+dz]?.[x+dx]==='.')updateTile(w,x+dx,y+dz,'T');
 }
 for(const [x,y] of [[5,13],[13,4],[19,15],[28,5]])for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++)
  if(w.tiles[y+dz]?.[x+dx]==='.')updateTile(w,x+dx,y+dz,'p');
 // The larger northern forest clearing gives the tower a distinct footprint.
 // No prototype or statue displays remain on the playable forest map.
 for(let y=2;y<=9;y++)for(let x=22;x<=31;x++)if(w.tiles[y]?.[x]==='T')updateTile(w,x,y,'.');
 // Solid watchtower footprint, moved north; its south-facing door is the only entrance.
 for(let y=3;y<=7;y++)for(let x=25;x<=29;x++)updateTile(w,x,y,'H');
 updateTile(w,27,7,'D');
 for(let y=8;y<=12;y++)for(let x=26;x<=28;x++)updateTile(w,x,y,'p');
 // Gate is farther east, spanning four path tiles with two-tile passage width.
 for(let y=2;y<=19;y++)for(let x=32;x<=33;x++)updateTile(w,x,y,'T');
 for(let y=7;y<=10;y++)for(let x=31;x<=33;x++)updateTile(w,x,y,'p');
 // Keep the old footpath walkable without placing any display pedestals.
 for(let x=11;x<=23;x++)for(let y=8;y<=12;y++)updateTile(w,x,y,'p');
 w.signs=[{x:9,y:13,text:'Willowmere Village lies east, beyond the watchtower. Keep to the marked path.'}];
 w.spawn={x:4,y:12};w.music='willowmere';
 w.npcs=[
  {id:'forest-traveller',name:'Travelling Bishop',x:13,y:7,piece:'B',color:'white',lines:['A king? In these muddy woods? You must be joking.','Take the eastern path if you are looking for Willowmere.']},
  {id:'forest-woodcutter',name:'Old Woodcutter',x:21,y:13,piece:'R',color:'black',lines:['King Oliver? I have seen the king in the castle, stranger.','Follow the lanterns. Willowmere is not far.']}
 ];
 w.npcs.push({id:'watch-keeper',name:'Gatekeeper Rowan',x:24,y:9,piece:'R',color:'white',lines:['The key is inside the watchtower. Enter through the door.']},{id:'watch-scout',name:'Watchpost Scout',x:30,y:11,piece:'P',color:'green',lines:['Ask Rowan about the gate.']});return w;}
function watchtowerWorld(){
 // Dedicated large interior, invisible until Oliver enters through the exterior door.
 const w=createWorld(17,14,'s');
 for(let x=1;x<16;x++){updateTile(w,x,1,'H');updateTile(w,x,12,'H');}
 for(let y=1;y<=12;y++){updateTile(w,1,y,'H');updateTile(w,15,y,'H');}
 updateTile(w,8,12,'D');
 // The keeper is a solid, interactive rook; crates and the chest cannot be walked through.
 w.npcs=[{id:'watchtower-keeper',name:'Tower Keeper',x:5,y:6,piece:'R',color:'white',lines:['The barrier key is locked in that chest.','I cannot open it: I do not know the code. Perhaps you can solve the lock.']}];
 w.blockers=[[8,4],[3,6],[4,6],[13,6],[14,6],[3,10],[4,10],[5,10],[13,10],[14,10],[12,9],[13,9]];
 w.spawn={x:8,y:10};w.music='willowmere';
 return w;
}
function villageWorld(){
 const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.filter(n=>n.id!=='pip').map(n=>({...n,lines:[...n.lines]}))};
 for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');
 for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');
 if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');
 w.spawn={x:26,y:29};
 // The six older statue display pieces are retired from Willowmere.
 w.showcase=[];
 // Remove each retired showcase pedestal AND its X collision tile.
 for(const p of baseWorld.showcase||[]){
  updateTile(w,p.x,p.y,'p');
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const x=p.x+dx,y=p.y+dz;
   if(w.tiles[y]?.[x]==='g'||w.tiles[y]?.[x]==='f')updateTile(w,x,y,'p');
  }
 }
 // Open a small natural access to the pond without clearing the entire woodland.
 for(const [x,y] of [[6,9],[7,9],[8,9],[9,9],[10,9],[7,10],[8,10],[9,10]])if(w.tiles[y]?.[x]==='T')updateTile(w,x,y,'.');
 // Larger market props are solid; small plants and floor details stay walkable.
 w.blockers=[[31,29],[32,29]];
 return w;
}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():next==='forest'?forestWorld():next==='watchtower'?watchtowerWorld():villageWorld();const requested=position||({...w.spawn,facing:'down'});const safe=w.tiles[Math.round(requested.y)]?.[Math.round(requested.x)];const pos=safe&&!['H','w','T','F','X'].includes(safe)?requested:{...w.spawn,facing:'right'};engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;}
function teleport(destination){
 if(!engine||!['cell','sewer','forest','village'].includes(destination))return;
 activePuzzle=null;
 for(const id of ['fallen-story-intro','fallen-story-puzzle','fallen-pause','fallen-map','fallen-wardrobe']){const el=$(id);if(el)el.hidden=true;}
 setScene(destination,destination==='cell'?{x:12,y:9,facing:'right'}:destination==='sewer'?{x:6,y:25,facing:'right'}:destination==='forest'?{x:17,y:13,facing:'up'}:{x:26,y:29,facing:'down'});
 engine.resumeGameplay?.();
 document.getElementById('fallen-canvas')?.focus({preventScroll:true});
}
function say(name,...lines){engine.say(name,lines);}
function objective(){if(scene==='cell')return complete('cell')?'The drain is open. Press E at the toilet to escape.':complete('inspectedToilet')?'Find the mechanism beneath the toilet. Press E to examine it.':'Find a way out of the prison cell.';if(scene==='sewer')return !complete('exit')?'Find the sewer exit.':'Escape into the forest (E).';if(scene==='forest')return complete('watchChest')?'Pass the open barrier into Willowmere.':'Enter the watchtower (E) and unlock the gate.';if(scene==='watchtower')return complete('watchChest')?'Leave the watchtower through the south door.':'Examine the chest inside the watchtower (E).';if(!complete('lumber'))return 'Ask Baker Bea about timber for the broken bridge.';if(!complete('ropes'))return 'Find Courier Nox and work out the ropes.';if(!complete('bridge'))return 'Go to the east bridge and solve the final engineering puzzle.';return 'The bridge is restored. Chapter One complete!';}
function updateObjective(){const o=$('fallen-story-objective'),h=$('fallen-pause-title');if(o&&h&&o.parentNode!==h.parentNode){h.parentNode.insertBefore(o,h);o.style.cssText='display:block;position:static;margin:0 auto 12px;padding:10px;border:1px solid #a49270;border-radius:6px;background:#202632;color:#e8d7ae;text-align:center;font-size:14px';}if(o){o.textContent='Objective: '+objective();o.hidden=scene==='intro';}const d=$('fallen-story-interact');if(d)d.hidden=true;}
function start(api){engine=api;baseWorld=api.getWorld();document.querySelectorAll?.('[data-fallen-jump]')?.forEach(b=>b.addEventListener('click',()=>teleport(b.dataset.fallenJump)));chapter=restored();if(chapter.scene==='intro'){scene='intro';showIntro();}else setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);if(chapter.scene!=='intro')$('fallen-story-intro').hidden=true;document.addEventListener('keydown',onKey,true);$('fallen-story-next').addEventListener('click',nextIntro);$('fallen-story-skip')?.addEventListener('click',()=>{if(scene!=='intro')return;engine.enableSound();chapter.step=steps.length;const intro=$('fallen-story-intro');intro.hidden=true;setScene('cell',{x:12,y:9,facing:'right'});say('Oliver','A locked cell. The old toilet might conceal a way out.');});$('fallen-story-art').addEventListener('click',nextIntro);$('fallen-story-puzzle-continue').addEventListener('click',continuePuzzle);$('fallen-story-puzzle-close').addEventListener('click',closePuzzle);$('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});updateObjective();}
function recoverHiddenIntro(){
 // If an interrupted load or hidden overlay leaves the cutscene state active,
 // enter the playable cell instead of trapping the player in intro input mode.
 if(scene!=='intro')return false;
 const overlay=$('fallen-story-intro');
 if(overlay&&!overlay.hidden){
  // A CSS-hidden or detached cinematic must not leave the engine in the
  // non-playable intro scene. The actual five-panel presentation is unchanged.
  const visuallyHidden=typeof overlay.getClientRects==='function'&&overlay.getClientRects().length===0;
  if(!visuallyHidden)return false;
 }
 setScene('cell',{x:12,y:9,facing:'right'});
 return true;
}
function blockedInput(){recoverHiddenIntro();return scene==='intro'||!!activePuzzle;}
function onKey(e){if(!blockedInput())return;const k=e.key.toLowerCase();if(['e','enter',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(scene==='intro')nextIntro();else if(activePuzzle)continuePuzzle();return;}if(k==='escape'&&activePuzzle){e.preventDefault();e.stopImmediatePropagation();closePuzzle();}if(scene==='intro'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}}
function showIntro(){
 scene='intro';
 $('fallen-story-intro').hidden=false;
 const step=steps[Math.min(chapter.step,steps.length-1)];
 const canvas=$('fallen-story-art');
 canvas.width=1672;canvas.height=941;
 $('fallen-story-intro').classList?.add('fallen-five-approved');
 $('fallen-story-intro').classList?.remove('fallen-five-missing-asset');
 for(const oldName of ['fallen-first-approved','fallen-second-approved','fallen-edwin-approved'])
  $('fallen-story-intro').classList?.remove(oldName);
 engine.setWorld(introWorld(step.scene),step.scene==='prison'?{x:12,y:7,facing:'down'}:{x:9,y:6,facing:'down'});
 $('fallen-story-intro-title').textContent=step.title;
 $('fallen-story-next').textContent=chapter.step===steps.length-1?'Begin escape →':'Continue →';
 drawIntroImage(step.scene);
 persist();
}
function nextIntro(){
 if(scene!=='intro')return;
 engine.enableSound();
 if(chapter.step===0)engine.soundCue();
 chapter.step++;
 if(chapter.step>=steps.length){
  $('fallen-story-intro').hidden=true;
  setScene('cell',{x:12,y:9,facing:'right'});
  say('Oliver','An old toilet. A barred door. And a puzzle carved into the drain.');
 }else showIntro();
}
function introWorld(kind){
 if(kind==='prison')return cellWorld();
 const w=createWorld(18,12,'s');
 w.music=['approach','arrest'].includes(kind)?'theft':'palace';
 return w;
}
// The five artist-approved original PNGs are used unchanged; each embeds its own English caption.
const introArtwork={};
function drawIntroImage(){
 const index=Math.max(0,Math.min(chapter.step,4));
 const path='/assets/fallen-king-intro/intro-'+(index+1)+'.png';
 const canvas=$('fallen-story-art'),c=canvas.getContext('2d');
 c.imageSmoothingEnabled=true;
 const img=introArtwork[path]||(introArtwork[path]=typeof Image==='undefined'?{complete:false,naturalWidth:0,src:''}:new Image());
 if(img.complete&&img.naturalWidth){
  c.clearRect(0,0,canvas.width,canvas.height);
  c.drawImage(img,0,0,canvas.width,canvas.height);
  return;
 }
 c.fillStyle='#243747';c.fillRect(0,0,canvas.width,canvas.height);
 if(!img.src&&typeof Image!=='undefined'){
  img.onload=()=>{if(scene==='intro'&&chapter.step===index)drawIntroImage();};
  img.onerror=()=>{
   if(scene!=='intro'||chapter.step!==index)return;
   c.fillStyle='#243747';c.fillRect(0,0,canvas.width,canvas.height);
   c.fillStyle='#fff0c6';c.font='bold 34px Georgia,serif';
   c.fillText('THE FALLEN KING',70,Math.round(canvas.height/2));
   // Never show duplicate narration beneath the approved original artwork.
   $('fallen-story-intro').classList?.add('fallen-five-missing-asset');
  };
  img.src=path;
 }
}
function renderIntroFrame(){/* Keep the dedicated comic artwork visible, not the top-down 3D world. */}
function isIntro(){return scene==='intro';}
function isPrisoner(){return scene==='cell'||scene==='sewer'||scene==='forest';}
function hasMap(){return !!chapter?.flags?.mapFound;}
function musicTheme(){if(scene==='intro')return ['theft','approach'].includes(steps[Math.min(chapter.step,steps.length-1)].scene)?'theft':steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?'prison':'palace';return scene==='cell'?'prison':scene==='sewer'?'sewer':'willowmere';}
// Temporary narrative checkpoint; final logic puzzles will be authored after all levels are finished.
function openPuzzle(id){if(!Object.hasOwn(puzzles,id)||complete(id))return;activePuzzle=id;
 $('fallen-story-puzzle-name').textContent='PUZZLE';
 $('fallen-story-question').textContent='';
 $('fallen-story-feedback').textContent='';
 $('fallen-story-answers').replaceChildren();
 $('fallen-story-puzzle').hidden=false;
 $('fallen-story-puzzle-continue').hidden=false;
}
function closePuzzle(){activePuzzle=null;$('fallen-story-puzzle').hidden=true;document.getElementById('fallen-canvas').focus({preventScroll:true});}
function continuePuzzle(){if(!activePuzzle)return;const id=activePuzzle;chapter.flags[id]=true;closePuzzle();
 if(id==='exit')setScene('forest',{x:4,y:12,facing:'right'});
 else if(scene==='sewer')setScene('sewer',engine.getPlayer());
 else if(scene==='village')setScene('village',engine.getPlayer());
 else if(scene==='forest')setScene('forest',engine.getPlayer());
 else persist();
 const lines={cell:'The toilet drain is open. I can squeeze into the sewers.',sluice:'The first floodgate rises, revealing deeper tunnels.',lantern:'The second gate unlocks. The maze continues.',monster:'The strange creature finally has an answer.',watchChest:'Oh my god, thank you! I am opening the barrier now.',exit:'I climb the iron ladder and push the hatch open. Fresh woodland air!',merrick:'The bishop nods and lets Oliver pass.',lumber:'We have the timber needed for the bridge.',ropes:'The ropes are ready. Time to repair the bridge.',bridge:'The bridge is repaired. We can cross now.'};
 say('Oliver',lines[id]||'The way ahead is clear.');updateObjective();
}
// Movement never opens a puzzle. Controls and discoveries require an explicit E/Enter/Space action.
function beforeMove(x,y){
 if(scene==='cell')return x===16&&y===10;
 if(scene==='sewer')return x>=79&&y>=23&&y<=27;
 if(scene==='forest')return (!complete('watchChest')&&x===32&&y>=7&&y<=10)||(x>=34&&y>=7&&y<=10);
 if(scene==='village'&&x>=45&&x<=47&&y===19&&!complete('bridge'))return true;
 return false;
}
const coinSpots={cell:[[12,13]]};
function afterMove(){const p=engine.getPlayer();
 if(scene==='village'&&complete('bridge')&&p.x>=48&&p.y===19&&!complete('chapterEnd')){chapter.flags.chapterEnd=true;say('Oliver','The road east is open. I must continue my journey.');}
 persist();updateObjective();}
function near(p,x,y,r=2){return Math.abs(p.x-x)+Math.abs(p.y-y)<=r;}
function talk(){if(!engine||blockedInput())return blockedInput();const p=engine.getPlayer(),{x,y}=p;
 if(scene==='cell'){
  if(near(p,16,10,2)){if(!complete('inspectedToilet')){chapter.flags.inspectedToilet=true;say('Oliver','An old toilet. A drain and a hidden mechanism: perhaps it leads below the castle.');}
   else if(!complete('cell'))openPuzzle('cell');
   else{setScene('sewer',{x:6,y:25,facing:'right'});say('Oliver','I have slid through the filthy pipe into the vast sewers. That explains the smell.');}
   persist();updateObjective();return true;}
  if(near(p,12,13,2)&&y>=11){
   if(!complete('coinFound')){chapter.flags.coinFound=true;chapter.coins=['one-hidden-coin'];$('fallen-story-hintcoins').textContent='Hint coins: 1';persist();say('Oliver','A glint on the south window ledge! One hint coin. I will save it for later.');}
   else say('Oliver','Moonlight reflects off the castle moat. The window is far too high to climb through.');
   return true;
  }
  if(near(p,9,7,2)){say('Oliver','Only a narrow iron cot and a worn blanket.');return true;}
  if(y<=7&&near(p,12,5,4)){say('Oliver','I think he is asleep. I should keep my voice down.');return true;}
  if(x<=8&&y>=6){say('Prisoner Mara','That guard snores every night. If you escape, do not forget us.');return true;}
  if(x>=17&&y>=6){say('Prisoner Tovin','I can hear water running beneath your cell.');return true;}
  say('Oliver','Cold stone. Iron bars. The way out must be hidden somewhere.');return true;
 }
 if(scene==='sewer'){
  if(near(p,3,25,3)){say('Oliver','That disgusting, rusted outlet pipe is where I came from. I am never going back in there.');return true;}
  // Floodgate checkpoints are removed entirely; this sewer is explored freely.
  if(near(p,23,31,2)){say('Strange Sewer Beast','GRRR.');return true;}
   if(near(p,40,45,2)){if(!complete('sewerCoinFound')){chapter.flags.sewerCoinFound=true;chapter.coins.push('rubbish-heap-coin');$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;persist();say('Oliver','A hint coin hidden in the rubbish!');}else say('Oliver','Only rubbish remains.');return true;}
   if(near(p,49,38,3)&&!complete('monster')){
   if(!complete('monsterIntroduced')){chapter.flags.monsterIntroduced=true;persist();say('Sewer Creature','I have lived in these filthy drains for years. One strange puzzle has defeated me every night. Can you help me?');}
   else openPuzzle('monster');
   return true;
  }
  if(near(p,76,25,3)){
   if(!complete('exit')){openPuzzle('exit');return true;}
   say('Oliver','The iron ladder leads up through a hatch into the forest.');setScene('forest',{x:4,y:12,facing:'right'});say('Oliver','Fresh air! A forest path leads toward a village.');return true;
  }
  say('Oliver','The tunnels twist in every direction. Many passages end in solid stone.');return true;
 }
 if(scene==='forest'){
  if(near(p,9,13,2)){say('Wooden Sign','Willowmere Village → East. Follow the forest path to the watchtower and the gate.');return true;}
  if(near(p,27,7,2)&&y>=7&&y<=9){setScene('watchtower',{x:8,y:10,facing:'up'});say('Oliver','Inside the watchtower. The key chest must be somewhere in this room.');return true;}
   if(complete('watchChest')&&x>=33&&y>=7&&y<=11){
   setScene('village',{x:26,y:29,facing:'up'});
   say('Oliver','A village at last. Perhaps someone here will believe I am the king.');return true;
  }
  return false;
 }
 if(scene==='watchtower'){
  if(near(p,5,6,2)){say('Tower Keeper','The gate key is inside the locked chest. I do not know its code.','If you crack the code, you can raise the barrier outside.');return true;}
  if(near(p,8,4,3)&&!complete('watchChest')){if(!complete('watchAsked')){chapter.flags.watchAsked=true;persist();say('Oliver','The chest has a password lock. I should try to solve it.');}else openPuzzle('watchChest');return true;}
  if(near(p,8,12,2)){setScene('forest',{x:27,y:11,facing:'down'});return true;}
  return true;
 }
 if(scene==='village'){
  if(near(p,17,19,2)&&!complete('lumber')){openPuzzle('lumber');return true;}
  if(complete('lumber')&&near(p,16,28,2)&&!complete('ropes')){openPuzzle('ropes');return true;}
  if(x>=41&&y>=17&&y<=21){
   if(!complete('lumber')||!complete('ropes'))say('Oliver','Timber and rope are still needed to repair the bridge.');
   else if(!complete('bridge'))openPuzzle('bridge');
   else say('Oliver','The bridge is ready. The way ahead is clear.');
   return true;
  }
  return false;
 }
 return false;}
function beforeHouse(){return false;}
function customScene(){return scene==='intro'||scene==='cell'||scene==='sewer'||scene==='forest'||scene==='watchtower';}

// Deliberate material pass: shared deterministic details on the ORIGINAL WebGL meshes.
// Keep small details in static geometry; do not trigger puzzles or alter collision tiles.
function drawMicroDetail(g,kind){
 const {box,cylinder,cone,sphere}=g;
 const h=(x,z,n=0)=>{const k=Math.sin(x*127.1+z*311.7+n*74.7)*43758.5453;return k-Math.floor(k)};
 function flagStone(x,z,y=0,color='#8c9088'){box(x,y+.014,z,.88,.028,.89,color);box(x-.30,y+.032,z-.3,.16,.018,.12,'#b0aea0');}
 function rivet(x,y,z){sphere(x,y,z,.047,'#d2bb86',6);}
 function candle(x,z,y=.55){cylinder(x,y,z,.075,.075,.20,'#e9d5b6',8);box(x,y+.11,z,.025,.04,.025,'#403a36');}
 function book(x,z,c){box(x,.76,z,.36,.16,.53,c);box(x+.025,.85,z,.32,.035,.49,'#eadab8');box(x-.18,.77,z,.05,.17,.58,'#e4b978');}
 if(kind==='bedroom'||kind==='approach'||kind==='theft'){
  for(let x=2;x<17;x++)for(let z=2;z<11;z++)if(h(x,z)<.61)flagStone(x+.5,z+.5,.02,h(x,z,1)>.5?'#aa967d':'#b4a38e');
  // Carved wardrobe, mirror, heraldic inlays, layered draperies and furniture joinery.
  for(const x of [2.2,4.0]){box(x,.78,3.2,.14,1.58,.15,'#6a4e40');box(x,1.25,3.29,.08,.85,.05,'#d1b179');rivet(x,1.77,3.34);}
  for(const x of [6.0,12.0]){box(x,1.73,1.16,.13,2.0,.18,'#e2c184');for(let j=0;j<5;j++)rivet(x,1.1+j*.35,1.33);}
  box(5.1,.83,8.7,1.25,.12,.80,'#6e4c42');for(const dx of [-.45,.45])cylinder(5.1+dx,.42,8.7,.07,.07,.80,'#bca17a',8);
  for(let i=0;i<4;i++){book(4.55+i*.28,8.55,['#7f3f54','#44677b','#566e57','#97694a'][i]);}
  for(const x of [2.3,15.5]){box(x,1.18,10.5,.8,2.3,.13,'#6c3d52');box(x,2.48,10.54,.98,.16,.16,'#d0ac72');for(let a=0;a<3;a++)rivet(x+(a-1)*.27,1.34,10.61);}
  for(const z of [2.3,7.4]){cylinder(1.7,.92,z,.26,.27,1.70,'#b49f7b',9);box(1.7,1.87,z,.7,.15,.70,'#e4cf9c');candle(1.7,z,2.0);}
  for(const [x,z] of [[12.1,8.6],[14.8,8.4]]){box(x,.25,z,.52,.48,.50,'#79604d');box(x,.53,z,.56,.09,.54,'#af9676');rivet(x,.58,z+.29);}
  for(let i=0;i<6;i++){const x=6.6+i*.95;box(x,.41,4.12,.09,.03,.15,'#d0bc89');}
 }
 if(kind==='throne'){
  for(let x=2;x<17;x++)for(let z=2;z<11;z++)if(h(x,z)<.83)flagStone(x+.5,z+.5,.0,h(x,z,1)>.55?'#c2af8b':'#ab9c81');
  for(const x of [3,15]){cylinder(x,.55,4.1,.27,.28,1.12,'#d3bc87',10);box(x,1.21,4.1,.8,.14,.8,'#e4ca92');candle(x,4.1,1.34);}
  for(const z of [2.5,5.4,8.3]){box(1.4,.75,z,.17,1.5,1.25,'#9d4752');box(1.51,1.50,z,.22,.13,1.38,'#e7be6f');}
  for(let z=2;z<10;z+=2)for(const x of [5.6,12.4]){cylinder(x,.66,z,.13,.17,1.33,'#af9c7a',8);box(x,1.4,z,.44,.10,.37,'#dbc58f');}
  for(const x of [7.4,10.6])for(let z=2;z<=5;z+=.8){box(x,.055,z,.17,.08,.55,'#eed6aa');}
 }
 if(kind==='prison'||kind==='cell'){
  const max=kind==='cell'?14:17;
  for(let x=1;x<max;x++)for(let z=3;z<=9;z++){const k=h(x,z);if(k<.43)flagStone(x+.5,z+.5,.0,k<.12?'#68736e':'#81837b');if(k>.91)box(x+.5,.07,z+.5,.09,.02,.31,'#4b6665');}
  // Irregular mortar, damp patches, drainage seams and thick iron anchors.
  for(let x=1;x<max;x+=2){for(const y of [.44,1.05,1.71,2.05]){box(x+.5,y,.94,.74,.036,.09,'#434e53');box(x+1.0,y+.22,.94,.06,.42,.09,'#4b595d');}}
  for(const x of [2.3,5.7,8.7,12.4]){box(x,.06,9.85,.70,.06,.18,'#455e5b');box(x,.09,9.88,.23,.025,.15,'#6e8d79');}
  for(const x of [3.0,6.8,10.9]){cylinder(x,.28,2.0,.14,.14,.50,'#424c54',8);box(x,.57,2.0,.31,.11,.32,'#a5a197');}
  for(let x=2;x<max;x+=3){box(x,2.50,1.63,.12,.23,2.1,'#5a6468');box(x,2.62,1.63,.20,.08,2.1,'#92968b');}
  for(const z of [4,7,9]){box(14.04,.7,z,.08,.92,.62,'#52605b');box(14.07,.35,z,.09,.08,.70,'#38564e');}
  if(kind==='cell'){
   for(const x of [3.4,4.5,5.6]){box(x,.08,4.8,.11,.08,.65,'#b2ad93');}
   for(let i=0;i<6;i++){const z=6.6+i*.20;box(11.08,.19,z,.07,.03,.11,'#555d59');}
   box(12.12,.77,7.0,.25,.13,.12,'#a9a9a4');rivet(12.14,.86,7.14);
   box(6.8,.11,8.8,.38,.17,.38,'#554a3d');box(6.8,.21,8.8,.32,.06,.29,'#81715b');
  }
 }
 if(kind==='sewer'){
  for(let x=1;x<35;x++)for(const z of [4.65,5.05,7.92,8.34])if(h(x,z)<.63){box(x+.5,.08,z,.82,.05,.30,h(x,z,2)>.5?'#4b7568':'#52796f');}
  // Water runoff, concentric grates, riveted pipe bands, growth in cracks.
  for(let x=2;x<35;x+=4){for(const z of [1.0,12.0]){cylinder(x,.79,z,.29,.30,.20,'#8e9283',10);cylinder(x,.79,z,.21,.21,.23,'#3f5151',10);for(let a=0;a<6;a++){const t=a*Math.PI/3;box(x+Math.cos(t)*.25,.79,z+Math.sin(t)*.25,.11,.06,.09,'#b5ad8c');}}}
  for(let x=4;x<35;x+=6){for(const z of [3.55,9.35]){box(x,.13,z,.52,.12,.40,'#788983');for(let i=0;i<4;i++)box(x-.18+i*.12,.20,z,.06,.025,.41,'#364d51');}}
  for(let x=2;x<35;x+=3){const a=h(x,4);if(a>.42){cone(x+.2,.33,4.48,.11,.46,'#426e55',7);cone(x+.5,.26,8.65,.08,.38,'#577b57',7);}if(a>.75){sphere(x+.7,.26,3.1,.13,'#608d84',7);sphere(x+.82,.31,3.14,.07,'#99b4a7',6);}}
  for(const x of [6,16,26])for(const z of [4.6,8.4]){box(x,1.20,z,.29,1.5,.22,'#5a6f68');box(x,1.92,z,.40,.11,.30,'#b3aa83');rivet(x,1.53,z+.19);}
  for(let x=2;x<35;x+=5){box(x,2.75,3.8,.13,.60,.13,'#54735e');cone(x,2.21,3.8,.20,.62,'#456a58',8);box(x,2.75,9.2,.14,.58,.13,'#54735e');}
 }
}
// Scene-specific floor materials: never reuse village grass, flowers or pond lilies indoors.
function backdrop(){if(scene==='cell')return [.004,.007,.012];if(scene==='sewer')return [.065,.10,.12];if(scene==='intro')return steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?[.065,.10,.12]:[.18,.14,.16];return null;}
function sightOpaque(x,z){if(scene!=='cell'&&scene!=='sewer')return false;const w=engine.getWorld();
 if(scene==='sewer')return w.tiles[z]?.[x]==='H';if(x<0||z<0||x>=w.width||z>=w.height)return true;
 // Partition bars and the north gate block walking, but NOT the line of sight.
 if(z===5&&x>=1&&x<=23)return false;
 if((x===6||x===18)&&z>=9&&z<=10)return false; // Sight only through each narrow spy window.
 if(z===14&&x===12)return false; // The small south-facing opening.
 return w.tiles[z]?.[x]==='H';}
function fieldOfView(){if(!engine)return null;if(scene==='sewer')return {enabled:true,radius:10,isOpaque:sightOpaque};if(scene==='cell')return {enabled:true,radius:6,isOpaque:sightOpaque};return null;}
function drawGround(g,x,z){
 const w=engine.getWorld(),tile=w.tiles[z]?.[x]||'H',isPalace=scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison';
 const base=isPalace?'#9d856d':scene==='sewer'?'#43575a':scene==='forest'?'#496b4f':'#696f6d';
 if(scene==='watchtower'){g.box(x+.5,-.20,z+.5,1,.18,1,'#72716c');g.box(x+.5,-.018,z+.5,.96,.028,.96,(x+z)%2?'#999287':'#aaa294');return;}
 if(scene==='forest'){const path=tile==='p'||tile==='s';g.box(x+.5,-.20,z+.5,1,.18,1,path?'#7e7661':'#37553e');if(path){g.box(x+.5,-.025,z+.5,.94,.025,.94,(x+z)%4===0?'#908267':'#746e5c');}else{g.box(x+.5,-.014,z+.5,.94,.02,.94,(x*3+z)%7===0?'#507451':'#466647');}return;}
 g.box(x+.5,-.20,z+.5,1,.19,1,base);
 if(scene==='sewer'&&tile==='w'){g.box(x+.5,-.045,z+.5,1,.055,1,'#355d68');return;}
 if(scene==='sewer'&&tile==='H'){g.box(x+.5,-.035,z+.5,1,.055,1,'#354447');return;}
 if(isPalace){g.box(x+.5,.006,z+.5,.94,.017,.94,(x+z)%4===0?'#b5a083':'#a8967c');return;}
 if(scene==='sewer'&&tile==='s'){
  const stream=w.streamTiles?.[z*w.width+x]||0;
  if(true) // One low-cost flagstone mesh per sewer tile; avoid repeated GLB copies.
    g.box(x+.5,.005,z+.5,.96,.02,.96,'#596461');
  if(stream)g.box(x+.5,.025,z+.5,1.005,.017,1.005,'#426871');
  else if((x*7+z*3)%11===0)g.box(x+.5,.023,z+.5,.45,.009,.36,'#4c615d');
  if((x*17+z*11)%139===0&&!stream){
   g.box(x+.5,.032,z+.5,.70,.018,.61,'#364c51');
   for(let i=0;i<5;i++)g.box(x+.21+i*.15,.047,z+.5,.045,.015,.58,'#87948e');
  }
  return;
 }
 // Keep the original flat flagstone floor in the prison; cloning a full GLB
 // on every tile can exhaust browser memory before Oliver can move.
 if(scene!=='cell'&&scene!=='sewer'&&window.FallenKingDetailPlus?.draw(g,'floor',x+.5,.005,z+.5,.99,.02,.99))return;
 g.box(x+.5,.005,z+.5,.96,.02,.96,scene==='sewer'?'#6c7977':'#94958c');
}
// Small, fixed world ornaments: deterministic meshes, no new collision tiles.
function drawWildflowers(g,x,z,seed){
 const {box,cone,sphere}=g;
 for(let i=0;i<3;i++){
  const ox=((seed*13+i*7)%17)/35-.24,oz=((seed*5+i*11)%19)/39-.24;
  const h=.16+.055*((seed+i)%3),px=x+ox,pz=z+oz;
  box(px,h/2,pz,.018,h,.018,'#54794e');
  sphere(px,h+.03,pz,.060,['#e8c783','#d4b4d6','#f0e2ba','#aac9d8'][(seed+i)%4],7);
 }
}
function drawWaypost(g,x,z,labelColor='#b69b6e'){
 const {box,cone}=g;
 box(x,.68,z,.15,1.36,.16,'#694e36');
 cone(x,1.45,z,.20,.30,'#a48f69',8);
 box(x,1.16,z,.85,.28,.13,'#83613e');
 box(x,1.17,z+.072,.64,.085,.025,labelColor);
 box(x,.30,z,.45,.08,.37,'#695d45');
}
function drawVillageDetails(g){
 const {box,cylinder,cone,sphere}=g;
 // Flower troughs, herb pots and a public waste basket along market edges.
 for(const [x,z] of [[20.4,25.8],[34.5,25.6],[24.1,35.0],[32.8,34.1]]){
  box(x,.23,z,1.20,.40,.46,'#775338');
  box(x,.47,z,1.11,.09,.39,'#bb9667');
  box(x,.53,z,1.01,.06,.30,'#3e6041');
  for(let i=0;i<5;i++){const px=x-.43+i*.21;sphere(px,.65,z,.095,i%2?'#edca87':'#d49bb0',8);}
 }
 for(const [x,z] of [[19.8,32.0],[35.7,31.5],[22.2,22.4]]){
  cylinder(x,.28,z,.32,.27,.55,'#aa9072',10);
  cylinder(x,.56,z,.35,.35,.075,'#ceb296',10);
  for(let i=0;i<4;i++)cone(x+Math.cos(i*1.57)*.12,.80,z+Math.sin(i*1.57)*.12,.15,.43,'#587856',7);
 }
 const tx=34.6,tz=28.8;
 cylinder(tx,.39,tz,.32,.29,.73,'#665344',12);
 cylinder(tx,.80,tz,.37,.37,.11,'#b29565',12);
 cylinder(tx,.92,tz,.21,.21,.05,'#342c2a',12);
 for(let i=0;i<7;i++){const a=i*2*Math.PI/7;box(tx+Math.cos(a)*.28,.40,tz+Math.sin(a)*.28,.045,.49,.055,'#ae946e');}
 // Notice board and its wax-sealed notices, safely off the main square.
 box(37.3,1.19,28.6,1.55,1.12,.16,'#725139');
 box(37.3,1.19,28.72,1.35,.88,.04,'#c6b18b');
 for(const [x,y] of [[36.9,1.35],[37.48,1.42],[37.16,.95]]){
  box(x,y,28.75,.34,.32,.026,'#e9d8ae');
  sphere(x+.10,y-.09,28.78,.038,'#a7463f',7);
 }
 for(const x of [36.6,38.0])box(x,.55,28.55,.12,1.1,.15,'#6f5945');
 // Low-profile weeds and flowers never block walking or sight lines.
 for(let i=0;i<36;i++){
  const x=10+((i*23)%30)+.30,z=7+((i*17)%28)+.3;
  if((x>16&&x<34&&z>19&&z<35)||(x>40&&z>16&&z<24))continue;
  drawWildflowers(g,x,z,i);
 }
}
// Second art pass: decorative meshes only; gameplay and collision tiles are unchanged.
function drawForestMicroDetails(g,world){
 const {box,cylinder,cone,sphere}=g;
 // Ferns and tiny mushrooms occupy open grass away from the main paths.
 for(let i=0;i<42;i++){
  const x=3+((i*17)%28),z=2+((i*11)%17);
  if(world.tiles[z]?.[x]!=='.'||(x>=24&&x<=30&&z<=10))continue;
  const px=x+.48,pz=z+.46;
  if(i%3===0){
   cylinder(px,.065,pz,.045,.050,.13,'#e6dfb4',7);
   sphere(px,.19,pz,.13,'#ae6659',9);
   for(const [dx,dz] of [[-.07,0],[.07,0],[0,.06]])sphere(px+dx,.305,pz+dz,.029,'#f2dec8',6);
  }else{
   for(let n=0;n<4;n++){
    const a=n*Math.PI/2+i*.7;
    cone(px+Math.cos(a)*.095,.17,pz+Math.sin(a)*.095,.09,.34,n%2?'#577e51':'#6a915f',6);
   }
  }
 }
 // Fallen logs, moss and pale lichen at the forest's outer edges.
 for(const [x,z] of [[5.6,17.4],[15.6,18.2],[21.8,2.5],[31.2,16.5]]){
  cylinder(x,.22,z,.28,.32,.72,'#634f3a',9);
  cylinder(x,.60,z,.24,.24,.06,'#ad9069',9);
  for(let k=0;k<3;k++)sphere(x-.13+k*.13,.67,z+.08,.057,'#6b835b',7);
 }
 // A little stone trail marker near the village approach.
 for(const [x,z] of [[29.6,14.7],[11.7,4.0]]){
  box(x,.18,z,.60,.35,.52,'#777e72');
  box(x,.48,z,.48,.29,.42,'#94988b');
  box(x,.67,z,.56,.09,.46,'#b6b9a6');
 }
}
function drawVillageSecondPass(g){
 const {box,cylinder,cone,sphere}=g;
 // A covered handcart with wooden wheels, crates and striped linen canopy.
 const x=31.3,z=28.9;
 box(x,.47,z,2.0,.16,1.05,'#936f4c');
 box(x,.62,z,1.85,.12,.95,'#ba9566');
 for(const wx of [x-.65,x+.65])for(const wz of [z-.59,z+.59]){
  cylinder(wx,.35,wz,.23,.23,.12,'#4b4941',10);
  cylinder(wx,.35,wz,.11,.11,.13,'#bba077',10);
 }
 for(const dx of [-.78,.78])for(const dz of [-.43,.43])box(x+dx,1.26,z+dz,.09,1.32,.09,'#75553b');
 box(x,2.00,z,2.25,.17,1.45,'#b65a4a');
 for(let i=0;i<6;i++)box(x-1+i*.40,2.105,z,.20,.018,1.38,'#eee0b7');
 for(const [dx,dz] of [[-.51,-.10],[.23,.22],[.51,-.18]]){
  box(x+dx,.83,z+dz,.43,.35,.34,'#95714c');
  box(x+dx,.99,z+dz,.47,.05,.38,'#ceb18a');
 }
 // Barrel cluster, small signboards, puddles and stone edging around the streets.
 for(const [bx,bz] of [[14.5,27.4],[35.8,35.5],[39.0,24.7]]){
  cylinder(bx,.33,bz,.27,.30,.64,'#846043',10);
  for(const y of [.14,.52])cylinder(bx,y,bz,.302,.302,.045,'#5a6464',10);
  box(bx+.44,.27,bz,.45,.54,.43,'#a48158');
  box(bx+.44,.55,bz,.50,.06,.47,'#c6a579');
 }
 for(const [px,pz] of [[16.3,30.4],[35.3,20.3],[40.5,34.5]]){
  box(px,.013,pz,.82,.015,.49,'#637b77');
  box(px+.1,.022,pz,.34,.005,.04,'#a8c7bb');
 }
 for(const [sx,sz] of [[19.3,34.6],[36.8,23.8],[25.0,16.6]]){
  box(sx,.17,sz,1.30,.31,.24,'#9e9b8c');
  box(sx,.33,sz,1.36,.05,.26,'#c2b8a4');
 }
 // Hanging strings of cloth pennants give market stalls stronger silhouettes.
 for(const [px,pz] of [[23.5,24.4],[32.7,24.4],[30.7,33.2]]){
  box(px,2.24,pz,.045,.045,2.6,'#756954');
  for(let i=0;i<5;i++)cone(px,2.12,pz-1.1+i*.54,.10,.21,i%2?'#ead9ad':'#b15d55',4);
 }
 // A painted emblem and a dated stone foundation beside the common well.
 box(27.3,.75,26.34,.58,.43,.045,'#a68962');
 box(27.3,.78,26.38,.40,.055,.028,'#e5d1a0');
 for(const dx of [-.17,.17])sphere(27.3+dx,.89,26.40,.045,'#5f6a66',7);
}

/* Small environmental storytelling details throughout playable areas.
   Cosmetic static meshes only: no changes to collision, triggers, quests or the finished intro. */
function drawEverydayDetails(g){
 const {box,cylinder,cone,sphere}=g;
 const hash=(x,z,n=0)=>{const v=Math.sin(x*71.3+z*149.7+n*39.1)*43758.5453;return v-Math.floor(v)};
 if(scene==='cell'){
  // Hairline mortar cracks and pale salt deposits on the rear wall.
  for(let i=0;i<20;i++){
   const x=1.65+(i*1.13)%21.3,y=.72+(i*7%11)*.13;
   box(x,y,15.045,.27,.022,.031,'#485953');
   box(x+.10,y-.11,15.05,.022,.23,.032,'#596965');
  }
  for(const [x,z] of [[2.6,13.7],[9.6,14.6],[15.8,13.8],[21.7,14.1]]){
   box(x,.018,z,.48,.022,.33,'#63776b');
   for(let i=0;i<3;i)sphere(x-.13+i*.13,.041,z+.09,.045,'#819287',6);
  }
  // Hinges and latch plates read as real hardware on the cell front.
  for(const x of [6.12,7.13,10.94,13.02,17.85,18.88]){
   box(x,1.55,5.34,.10,.36,.10,'#526369');
   for(const y of [1.43,1.69])sphere(x,y,5.41,.029,'#a0a49a',6);
  }
  // Small discarded pebbles in corners, kept below foot height.
  for(let i=0;i<15;i++){
   const x=1.5+(i*13%22),z=i%2?14.52:6.14;
   sphere(x,.075,z,.055+.02*(i%3),'#8a8b7d',7);
  }
 }else if(scene==='sewer'){
  const w=engine?.getWorld?.();
  if(!w)return;
  // Mineral streaks and tiny rust spots appear on existing solid-wall tiles only.
  for(let z=2;z<w.height-2;z+=3)for(let x=2;x<w.width-2;x+=3){
   if(w.tiles[z]?.[x]!=='H')continue;
   const nearWalk=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>w.tiles[z+dz]?.[x+dx]==='s');
   if(!nearWalk||hash(x,z)<.38)continue;
   const px=x+.50,pz=z+.50;
   box(px,1.05,pz+.48,.055,.62,.028,'#405953');
   box(px+.12,.61,pz+.48,.04,.28,.028,'#745e49');
   sphere(px-.14,.14,pz+.33,.085,'#75847a',7);
  }
  // Flush surface scum and floating debris: no new obstacles in the water.
  for(let z=2;z<w.height-2;z+=5)for(let x=2;x<w.width-2;x+=5){
   if(w.tiles[z]?.[x]!=='w')continue;
   box(x+.38,.049,z+.53,.22,.009,.07,'#66877e');
   box(x+.72,.050,z+.40,.12,.008,.035,'#94a79a');
  }
 }else if(scene==='forest'){
  const w=engine?.getWorld?.();
  if(!w)return;
  // Fallen leaves, seedpods and fern shoots only on natural ground.
  for(let i=0;i<100;i++){
   const x=2+(i*17%30),z=2+(i*23%18);
   if(w.tiles[z]?.[x]!=='.')continue;
   const px=x+.18+hash(x,z)*.61,pz=z+.20+hash(z,x)*.60;
   box(px,.028,pz,.12,.012,.060,['#9a855b','#b39a67','#806c4a','#6f8059'][i%4]);
   if(i%7===0){cone(px+.15,.12,pz-.10,.09,.22,'#537951',6);sphere(px+.15,.25,pz-.10,.04,'#7e9a69',6);}
  }
  // Small bracket fungi cling to tree-root edges rather than the road.
  for(let i=0;i<16;i++){
   const x=2+(i*11%31),z=2+(i*7%18);
   if(w.tiles[z]?.[x]!=='T')continue;
   sphere(x+.77,.16,z+.26,.105,'#c3ad82',7);
   sphere(x+.77,.19,z+.26,.073,'#eee1bc',7);
  }
 }else if(scene==='watchtower'){
  // Ink, folded records and wax seals on the guard's writing table.
  box(12.40,.87,9.86,.43,.018,.28,'#e7d2a5');
  box(12.54,.886,9.81,.15,.008,.025,'#78624c');
  sphere(12.48,.91,9.99,.043,'#9f4942',7);
  cylinder(12.04,.92,9.58,.075,.075,.12,'#494d4c',9);
  // Wall joint variation, small rivets and repaired floor seams.
  for(const z of [1.87,12.14])for(let i=0;i<13;i++){
   const x=2.2+i*1.03;
   box(x,1.05+(i%3)*.39,z,.38,.026,.034,'#95998f');
   box(x+.18,1.18+(i%3)*.39,z,.026,.18,.035,'#676d6a');
  }
  for(const [x,z] of [[3.2,10.8],[13.8,10.9],[3.1,3.5]]){
   box(x,.035,z,.39,.017,.26,'#77766b');
   sphere(x+.15,.064,z-.08,.055,'#aea38b',6);
  }
 }else if(scene==='village'){
  // Wear marks, loose cobbles, chalk traces and fallen leaves along paved square.
  for(let i=0;i<62;i++){
   const x=17+(i*13%22)+.25,z=19+(i*17%17)+.26;
   if((x>25&&x<29&&z>25&&z<29)||(x>29&&x<34&&z>27&&z<31))continue;
   const px=x+(hash(i,2)-.5)*.20,pz=z+(hash(i,7)-.5)*.20;
   box(px,.024,pz,.15,.009,.10,i%3===0?'#c6bea8':'#8d9488');
   if(i%5===0)box(px+.12,.035,pz-.11,.09,.008,.04,'#687b64');
  }
  // A few papers and rope loops at the edges of market stalls.
  for(const [x,z] of [[22.95,24.4],[32.12,24.4],[30.2,33.2]]){
   box(x,1.02,z,.31,.018,.24,'#e8d7ad');
   box(x+.08,1.037,z-.04,.15,.006,.025,'#816d51');
   cylinder(x-.38,.13,z+.78,.17,.17,.045,'#a79171',10);
  }
  // Window boxes and tiny shutters on existing perimeter buildings.
  for(const [x,z] of [[12.3,9.2],[20.4,11.5],[38.4,10.8]]){
   box(x,1.3,z,.62,.16,.25,'#815c43');
   box(x,1.40,z,.53,.06,.19,'#4e704a');
   for(let i=0;i<3;i)sphere(x-.19+i*.18,1.49,z,.07,'#d4a0a1',6);
  }
 }
}

function drawProps(g){
 const {box,cylinder,cone,sphere,piece,oliver,features,recliningKing,tri}=g;
 if(scene!=='intro'&&scene!=='cell')drawEverydayDetails(g);
 const drawOliver=(x,z)=>oliver?oliver(x,z):piece(x,z,'K','white',true);
 const dp=window.FallenKingDetailPlus,model=(id,x,y,z,w,h,d,rot=0)=>scene!=='cell'&&scene!=='sewer'&&!!dp?.draw?.(g,id,x,y,z,w,h,d,rot);
 const rock='#687076',iron='#253945',wood='#785943',ivory='#e7ddc8';
 const brass='#d6b46b',royal='#a3474f',azure='#517488',moss='#416c65';
 function wall(x,z,w=1,h=1.8){const dungeon=scene==='cell'||scene==='sewer'||scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene==='prison';if(dungeon&&model('wall',x,0,z,w,h,.86))return;box(x,h/2,z,w,h,.86,rock);box(x,h-.08,z,w,.15,.92,'#ada79a');box(x,h*.53,z,w,.08,.93,'#495960');}
 function rails(a,b,z){/* Genuine forged-iron bars, not Kenney's brown timber dungeon gates. */box((a+b)/2,1.98,z,b-a,.17,.19,'#303b40');box((a+b)/2,.14,z,b-a,.15,.19,'#27353a');for(let x=a+.20;x<b-.12;x+=.46){cylinder(x,.99,z,.052,.055,1.86,iron,10);sphere(x,1.95,z,.070,'#78878a',8);box(x,.20,z,.17,.10,.20,'#455257');}for(let x=a+.16;x<b;x+=1.85)box(x,1.03,z,.15,.11,.24,'#809195');}
 function bed(x,z){/* Narrow prison cot: low iron legs, a pale mattress, a pillow and faded blue blanket. */for(const dx of [-1.35,1.35])for(const dz of [-.63,.63])cylinder(x+dx,.20,z+dz,.065,.065,.39,'#46535a',8);box(x,.31,z,2.95,.10,1.48,'#566166');box(x,.42,z,2.83,.15,1.37,'#c4bea9');box(x-.94,.53,z,.70,.13,1.12,'#e2ddc9');box(x+.55,.52,z,1.54,.09,1.28,'#6d8294');box(x+.52,.58,z+.56,1.5,.06,.10,'#8e9da1');}
 function royalBed(x,z){
  // Low, open royal bed; no canopy, tall pillars or curtains hiding Oliver's face.
  if(!model('bed',x,0,z,3.85,.62,2.32))bed(x,z);
  box(x-1.84,.28,z,.17,.55,2.22,'#765142');
  box(x-1.81,.83,z,.13,.22,2.08,'#a67858');
  box(x-1.80,.93,z,.16,.035,1.93,'#d2b277');

   // The pillow is removed so Oliver's head remains visible.
  box(x+.66,.67,z,1.61,.10,1.76,'#824e6b'); // Blanket covers feet, NOT the king's face.
  box(x+.65,.77,z-.73,1.58,.03,.10,'#d9bb84');
  box(x+.65,.77,z+.73,1.58,.03,.10,'#d9bb84');
 }
 function toilet(x,z){if(dp?.toilet?.(g,x,z))return;box(x,.36,z-.3,.9,.7,.65,'#aeb4ae');cylinder(x,.57,z+.18,.5,.5,.22,ivory,12);cylinder(x,.7,z+.18,.35,.35,.06,'#becbca',12);cylinder(x,.73,z+.18,.21,.21,.06,'#416477',12);box(x,.87,z-.53,.77,.14,.15,ivory);box(x+.33,.77,z-.59,.10,.18,.12,'#ad9f78');}
 function torch(x,z){box(x,.84,z,.22,.36,.2,wood);cone(x,1.16,z,.15,.38,'#e5a94d',8);sphere(x,1.34,z,.12,'#ffe0a0',8);}
 function banner(x,z,c=royal){box(x,1.85,z,.65,1.48,.07,c);box(x,2.60,z,.77,.10,.13,brass);box(x,1.05,z,.70,.12,.13,brass);box(x,2.05,z+.06,.16,.18,.08,brass);}
 function tapestry(x,z){box(x,1.85,z,1.10,1.45,.09,'#784157');box(x,2.60,z,1.2,.10,.18,brass);for(let i=0;i<3;i++)box(x+(i-1)*.25,1.55,z+.065,.09,.58,.07,brass);}
 function pipe(x,z,length=3){cylinder(x,1.4,z,.24,.24,length,'#697e7a',10);cylinder(x,1.4,z,.28,.28,.12,'#b3a97e',10);}
 function arch(x,z){for(const dx of [-1.7,1.7]){box(x+dx,1.3,z,.37,2.6,.44,'#8a9991');box(x+dx,2.35,z,.49,.19,.52,'#a7ad9d');}box(x,2.68,z,3.8,.40,.5,'#6d7d7b');box(x,2.93,z,3.1,.12,.57,'#4a655f');}
 function king(x,z){drawOliver(x,z);}
 function edwin(x,z,wearingCrown=false){
  // Edwin is an unmistakable BLUE pawn; the stolen crown is a separate attachment.
  piece(x,z,'P','blue',false);
  box(x,.61,z+.31,.35,.40,.09,'#2f66a5');
  box(x+.13,.72,z+.36,.12,.16,.05,'#91c2ec');
  if(wearingCrown)dp?.crown?.(g,x,1.53,z,.82);
 }
 if(scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison'){
  const kind=steps[Math.min(chapter.step,steps.length-1)].scene;
  for(let x=0;x<18;x++){wall(x+.5,.5,1,2.9);wall(x+.5,11.5,1,1.2);if(x%3===0)box(x+.5,2.95,.62,.30,.25,1.3,'#c0ae87');}
  for(let z=1;z<11;z++){wall(.5,z+.5,1,2.4);wall(17.5,z+.5,1,2.4);}
  for(let x=2;x<18;x+=4)box(x,.05,6,.06,.10,9,'#beaa8a');
  if(kind!=='prison'){for(const x of [3,7,11,15]){box(x,1.25,.95,.88,2.5,.4,'#b5a48b');tapestry(x,1.19);}/* Oversized royal chamber pillars removed. */for(let z=2;z<11;z+=3)banner(17.04,z+.5,royal);}
  if(['bedroom','approach','theft','confrontation','arrest'].includes(kind)){
    // Inlaid burgundy carpet with gold borders instead of an enormous untextured brown rectangle.
    box(9,.025,5.4,10.2,.046,5.60,'#654452');
    for(const z of [2.75,8.05])box(9,.052,z,10.1,.012,.09,'#dfb875');
    for(const x of [4.1,13.9])box(x,.053,5.4,.085,.012,5.35,'#dfb875');
    for(let i=0;i<9;i++){const x=5.5+i*.88;box(x,.06,3.2,.30,.014,.11,'#b48667');box(x,.06,7.7,.30,.014,.11,'#b48667');}
    royalBed(9,5);
    box(3.8,1.0,3.2,1.4,2,.22,'#704751');box(3.8,1.03,3.36,1.2,1.6,.07,'#d4b26b');
    // The royal crown is kept on an obvious velvet-topped pedestal beside Oliver's bed.
    if(!model('table',13.8,0,5.1,1.70,1.03,1.33))box(13.8,.47,5.1,1.65,.94,1.25,wood);
    box(13.8,1.04,5.1,1.28,.14,.92,'#87364d');
    if(['bedroom','approach'].includes(kind))dp?.crown?.(g,13.8,1.14,5.1,1.0);
    for(const x of [3.3,15.7]){box(x,1.28,1.33,1.45,2.30,.18,'#6f3d55');box(x,2.52,1.42,1.62,.14,.22,'#c7a265');}
    for(const x of [5.3,12.7]){box(x,1.55,11.25,1.45,1.36,.12,'#496c88');box(x,1.54,11.1,.12,1.38,.18,'#c6aa72');}
    // A rear-wall bookcase reads clearly from the overhead camera.
    box(4.1,1.50,1.72,2.1,2.85,.46,'#635343');
    for(const y of [.53,1.15,1.77,2.39])box(4.1,y,2.0,2.0,.12,.52,'#ab8863');
    for(let i=0;i<15;i++){
     const x=3.27+(i%5)*.39,y=.68+Math.floor(i/5)*.62;
     box(x,y,1.97,.21,.42,.27,['#775d56','#5d7480','#a58c65','#755e79'][i%4]);
    }
    // The confusing striped block below-left of the bed was removed.
    box(9,.11,8.7,7.3,.15,2.1,'#9c6a56');box(9,.19,8.7,6.7,.05,1.7,'#b89975');
    for(const x of [2.5,16])torch(x,2.9);
    // The real chess-piece mesh is reclined on the pillow, not replaced by a different drawing.
    if(['bedroom','approach','theft'].includes(kind)){if(recliningKing)recliningKing(9,5);else drawOliver(8.0,5);}else drawOliver(8.9,7.0);
    box(9.6,.68,5,.72,.035,1.26,'#8e5470');
    if(kind==='approach')edwin(15.1,8.7);
    if(kind==='theft'){edwin(13.0,7.4);dp?.crown?.(g,12.55,1.65,7.0,.88);}
    if(kind==='confrontation')edwin(12.7,7.0,true);
    if(kind==='arrest'){edwin(13.7,7.0,true);for(const x of [6.5,11]){piece(x,8.8,'R','white',false);features(x,8.8,'R','white',false,'guard');}}
  }else if(kind==='throne'){
    box(9,.62,3.8,3.4,1.24,1.4,'#916b54');box(9,1.42,3.7,2,1.6,.47,'#a44b53');
    // Edwin wears the crown and royal disguise; Oliver remains unmistakably crownless.
    edwin(9,5.3,true);
    drawOliver(8.5,9);
    piece(5.2,7.5,'R','white',false);piece(12.8,7.5,'R','white',false);torch(3,3);torch(15,3);
    for(const x of [3.3,14.7]){tapestry(x,1.22);cylinder(x,.73,3.7,.42,.42,1.46,'#d2c2a0',12);}
  }else{
    for(let x=1;x<17;x++)wall(x+.5,2,1,1.8);
    // Dungeon establishing shot: real cell block and narrow corridor beyond the gate.
    for(const x of [4,8,12]){box(x,2.1,2.8,.88,2.8,.7,'#343f45');rails(x-.36,x+.36,3.25);}
    for(const x of [3,7,11,15]){box(x,2.7,1.4,.35,.28,5.2,'#4c5256');}
    rails(3,15,6);bed(5,8.5);toilet(12,8.5);king(9,8.9,true);torch(15,3);
  }
  return;
 }
 if(scene==='cell'||scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene==='prison'){
  // Single coherent cell block: corridor north, Mara's cell west, Tovin's cell east, Oliver in the middle.
  // Avoid a solid northern wall: the front of each cell is ironwork with visible corridor behind it.
  for(let x=0;x<25;x++){
   wall(x+.5,.5,1,2.65); // North exterior stone wall beyond the corridor.
   if(x>=11&&x<=13)wall(x+.5,15.48,1,.55); // A real opening: low stone sill, no tall wall hiding the window.
   else wall(x+.5,15.48,1,2.35); // Solid southern stone, never bars.
  }
  for(let z=1;z<15;z++){wall(.50,z+.5,1,2.4);wall(24.5,z+.5,1,2.4);}
  // Northern guard corridor: long unobstructed flagstone walkway with arch pilasters.
  for(const x of [2.5,7,12.5,18,23]){box(x,.01,3.3,.24,.18,3.2,'#657478');box(x,2.48,1.3,.42,.24,3.3,'#8b9691');}
  for(const x of [6.5,18.5]){box(x,0,5.3,.68,2.56,.72,'#8c9390');box(x,2.49,5.3,.81,.19,.81,'#b1b3a6');}
  // The cell fronts are entirely barred. The gate is centred at x=12, on the north boundary z=5.
  rails(1.2,6.15,5.18);
  rails(7.15,17.85,5.18);
  rails(18.85,23.8,5.18);
  for(const x of [10.95,13.0]){box(x,.27,5.22,.18,.53,.32,'#77878b');box(x,1.83,5.22,.20,.43,.26,'#77878b');}
  box(12.0,1.04,5.33,.22,.43,.18,'#b2a37f');sphere(12.0,1.34,5.45,.062,'#283e43',8);
  // Solid stone partitions left and right. One narrow barred peephole at eye level.
  for(const x of [6.5,18.5]){
   for(let z=5.8;z<13.8;z+=.90){
    if(z>9.0&&z<10.8){
     box(x,.53,z+.44,.80,1.06,.92,'#798282');
     box(x,2.05,z+.44,.80,.58,.92,'#87908c');
     for(const zz of [z+.23,z+.63])cylinder(x,1.28,zz,.055,.056,.90,'#3f5057',9);
     box(x,1.34,z+.44,.035,.46,.52,'#9aadb8');box(x,1.75,z+.44,.93,.07,.78,'#b6c1ba');for(const zz of [z+.25,z+.65])box(x,1.82,zz,.93,.075,.07,'#344951');
     box(x,1.05,z+.44,.90,.12,.95,'#b0b0a4');
     box(x,1.71,z+.44,.90,.12,.95,'#b0b0a4');
    }else{
     if(!model('wall',x,0,z+.43,.80,2.36,.89))box(x,1.18,z+.43,.82,2.36,.9,'#707b7e');
    }
   }
   box(x,2.35,9.7,.88,.20,8.3,'#89918b');
  }
  // Structural posts sit BEHIND the bars and mark the cell corners.
  for(const x of [6.5,18.5])for(const z of [5.3,13.55]){
   cylinder(x,.05,z,.21,.23,2.35,'#777f7f',11);
   cylinder(x,2.37,z,.28,.28,.16,'#a2a79b',11);
  }
  // Comfortable visual breathing room: each of the three cells has a distinguishable occupant or object.
  bed(9.4,7.0);toilet(16.4,10.5);
  cylinder(16.4,.025,10.5,.65,.65,.07,'#626e73',12);
  // Sleeping guard's cot belongs to the corridor, not Oliver's prison cell.
  box(12.2,.18,2.43,3.6,.18,1.14,'#536066');
  box(12.2,.35,2.43,3.32,.12,1.02,'#807c73');
  box(13.35,.48,2.45,.53,.13,.85,'#9b998d');
  if(scene==='intro'){
   // The guard is still AWAKE when Oliver is imprisoned.
   piece(12.1,2.38,'R','black',false);
  }else if(g.recliningPiece)g.recliningPiece(12.1,2.38,'R','black');else{
   piece(12.0,2.45,'R','black',false);
   features(12.0,2.45,'R','black',false,'guard');
  }
  box(11.1,.61,2.7,.34,.19,.43,'#48566d');
  // Mara and Tovin: recognisable chess-piece silhouettes, one in each neighbouring cell.
  piece(3.5,9.2,'P','white',false);features(3.5,9.2,'P','white',false,'scholar');
  box(3.5,.46,9.47,.53,.39,.13,'#697e91');
  piece(21.0,9.1,'P','black',false);features(21.0,9.1,'P','black',false,'scholar');
  box(21.0,.45,9.38,.56,.39,.14,'#746e75');
  box(2.45,.25,11.55,1.65,.35,.90,'#778089');box(20.7,.16,11.8,1.4,.28,.75,'#555e63');
  // A SMALL, unmistakeable window cut into the solid southern stone wall.
  // There are no wall-length iron bars across the bottom of Oliver's cell.
  for(let x=7;x<=17;x+=.96){
   if(Math.abs(x-12.5)<1.20)continue;
   if(!model('wall',x,0,14.38,.97,2.25,.68))box(x,1.1,14.38,.97,2.2,.68,'#818a8c');
  }
  // Stone jambs and a brighter blue inset make it immediately recognisable as a window, not a third door.
  box(12.5,.59,13.79,2.10,.06,.37,'#b4aea0');
  // Dark recess with a blue sky, distant castle towers and one bright moon.
  box(12.5,1.27,14.35,1.90,.92,.12,'#1c3041');box(12.5,2.09,14.20,2.15,.13,.48,'#a6aba2');
  box(12.5,1.11,14.25,1.80,.25,.04,'#345367');
  sphere(12.98,1.56,14.20,.15,'#e7dfc3',12);
  for(const x of [11.85,12.38])box(x,1.13,14.20,.27,.38,.05,'#2a414b');
  // Heavy dressed-stone lintel, jambs and deep sill make the opening readable from above.
  for(const x of [11.49,13.51])box(x,1.27,14.25,.23,1.21,.48,'#a7aca4');
  box(12.5,1.95,14.23,2.30,.23,.52,'#b4b6a9');
  box(12.5,.63,14.16,2.22,.18,.62,'#b3b0a0');
  box(12.5,.70,13.94,1.73,.055,.31,'#d5c5aa');
  // Cool moonlight pool on the floor, carefully flat and separate from the warm candle.
  for(const [x,z] of [[12.4,12.6],[12.9,12.1],[11.8,12.9]])box(x,.021,z,.44,.012,.69,'#7c9c9f');
  if(scene==='intro'){drawOliver(12.5,9.4);for(const x of [11.4,13.9]){piece(x,7.0,'R','white',false);features(x,7.0,'R','white',false,'guard');}}
  // One readable torch and a small iron pail; never wooden crates or random gate props.
  box(15.3,.85,6.0,.25,.17,.22,'#68767a');torch(15.3,6.0);
  // Remove the previously unreadable circular prop from the lower-left corner.
 }else if(scene==='sewer'){
  const world=engine.getWorld(),wet='#536a6c',ironDark='#42555b';
  // Walls are only modelled along the actual winding walkways; dead ends are visibly solid stone.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]!=='H')continue;
   const around=[[x-1,z],[x+1,z],[x,z-1],[x,z+1]];
   if(!around.some(([xx,zz])=>world.tiles[zz]?.[xx]==='s'))continue;
   if((x+z)%4===0)model('wall',x+.5,0,z+.5,.98,2.1,.98);
   else{box(x+.5,.82,z+.5,.99,1.64,.98,(x+z)%4===0?'#4c6061':'#536467');box(x+.5,1.72,z+.5,1.02,.12,1.02,'#818c87');}
   if((x*7+z*5)%13===0){box(x+.5,.13,z+.5,.48,.14,.3,'#577b70');model('stones',x+.5,.01,z+.5,.49,.28,.44);}
   // Damp runs down individual stone joints instead of noisy random block decorations.
   if((x*13+z*17)%23===0){box(x+.28,1.19,z+.02,.075,1.22,.06,'#38534f');box(x+.26,.47,z+.04,.15,.30,.07,'#4c6c61');}
  }
  // Drain rims help distinguish real water tiles from walkable stone.
  for(let z=2;z<world.height-2;z++)for(let x=2;x<world.width-2;x++){
   if(world.tiles[z][x]!=='w')continue;
   if(world.tiles[z][x-1]==='s'||world.tiles[z][x+1]==='s')
    box(x+.5,.03,z+.5,.18,.065,.92,'#7b8780');
  }
  // The foul outlet pipe at the western spawn: a recognisable circular bore and iron rim.
  const pipeX=3.55,pipeY=.95,pipeZ=25.5;
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
   const vertex=(r,t)=>[pipeX,pipeY+Math.sin(t)*r,pipeZ+Math.cos(t)*r];
   if(tri){
    tri(vertex(.61,a),vertex(.61,b),vertex(.43,b),'#8b9184');
    tri(vertex(.61,a),vertex(.43,b),vertex(.43,a),'#8b9184');
    tri(vertex(.42,a),vertex(.42,b),[pipeX-.05,pipeY,pipeZ],'#172d34');
   }
  }
  for(const x of [3.55,4.0])cylinder(x,.06,25.5,.54,.54,.08,'#6c7978',14);
  // Dirt, sediment and DetailPlus rubble in little wall recesses, away from the walkable strip.
  for(const [x,z] of [[9,22],[19,7],[27,13],[35,35],[52,10],[67,28],[42,43],[24,35]]){
   model('stones',x,.01,z,.75,.23,.62);
   box(x,.01,z+.25,.52,.012,.18,'#344e43');
  }
  // Thin drainage pipes with collars, rusty runs and visibly cracked, dirty walls.
  for(let z=2;z<world.height-2;z++)for(let x=2;x<world.width-2;x++){
   if(world.tiles[z][x]!=='H'||![[x-1,z],[x+1,z],[x,z-1],[x,z+1]].some(([a,b])=>world.tiles[b]?.[a]==='s'))continue;
   if((x*7+z*11)%9===0){
    const front=world.tiles[z+1]?.[x]==='s';
    box(x+.5,.95,z+(front?.96:.5),.075,1.60,.045,'#334a46');
    box(x+.58,.47,z+(front?.99:.5),.10,.54,.052,'#263d37');
    for(let n=0;n<3;n++)box(x+.23+n*.25,.21,z+(front?.99:.5),.20,.065,.05,'#465d4d');
   }
   if((x*5+z*3)%11===0){
    const front=world.tiles[z+1]?.[x]==='s';
    const zz=z+(front?1.035:.5);
    box(x+.26,.73,zz,.035,.78,.04,'#2e4545');
    box(x+.39,.49,zz,.28,.035,.04,'#283b3d');
    box(x+.53,.29,zz,.035,.38,.04,'#2e4545');
   }
   if((x*11+z*19)%16===0){
    box(x+.5,1.40,z+.5,.68,.24,.08,'#374f4e');
    box(x+.5,.92,z+.5,.46,.18,.082,'#405b50');
   }
  }
  for(const [px,pz] of [[10,25],[18,15],[33,29],[49,20],[64,23],[72,25]]){
   // Slim floor pipes run along passage edges, leaving the walkway open.
   box(px+.5,.075,pz+.91,1.6,.09,.11,'#71817c');
   for(const dx of [-.5,.25])box(px+dx,.085,pz+.91,.12,.14,.16,'#a18e70');
  }
  for(const [x,z] of [[13,27],[23,8],[37,39],[54,16],[70,27]]){
   model('barrel',x,.01,z,.44,.59,.44);
   box(x+.17,.02,z-.20,.33,.025,.47,'#526559');
  }
  // No large gold wheels and no lamps in this dark sewer.
  // The long-lost sewer creature has a distinct silhouette, luminous eyes and a ring of tendrils.
  model('stones',49.4,.15,38.4,1.50,1.38,1.29);model('stones',49.38,1.13,38.4,1.02,.82,.93);
  for(const x of [49.12,49.70]){sphere(x,1.43,38.84,.13,'#e6c178',10);sphere(x,1.44,38.96,.045,'#26353e',8);}
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;cone(49.4+Math.cos(a)*.64,.24,38.4+Math.sin(a)*.64,.14,.63,'#4f7771',7);}
  for(const [x,z] of [[48.7,37.9],[50.2,38.1]])model('stones',x,0,z,.48,.28,.38);
   for(const [x,z,s] of [[23.4,31.5,.43],[23.08,31.34,.28],[23.74,31.44,.30]])sphere(x,.60,z,s,'#526b61',11);
   for(const x of [23.24,23.58])sphere(x,1,31.9,.10,'#e7b675',9);
   for(let i=0;i<5;i++)cone(23.4+(i-2)*.19,.86,31.15,.13,.48,'#41584d',7);
   for(const [x,z,w] of [[40.3,45.3,1.25],[41,45.7,.95],[39.7,45.9,.80]]){model('stones',x,.02,z,w,.56,w*.86);box(x,.20,z+.25,w*.7,.13,w*.35,'#675c4a');}model('barrel',40.8,.04,45.9,.47,.42,.43);
  // The end of the sewer has a real iron LADDER to an overhead hatch: no arch or altar.
  box(76.5,2.97,25.5,2.00,.17,1.26,'#8a9695');
  box(76.5,2.76,25.5,1.52,.12,.92,'#1a3034');
  for(const x of [76.05,76.95])cylinder(x,.15,25.4,.069,.069,2.72,'#657e83',10);
  for(let y=.35;y<=2.75;y+=.30){
   box(76.5,y,25.48,.99,.064,.12,'#b0a68d');
   box(76.5,y+.045,25.48,.88,.025,.11,'#d2c5a6');
  }
  box(76.5,.08,25.5,2.15,.15,1.50,'#637373');
  for(const x of [69,73])model('stones',x,0,27.75,.55,.31,.58);
 }else if(scene==='watchtower'){drawWatchtowerInterior(g);return;}
 if(scene==='forest'){
  const world=engine.getWorld();
  // A forest road with substantial canopies and mossy stones, not random blocks in walkable areas.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]==='T'){
    if(g.tree&&((x<=2||x>=33||z<=1||z>=20)?(x+z)%2===0:(x+z)%3===0))g.tree(x+.5,z+.5);
    if((x*3+z*5)%19===0)model('stones',x+.5,.01,z+.5,.64,.27,.55);
   }
  }
  // The torches are stationed on grass OUTSIDE the walking path.
  for(const [x,z] of [[5.5,13.2],[10.5,9.8],[19.4,14.8],[29.3,11.0]]){
   cylinder(x,.05,z,.11,.13,.69,'#665e48',9);
   cone(x,.79,z,.20,.29,'#ddae66',9);sphere(x,.97,z,.095,'#f5d18f',8);
  }
  drawForestMicroDetails(g,world);
  // Scattered woodland groundcover and small ruins in the enlarged north clearing.
  for(let i=0;i<55;i++){
   const x=3+((i*19)%29)+.32,z=2+((i*13)%18)+.3;
   const tile=world.tiles[Math.floor(z)]?.[Math.floor(x)];
   if(tile==='.'&&!(x>24&&x<31&&z<9))drawWildflowers(g,x,z,i);
  }
  for(const [x,z] of [[7.0,14.6],[16.4,3.5],[22.5,17.1],[30.0,17.2]]){
   box(x,.10,z,.72,.18,.62,'#777e72');
   box(x+.19,.24,z-.12,.40,.13,.31,'#9ba095');
   for(let i=0;i<3;i++)cone(x-.20+i*.22,.24,z+.27,.11,.32,'#587558',7);
  }
  // A readable direction sign, oriented toward the overhead camera.
  box(9.5,.78,13.5,.18,1.55,.18,'#644a34');
  box(9.5,1.34,13.5,2.15,.57,.17,'#ad8b62');
  box(9.5,1.35,13.60,1.96,.40,.04,'#dcc69c');
  for(const dx of [-.75,-.40,-.05,.30])box(9.5+dx,1.37,13.64,.24,.06,.027,'#664b3a');
  cone(10.27,1.37,13.65,.18,.20,'#795c43',4);
  drawWaypost(g,9.5,12.9);
  drawWaypost(g,30.2,12.9,'#d8c3a1');
  // Watchtower forecourt: paving, flags, lanterns and stored supplies.
  for(const x of [26.5,27.5,28.5])for(const z of [8.5,9.5])
   box(x,.035,z,.90,.055,.92,(x+z)%2?'#a29c8f':'#bbb3a2');
  for(const x of [24.6,30.5]){
   cylinder(x,.72,8.4,.11,.12,1.42,'#725b45',9);
   box(x,1.50,8.4,.32,.45,.30,'#5e6565');
   sphere(x,1.51,8.4,.14,'#f1c987',9);
   cone(x,1.82,8.4,.25,.27,'#424e56',8);
  }
  for(const x of [24.1,30.6])for(let i=0;i<2;i++)model('barrel',x,0,9.9+i*.68,.49,.57,.48);
  for(const x of [26.2,28.8]){
   cylinder(x,5.12,8.44,.052,.052,1.10,'#5b5e59',8);
   box(x+.24,5.41,8.43,.47,.44,.04,'#9b4547');
   box(x+.22,5.35,8.47,.40,.07,.026,'#dcc59d');
  }
  model('barrel',12.4,0,8.35,.52,.61,.52);
  model('stones',21.5,0,11.0,.84,.31,.71);
  // North watchtower: same 5x5 footprint, but a tall fortified silhouette.
  // Solid opaque walls, a crenellated parapet, narrow arrow slits and a real door.
  const towerX=27.5,towerZ=5.5;
  box(towerX,.09,towerZ,5.55,.18,5.55,'#77756f');
  for(const [x,z,w,d] of [[towerX,3.1,5.3,.42],[towerX,7.9,5.3,.42],[25.1,towerZ,.42,5.3],[29.9,towerZ,.42,5.3]]){
   // The south wall has an actual doorway rather than an open facade.
   if(z===7.9){
    box(26.0,2.45,z,2.20,4.9,d,'#787e80');
    box(29.0,2.45,z,2.20,4.9,d,'#787e80');
    box(towerX,4.30,z,1.15,1.30,d,'#787e80');
   }else box(x,2.45,z,w,4.9,d,'#787e80');
  }
  // Heavy stone courses and dressed corner quoins.
  for(let h=.65;h<4.9;h+=.68){
   for(const z of [3.12,7.88])for(const x of [25.75,26.85,28.15,29.25])
    box(x,h,z,.95,.075,.045,'#a3a6a0');
   for(const x of [25.12,29.88])for(const z of [3.9,5.2,6.5,7.3])
    box(x,h,z,.045,.075,.78,'#a3a6a0');
  }
  for(const x of [25.2,29.8])for(const z of [3.2,7.8])
   box(x,2.5,z,.54,5.0,.54,'#969994');
  // Dark arrow slits give the tall facade a recognisable guard-tower appearance.
  for(const x of [26.25,28.75]){
   box(x,3.15,8.14,.12,.85,.035,'#202a30');
   box(x,3.0,8.16,.38,.10,.04,'#202a30');
  }
  box(towerX,1.15,8.15,1.28,2.30,.16,'#654937');
  for(const x of [27.05,27.40,27.75,28.05])box(x,1.16,8.24,.045,2.18,.03,'#967554');
  box(27.91,1.06,8.29,.09,.11,.06,'#e4c17b');
  box(towerX,4.99,towerZ,5.65,.23,5.65,'#555d61');
  box(towerX,5.25,towerZ,5.9,.36,5.9,'#8f9490');
  // Battlements, raised corner turrets and a dark peaked watch roof.
  for(const x of [25.15,26.3,27.5,28.7,29.85])for(const z of [2.65,8.35])
   box(x,5.72,z,.60,.92,.52,'#9da19c');
  for(const z of [3.8,5.5,7.2])for(const x of [24.65,30.35])
   box(x,5.72,z,.52,.92,.66,'#9da19c');
  for(const x of [25.15,29.85])for(const z of [3.15,7.85]){
   cylinder(x,5.70,z,.39,.39,1.45,'#737d80',10);
   cone(x,6.75,z,.55,.82,'#454f58',10);
  }
  box(towerX,5.38,towerZ,3.85,.25,3.85,'#4a555d');
  cone(towerX,6.43,towerZ,2.6,1.80,'#47515a',4);
  // Red-and-white striped hinged road barrier, four tiles across.
  for(const z of [7.0,11.15]){
   box(32.45,1.05,z,.43,2.1,.44,'#a6a9a6');
   box(32.45,1.98,z,.55,.20,.56,'#e5e5de');
   sphere(32.45,2.16,z,.14,'#d14b42',10);
  }
  if(!complete('watchChest')){
   for(let i=0;i<8;i++)box(32.45,1.45,7.25+i*.5,.34,.36,.50,i%2===0?'#d53935':'#f7f3e9');
   box(32.45,1.45,9.0,.48,.13,3.95,'#424b50');
  }else{
   // Raised barrier after solving the chest; road is visually unobstructed.
   for(let i=0;i<8;i++)box(32.45,2.45+i*.42,7.15,.34,.42,.40,i%2===0?'#d53935':'#f7f3e9');
  }
  // Oliver's crowned statue is intentionally not instantiated here.
  // Its reusable mesh is retained in drawCrownedOliverForFuture().

 }
}
// Retained for future scenes only: approved Oliver mesh plus his gold crown.
// Do not call this function from the forest: all eleven displays were removed.
function drawCrownedOliverForFuture(g,x,z){
 const {oliver,cylinder,cone}=g;
 if(!oliver)return;
 oliver(x,z);
 cylinder(x,2.08,z,.305,.305,.12,'#c6a05c',14);
 for(let i=0;i<7;i++){
  const angle=i*Math.PI*2/7;
  cone(x+Math.cos(angle)*.27,2.15,z+Math.sin(angle)*.27,.085,.23,'#e4c475',8);
 }
}
// The interior is drawn only after an E interaction at the tower door.
function drawWatchtowerInterior(g){
 const {box,cylinder,sphere}=g;
 const stone='#777b7b',trim='#ada89b';
 for(let x=1;x<16;x++){box(x+.5,1.65,1.5,1,3.3,.7,stone);box(x+.5,1.65,12.5,1,3.3,.7,stone);}
 for(let z=1;z<=12;z++){box(1.5,1.65,z+.5,.7,3.3,1,stone);box(15.5,1.65,z+.5,.7,3.3,1,stone);}
 box(8.5,.06,6.5,12.8,.12,9.8,'#807e75');
 for(let x=3;x<14;x+=3){box(x+.5,.025,6.5,.06,.04,9.4,trim);}
 box(8.5,2.95,2.4,11.7,.15,.2,trim);
 box(8.5,.62,4.5,2.5,1.2,1.6,'#71533d');
 box(8.5,1.28,4.5,2.65,.13,1.7,'#c5a36b');
 box(8.5,1.01,5.38,.38,.20,.12,'#d9b978');
 for(const x of [3.7,13.2]){box(x,.56,6.0,1.4,1.12,2.2,'#604b39');box(x,1.15,6,1.5,.12,2.3,'#9b805c');}
 for(const x of [4,13]){cylinder(x,.08,9.4,.14,.14,1.8,'#635344',10);sphere(x,1.94,9.4,.17,'#e8b971',10);}
 box(8.5,1.25,12.19,1.3,2.5,.14,'#644b36');
 box(8.9,1.1,12.29,.08,.08,.06,'#e1c17d');
 // Banners, timber roof beams and a small guard's writing desk.
 for(const x of [4.1,8.5,12.9]){
  box(x,3.21,6.5,.22,.30,9.45,'#6a5b49');
  box(x,3.30,6.5,.12,.10,9.5,'#b09367');
 }
 for(const x of [2.15,14.85]){
  box(x,2.28,4.1,.08,1.10,.65,'#8d4248');
  box(x,1.82,4.1,.095,.12,.65,'#c9ae7b');
 }
 box(12.6,.72,9.8,1.65,.12,.84,'#9d7955');
 for(const x of [12.02,13.18])box(x,.38,9.8,.14,.68,.65,'#66513d');
 box(12.46,.83,9.66,.48,.06,.35,'#e7d6ac');
 cylinder(12.93,.87,9.51,.08,.08,.12,'#ae8962',9);
  // Worked stone, rug, wall lamps and orderly storage make the interior feel inhabited.
 box(8.5,.125,8.3,3.1,.025,2.3,'#6c4b44');
 box(8.5,.14,8.3,2.75,.01,1.95,'#af8867');
 for(const x of [2.7,14.2]){box(x,1.77,8.8,.12,.56,.30,'#63513f');sphere(x,2.12,8.8,.14,'#f0bf79',9);}
 for(const x of [3,13.7]){box(x,.35,3.0,1.2,.70,.68,'#625345');box(x,.75,3,1.28,.08,.76,'#aa8b65');}
 for(let i=0;i<5;i++){box(3.2+i*.47,.12,10.7,.35,.24,.27,'#907a58');box(3.2+i*.47,.27,10.7,.32,.05,.28,'#c4a67e');}
 for(let i=0;i<8;i++)box(2.0+i*1.75,2.45,1.87,.035,.035,.12,'#b9b8a7');
}
function drawVillageProps(g){
 if(scene!=='village')return;
 const {box,cylinder,cone,sphere}=g,done=complete('bridge');
 window.FallenKingDetailPlus?.draw?.(g,'barrel',41.3,0,17.7,.65,.68,.65);
 window.FallenKingDetailPlus?.draw?.(g,'chest',41.8,0,21.4,.92,.58,.68);
 // DetailPlus: an inhabited medieval market square, with readable stalls, barrels and civic stonework.
 drawVillageDetails(g);
 drawVillageSecondPass(g);
 const mdl=(id,x,y,z,w,h,d)=>window.FallenKingDetailPlus?.draw?.(g,id,x,y,z,w,h,d);
 for(const [x,z,canopy] of [[23.5,24.4,'#9e4e53'],[32.7,24.4,'#4b7882'],[30.7,33.2,'#bc9363']]){
  for(const ox of [-.80,.80])for(const oz of [-.55,.55])cylinder(x+ox,.06,z+oz,.065,.07,1.44,'#80644d',8);
  box(x,.89,z,2.05,.13,1.60,'#947155');
  box(x,1.62,z,2.25,.16,1.87,canopy);
  for(const ox of [-.83,-.4,.03,.46,.83])box(x+ox,1.53,z,.24,.10,1.8,ox<0?'#d9c494':'#e2d0a8');
  mdl('barrel',x-1.23,0,z,.55,.58,.55);
  mdl('chest',x+.55,.96,z,.49,.38,.46);
 }
 // Cobblestone well, benches and warm light in the village's public square.
 cylinder(27.3,.1,27.1,.86,.85,.30,'#777f76',12);
 cylinder(27.3,.38,27.1,.73,.73,.24,'#c4b8a0',12);
 cylinder(27.3,.62,27.1,.58,.58,.08,'#405963',12);
 for(const x of [26.4,28.2]){box(x,.67,27.1,.14,1.32,.14,'#856b4a');cone(x,1.43,27.1,.23,.20,'#c3a377',8);}
 box(27.3,1.52,27.1,2.25,.15,.2,'#9b7951');
 for(const [x,z] of [[21.2,29.8],[33.8,28.8],[29.2,20.7]]){cylinder(x,.08,z,.14,.14,.87,'#74624f',8);cone(x,1.02,z,.18,.31,'#e3b75c',9);sphere(x,1.27,z,.11,'#ffdf9e',9);}
 for(const [x,z] of [[24.2,30.2],[31.2,29.8],[27.2,22.7]])mdl('stones',x,.02,z,.68,.33,.60);
 
 // Detailed riverside and bridgework: carved posts, reeds, stones and construction supplies.
 const rocks=[[42,17],[43,22],[44,16],[49,17],[49,22]];
 for(const [x,z] of rocks){box(x+.5,.12,z+.5,.49,.24,.45,'#828980');box(x+.64,.27,z+.55,.27,.06,.24,'#afb3a5');for(let i=0;i<3;i++)cone(x+.2+i*.2,.28,z+.9,.075,.46+i*.07,'#547d57',6);}
 for(const x of [43,49])for(const z of [17.3,21.6]){box(x,.37,z,.57,.74,.48,'#aaa997');box(x,.80,z,.67,.13,.54,'#d0c8ab');box(x,1.06,z,.11,.41,.15,'#6e857d');}
 for(let x=40;x<=44;x++)for(let z=17;z<=22;z++)if((x+z)%3===0){box(x+.5,.055,z+.5,.63,.11,.55,'#aea189');box(x+.5,.118,z+.5,.41,.024,.27,'#d0bea0');}
 for(const [x,z] of [[41.7,18.2],[41.9,20.1]]){box(x,.13,z,1.3,.25,.32,'#916c4b');box(x,.35,z,1.3,.14,.32,'#bc9267');}
 for(const [x,z] of [[40.8,17.3],[41.3,17.7]]){cylinder(x,.26,z,.28,.27,.53,'#8f8160',9);cylinder(x,.57,z,.31,.31,.08,'#b8a07a',9);}
 for(const x of [42.5,49.3]){cylinder(x,.47,18,.17,.18,.94,'#705642',9);cone(x,.98,18,.20,.38,'#edb55c',8);sphere(x,1.21,18,.12,'#ffe2a5',8);}
  // Wooden bridge across the eastern stream; timber and rope appear only after the repairs.
 for(const x of [44.5,48.5])for(const z of [18.7,20.3]){
  cylinder(x,.28,z,.20,.22,.55,'#695442',10);
  cone(x,.66,z,.18,.20,'#d0b47f',8);
 }
 for(const z of [18.1,20.8])for(let x=43;x<=49;x+=2){
  box(x,.10,z,1.1,.20,.24,'#83745b');
  box(x,.22,z,.86,.08,.29,'#bba27a');
 }
 // Fasteners and rope brackets are visible even before bridge repair.
 for(const z of [18.05,20.95])for(const x of [43.6,44,48.7,49.1]){box(x,.23,z,.21,.46,.21,'#75593e');box(x,.51,z,.25,.12,.25,'#ae8b62');}
  if(done){
  for(let x=44.2;x<=48.8;x+=.5)for(const z of [18.4,20.6]){box(x,.35,z,.10,.08,.15,'#5b544c');box(x,.42,z,.055,.03,.07,'#dbc18a');}
  for(let x=44;x<=48;x+=.48){
   box(x+.3,.21,19.5,.38,.24,2.2,x%1<.45?'#b38c61':'#c19b70');box(x+.3,.354,19.5,.07,.022,1.96,'#e1c28e');
  }
  for(const z of [18.3,20.7]){
   box(46.3,.49,z,4.9,.12,.17,'#b8a078');
   for(const x of [44.1,45.2,46.3,47.4,48.5])cylinder(x,.47,z,.08,.08,.76,'#6f523b',8);
  }
 }else{
  for(const x of [45.5,46.3,47]){box(x,.07,19.3+(x%2)*.5,.32,.12,.73,'#745f4e');box(x,.14,19.3+(x%2)*.5,.16,.07,.41,'#9c7f65');}
  for(const x of [44.5,48.2]){box(x,.5,18.2,.06,.75,.10,'#bcab83');box(x,.5,20.8,.06,.75,.10,'#bcab83');}
  // Two ends of a collapsed bridge, with snapped boards projecting over the water.
  for(const x of [43.9,44.4,48.25,48.8]){const z=19.5;
   box(x,.20,z,.51,.24,1.95,'#8f6947');
   box(x,.35,z+.55,.28,.08,.15,'#c8a274');
  }
  for(const x of [45.1,47.4]){box(x,.02,19.8,.48,.10,.90,'#665341');box(x,.12,19.8,.15,.20,.24,'#493d34');}
 }
}
function drawEffects(g,t){
 if(scene==='intro'||scene==='cell'){
  const {sphere,cone}=g;
  // Torchlight flickers and dust drifts through the prison and royal chambers.
  const kind=scene==='intro'?steps[Math.min(chapter.step,steps.length-1)].scene:'cell';
  const palace=kind!=='prison'&&kind!=='cell',lights=palace?[[2.5,2.9],[16,2.9]]:[[15.3,6.0]];
  if(palace)lights.push([1.7,2.3],[1.7,7.4]);
   for(const [x,z] of lights){const wobble=Math.sin(t*9+x)*.047,glow=.11+Math.sin(t*4+x)*.025;
   const y=x===1.7?2.30:1.35;sphere(x,y+wobble,z,glow,'#f5d5a2',7);cone(x,y-.26+wobble,z,.10,.19,'#e7ad5b',7);
  }
  if(scene==='cell'){
   // Three clear, floating Z glyphs above the sleeping rook; no UI image overlay.
   const {tri}=g;
   if(tri)for(let i=0;i<3;i++){
    const x=11.7+i*.49,y=1.88+i*.24+.07*Math.sin(t*2+i),z=2.83;
    const p=(dx,dy)=>[x+dx,y+dy,z],color=i===2?'#d8e0d2':'#b4c8c9';
    function stroke(ax,ay,bx,by){
     const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,nx=-dy/len*.042,ny=dx/len*.042;
     tri(p(ax+nx,ay+ny),p(bx+nx,by+ny),p(bx-nx,by-ny),color);
     tri(p(ax+nx,ay+ny),p(bx-nx,by-ny),p(ax-nx,ay-ny),color);
    }
    stroke(0,.22,.23,.22);stroke(.23,.22,0,0);stroke(0,0,.23,0);
   }
  }
  const bound=scene==='cell'?13:16;
  for(let i=0;i<9;i++){const x=2+((i*2.17+t*.11)%bound),z=3+((i*1.43)%6),y=.5+((i*.49+t*.09)%1.7);
   sphere(x,y,z,.018+(i%3)*.007,palace?'#f2deb4':'#889a9d',5);
  }
  return;
 }
 // Fixed-position sine waves: smooth periodic motion without spawning, teleporting or vanishing glints.
 const {box,sphere,tri}=g;
 const flow=(x,z,offset=0)=>Math.sin(x*.92-z*.43-t*1.25+offset);
 if(scene==='village'){
  for(let x=45.15;x<47.85;x+=.38)for(const z of [17.25,19.5,21.8]){
   const w=flow(x,z),h=.05+.014*w;
   box(x,h,z,.29,.012,.045,'#8fbfbd');
  }
  for(const x of [42.5,49.3])sphere(x,1.30+Math.sin(t*7+x)*.025,18,.15,'#efd19a',7);
  return;
 }
 if(scene==='forest'){
  // A handful of drifting butterfly silhouettes with smooth, looping wing motion.
  for(let i=0;i<1;i++){
   const x=12+.27*Math.sin(t*.55+i),z=13.5+Math.sin(i*1.7)*2.2;
   const y=.65+.13*Math.sin(t*1.4+i);
   const wings=.11+.035*Math.sin(t*9+i);
   sphere(x-wings,y,z,.075,i%2?'#d9b8d8':'#f2d389',6);
   sphere(x+wings,y,z,.075,i%2?'#d9b8d8':'#f2d389',6);
   box(x,y,z,.022,.14,.035,'#585b46');
  }
  // Stationary fireflies brighten and dim smoothly along the woodland path.
  for(let i=0;i<12;i++){
   const x=4+i*2.47,z=7.4+Math.sin(i*1.88)*2.4;
   const y=.86+.22*Math.sin(t*1.65+i*.87);
   sphere(x,y,z,.036+.014*(.5+.5*Math.sin(t*2+i)),'#d6c78e',7);
  }
  return;
 }
 if(scene!=='sewer')return;
 // One continuous centre-line stream following all bends of sewerRoute.
 const world=engine.getWorld(),stream=world.streamTiles;
 if(!stream)return;
 for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
  const direction=stream[z*world.width+x];if(!direction)continue;
  const vertical=direction>=3;
  for(const shift of [.24,.55,.83]){
   const phase=Math.sin((vertical?z:x)*.74-t*1.7+shift*5.7);
   const y=.052+.011*phase,edge=.12+.10*(.5+.5*phase);
   const px=x+.5,pz=z+.5;
   const a=vertical?[px-edge,y,pz+shift-.5]:[px+shift-.5,y,pz-edge];
   const b=vertical?[px+edge,y,pz+shift-.5]:[px+shift-.5,y,pz+edge];
   const c=[b[0],y+.005,b[2]+(vertical?.025:0)];
   if(tri)tri(a,b,c,'#719a9b');
   else box(px,y,pz,vertical?edge*2:.02,.008,vertical?.02:edge*2,'#719a9b');
  }
 }

}
function drawFollowers(g){/* Pip is reserved for the second village, not Willowmere. */}
// Snapshot is captured on explicit Save, not every movement step.
function exportSave(){
 if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};
 chapter.scene=scene;
 return {chapter:JSON.parse(JSON.stringify(chapter))};
}
window.FallenKingStory={exportSave,start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,hasMap,drawGround,backdrop,fieldOfView,drawProps,drawVillageProps,drawEffects,drawFollowers,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();