(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2'; // Preserve existing chapter saves.
const steps=[
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'In Aldemar, King Oliver slept in his royal bedchamber. His gold-and-ruby crown rested on a red-velvet cushion beside the bed.'},
 {scene:'bedroom',title:'THE ROYAL BEDCHAMBER',speaker:'Narrator',text:'The candles burned low. Outside the tall windows, the castle guards patrolled while Oliver slept.'},
 {scene:'approach',title:'EDWIN THE PAWN',speaker:'Narrator',text:'Edwin was a blue pawn at court. Tired of always obeying orders, he secretly dreamed of wearing the crown himself.'},
 {scene:'approach',title:'EDWIN THE PAWN',speaker:'Edwin',text:'They treat me as nothing but a pawn. Tonight I will change everything.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Narrator',text:'Still crownless, Edwin crept to the royal bed and stole Oliver’s crown from its cushion.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Edwin',text:'The king is asleep. Nobody will know what happened.'},
 {scene:'confrontation',title:'THE FALSE KING',speaker:'Narrator',text:'Oliver woke to find Edwin standing in his bedchamber, the stolen crown now on the pawn’s head.'},
 {scene:'confrontation',title:'THE FALSE KING',speaker:'Edwin',text:'Guards! To the bedchamber! Seize this impostor. I am the true king of Aldemar!'},
 {scene:'arrest',title:'THE KING BETRAYED',speaker:'Narrator',text:'Two rook guards stormed the royal chamber. They believed the crown rather than their real king.'},
 {scene:'arrest',title:'THE KING BETRAYED',speaker:'Oliver',text:'That is Edwin, a pawn! He stole my crown! Please, I am King Oliver!'},
 {scene:'prison',title:'BENEATH THE CASTLE',speaker:'Narrator',text:'The two rooks dragged Oliver to the dungeon and locked him in the central cell between two other prisoners.'},
 {scene:'prison',title:'THE SLEEPING GUARD',speaker:'Oliver',text:'The guard is sleeping in the corridor. I must find a way out and reclaim my crown.'}
]
// Placeholder stages only. Actual questions, answers and hints are intentionally deferred.
const puzzles={cell:{},sluice:{},lantern:{},monster:{},exit:{},watchChest:{},merrick:{},lumber:{},ropes:{},bridge:{}};

let engine=null,baseWorld=null,scene='intro',chapter={scene:'intro',flags:{},coins:[],step:0,position:null},activePuzzle=null;
const complete=id=>!!chapter.flags[id];
function persist(){try{if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};chapter.scene=scene;localStorage.setItem(KEY,JSON.stringify(chapter));}catch{}}
function restored(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','forest','village','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins)){v.coins=v.coins.slice(0,2);if(!Number.isInteger(v.step)||v.step<0)v.step=0;return v;}}catch{}return chapter;}
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
 w.spawn={x:6,y:25};w.music='sewer';return w;
}
function forestWorld(){
 // The path is a guide, not a fence: soft grassy ground is freely walkable.
 // Only the outer rows of dense old trees and small tree clusters are solid.
 const w=createWorld(36,19,'.');
 for(let y=1;y<18;y++)for(let x=1;x<35;x++){
  const forestEdge=x<=2||x>=33||y<=2||y>=16;
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
 w.spawn={x:4,y:12};w.music='willowmere';
 w.npcs=[
  {id:'forest-traveller',name:'Travelling Bishop',x:13,y:7,piece:'B',color:'white',lines:['A king? In these muddy woods? You must be joking.','Take the eastern path if you are looking for Willowmere.']},
  {id:'forest-woodcutter',name:'Old Woodcutter',x:21,y:13,piece:'R',color:'black',lines:['King Oliver? I have seen the king in the castle, stranger.','Follow the lanterns. Willowmere is not far.']}
 ];
 w.npcs.push({id:'watch-keeper',name:'Gatekeeper Rowan',x:27,y:7,piece:'R',color:'white',lines:['The key is in my chest but I forgot the password.']},{id:'watch-scout',name:'Watchpost Scout',x:29,y:7,piece:'P',color:'green',lines:['Ask Rowan about the gate.']});return w;}
function villageWorld(){
 const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.filter(n=>n.id!=='pip').map(n=>({...n,lines:[...n.lines]}))};
 for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');
 for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');
 if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');
 w.spawn={x:26,y:29};
 // Keep the entire gallery in front of the player, away from the village stall.
 w.showcase=Array.from({length:10},(_,i)=>({x:20+i%5*3,y:i<5?31:35,piece:'K',color:'white',prototype:i+1}));
 return w;
}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():next==='forest'?forestWorld():villageWorld();const requested=position||({...w.spawn,facing:'down'});const safe=w.tiles[requested.y]?.[requested.x];const pos=safe&&!['H','w','T','F','X'].includes(safe)?requested:{...w.spawn,facing:'right'};engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;}
function teleport(destination){
 if(!engine||!['cell','sewer','forest','village'].includes(destination))return;
 activePuzzle=null;
 for(const id of ['fallen-story-intro','fallen-story-puzzle','fallen-pause','fallen-map','fallen-wardrobe']){const el=$(id);if(el)el.hidden=true;}
 setScene(destination,destination==='cell'?{x:12,y:9,facing:'right'}:destination==='sewer'?{x:6,y:25,facing:'right'}:destination==='forest'?{x:4,y:12,facing:'right'}:{x:26,y:29,facing:'down'});
 document.getElementById('fallen-canvas')?.focus({preventScroll:true});
}
function say(name,...lines){engine.say(name,lines);}
function objective(){if(scene==='cell')return complete('cell')?'The drain is open. Press E at the toilet to escape.':complete('inspectedToilet')?'Find the mechanism beneath the toilet. Press E to examine it.':'Find a way out of the prison cell.';if(scene==='sewer')return !complete('exit')?'Find the sewer exit.':'Escape into the forest (E).';if(scene==='forest')return complete('watchChest')?'Pass the open barrier into Willowmere.':'Open the barrier at the forest watchpost.';if(!complete('lumber'))return 'Ask Baker Bea about timber for the broken bridge.';if(!complete('ropes'))return 'Find Courier Nox and work out the ropes.';if(!complete('bridge'))return 'Go to the east bridge and solve the final engineering puzzle.';return 'The bridge is restored. Chapter One complete!';}
function updateObjective(){const o=$('fallen-story-objective'),h=$('fallen-pause-title');if(o&&h&&o.parentNode!==h.parentNode){h.parentNode.insertBefore(o,h);o.style.cssText='display:block;position:static;margin:0 auto 12px;padding:10px;border:1px solid #a49270;border-radius:6px;background:#202632;color:#e8d7ae;text-align:center;font-size:14px';}if(o){o.textContent='Objective: '+objective();o.hidden=scene==='intro';}const d=$('fallen-story-interact');if(d)d.hidden=true;}
function start(api){engine=api;baseWorld=api.getWorld();document.querySelectorAll?.('[data-fallen-jump]')?.forEach(b=>b.addEventListener('click',()=>teleport(b.dataset.fallenJump)));chapter=restored();if(chapter.scene==='intro'){scene='intro';showIntro();}else setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);if(chapter.scene!=='intro')$('fallen-story-intro').hidden=true;document.addEventListener('keydown',onKey,true);$('fallen-story-next').addEventListener('click',nextIntro);$('fallen-story-skip')?.addEventListener('click',()=>{if(scene!=='intro')return;engine.enableSound();chapter.step=steps.length;const intro=$('fallen-story-intro');intro.hidden=true;setScene('cell',{x:12,y:9,facing:'right'});say('Oliver','A locked cell. The old toilet might conceal a way out.');});$('fallen-story-art').addEventListener('click',nextIntro);$('fallen-story-puzzle-continue').addEventListener('click',continuePuzzle);$('fallen-story-puzzle-close').addEventListener('click',closePuzzle);$('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});updateObjective();}
function blockedInput(){return scene==='intro'||!!activePuzzle;}
function onKey(e){if(!blockedInput())return;const k=e.key.toLowerCase();if(['e','enter',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(scene==='intro')nextIntro();else if(activePuzzle)continuePuzzle();return;}if(k==='escape'&&activePuzzle){e.preventDefault();e.stopImmediatePropagation();closePuzzle();}if(scene==='intro'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}}
function showIntro(){scene='intro';$('fallen-story-intro').hidden=false;const step=steps[Math.min(chapter.step,steps.length-1)];engine.setWorld(introWorld(step.scene),step.scene==='prison'?{x:12,y:7,facing:'down'}:{x:9,y:6,facing:'down'});$('fallen-story-intro-title').textContent=step.title;$('fallen-story-intro-speaker').textContent=step.speaker;$('fallen-story-intro-text').textContent=step.text;$('fallen-story-next').textContent=chapter.step===steps.length-1?'Begin escape →':'Continue →';drawIntroImage(step.scene);persist();}
function nextIntro(){if(scene!=='intro')return;engine.enableSound();if(chapter.step===0)engine.soundCue();chapter.step++;if(chapter.step>=steps.length){$('fallen-story-intro').hidden=true;setScene('cell',{x:12,y:9,facing:'right'});say('Oliver','An old toilet. A barred door. And a puzzle carved into the drain.');}else showIntro();}
function introWorld(kind){if(kind==='prison')return cellWorld();const w=createWorld(18,12,'s');w.music=['theft','approach','confrontation','arrest'].includes(kind)?'theft':'palace';return w;}
function drawIntroImage(){const c=$('fallen-story-art').getContext('2d');c.fillStyle='#273944';c.fillRect(0,0,640,360);}
function renderIntroFrame(canvas){if(scene!=='intro'||$('fallen-story-intro').hidden)return;const c=$('fallen-story-art').getContext('2d');c.imageSmoothingEnabled=false;try{c.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,640,360);}catch{}}
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
 if(scene==='forest')return (!complete('watchChest')&&x>=30)||(x>=34&&y>=7&&y<=10);
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
  if(near(p,27,9,3)&&!complete('watchChest')){if(!complete('watchAsked')){chapter.flags.watchAsked=true;persist();say('Gatekeeper Rowan','The barrier needs a key. I hid it in my chest, but forgot the password. Can you help?');}else openPuzzle('watchChest');return true;}
   if(x>=31&&y>=7&&y<=11){
   setScene('village',{x:26,y:29,facing:'up'});
   say('Oliver','A village at last. Perhaps someone here will believe I am the king.');return true;
  }
  return false;
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
function customScene(){return scene==='intro'||scene==='cell'||scene==='sewer'||scene==='forest';}

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
function fieldOfView(){if(!engine)return null;if(scene==='sewer')return {enabled:true,radius:10,isOpaque:sightOpaque};if(scene==='cell')return {enabled:true,radius:13,isOpaque:sightOpaque};return null;}
function drawGround(g,x,z){
 const w=engine.getWorld(),tile=w.tiles[z]?.[x]||'H',isPalace=scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison';
 const base=isPalace?'#9d856d':scene==='sewer'?'#43575a':scene==='forest'?'#496b4f':'#696f6d';
 if(scene==='forest'){const path=tile==='p'||tile==='s';g.box(x+.5,-.20,z+.5,1,.18,1,path?'#7e7661':'#37553e');if(path){g.box(x+.5,-.025,z+.5,.94,.025,.94,(x+z)%4===0?'#908267':'#746e5c');}else{g.box(x+.5,-.014,z+.5,.94,.02,.94,(x*3+z)%7===0?'#507451':'#466647');}return;}
 g.box(x+.5,-.20,z+.5,1,.19,1,base);
 if(scene==='sewer'&&tile==='w'){g.box(x+.5,-.045,z+.5,1,.055,1,'#355d68');return;}
 if(scene==='sewer'&&tile==='H'){g.box(x+.5,-.035,z+.5,1,.055,1,'#354447');return;}
 if(isPalace){g.box(x+.5,.006,z+.5,.94,.017,.94,(x+z)%4===0?'#b5a083':'#a8967c');return;}
 if(scene==='sewer'&&tile==='s'){
  const stream=w.streamTiles?.[z*w.width+x]||0;
  if(!window.FallenKingDetailPlus?.draw(g,'floor',x+.5,.005,z+.5,.99,.02,.99))
    g.box(x+.5,.005,z+.5,.96,.02,.96,'#596461');
  if(stream)g.box(x+.5,.025,z+.5,1.005,.017,1.005,'#426871');
  else if((x*7+z*3)%11===0)g.box(x+.5,.023,z+.5,.45,.009,.36,'#4c615d');
  if((x*17+z*11)%139===0&&!stream){
   g.box(x+.5,.032,z+.5,.70,.018,.61,'#364c51');
   for(let i=0;i<5;i++)g.box(x+.21+i*.15,.047,z+.5,.045,.015,.58,'#87948e');
  }
  return;
 }
 if(window.FallenKingDetailPlus?.draw(g,'floor',x+.5,.005,z+.5,.99,.02,.99))return;
 g.box(x+.5,.005,z+.5,.96,.02,.96,scene==='sewer'?'#6c7977':'#94958c');
}
function drawProps(g){
 const {box,cylinder,cone,sphere,piece,oliver,features,recliningKing,tri}=g;
 const drawOliver=(x,z)=>oliver?oliver(x,z):piece(x,z,'K','white',true);
 const dp=window.FallenKingDetailPlus,model=(id,x,y,z,w,h,d,rot=0)=>!!dp?.draw?.(g,id,x,y,z,w,h,d,rot);
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
    model('chest',4.7,0,9.2,1.05,.68,.72);
    box(4.1,1.20,8,1.6,2.4,.14,'#b59c78');for(let k=0;k<4;k++)box(4.1+(k-1.5)*.32,1.28,8.09,.04,1.8,.06,'#d6c29c');
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
 }else if(scene==='forest'){
  const world=engine.getWorld();
  // A forest road with substantial canopies and mossy stones, not random blocks in walkable areas.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]==='T'){
    if(g.tree&&((x<=2||x>=33||z<=2||z>=16)?(x+z)%2===0:(x+z)%3===0))g.tree(x+.5,z+.5);
    if((x*3+z*5)%19===0)model('stones',x+.5,.01,z+.5,.64,.27,.55);
   }
  }
  // The torches are stationed on grass OUTSIDE the walking path.
  for(const [x,z] of [[5.5,13.2],[10.5,9.8],[19.4,14.8],[29.3,11.0]]){
   cylinder(x,.05,z,.11,.13,.69,'#665e48',9);
   cone(x,.79,z,.20,.29,'#ddae66',9);sphere(x,.97,z,.095,'#f5d18f',8);
  }
  model('barrel',12.4,0,8.35,.52,.61,.52);
  model('stones',21.5,0,11.0,.84,.31,.71);
  // Open-sided watchpost, two guards and the key chest.
   for(const x of [25.5,29.5])for(const z of [5.4,9.3]){box(x,1.18,z,.32,2.36,.32,'#6c5039');box(x,2.41,z,.48,.17,.48,'#b69c72');}
   box(27.5,.15,7.5,4.7,.18,4.5,'#8e816b');
   for(const z of [5.2,9.55])box(27.5,1.4,z,4.6,.15,.13,'#977b54');
   model('chest',26.2,.2,8.4,1.2,.85,.9);
   for(const [x,z,c] of [[27.25,6.9,'white'],[29.05,6.9,'green']])piece(x,z,x<28?'R':'P',c,false);
   for(const x of [25.6,29.4])box(x,2.56,7.4,.18,.20,4.4,'#5e423c');
   for(const z of [5.3,9.45])box(27.5,2.56,z,4,.20,.18,'#825d48');
   for(const z of [5.2,11.6]){box(30.15,.96,z,.32,1.92,.34,'#76583e');cone(30.15,2.12,z,.23,.29,'#a68a64',8);}
   if(!complete('watchChest')){box(30.15,1.13,8.45,.27,.26,6.4,'#ab8252');box(30.15,1.27,8.45,.30,.07,6.35,'#d6b17a');}else box(30.15,2.02,5.7,.27,.27,4.65,'#ab8252');
 }
}
function drawVillageProps(g){
 if(scene!=='village')return;
 const {box,cylinder,cone,sphere}=g,done=complete('bridge');
 window.FallenKingDetailPlus?.draw?.(g,'barrel',41.3,0,17.7,.65,.68,.65);
 window.FallenKingDetailPlus?.draw?.(g,'chest',41.8,0,21.4,.92,.58,.68);
 // DetailPlus: an inhabited medieval market square, with readable stalls, barrels and civic stonework.
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
window.FallenKingStory={start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,hasMap,drawGround,backdrop,fieldOfView,drawProps,drawVillageProps,drawEffects,drawFollowers,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();