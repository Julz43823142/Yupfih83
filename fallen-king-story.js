(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2'; // Preserve existing chapter saves.
const steps=[
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'In Aldemar, King Oliver slept in his royal bedchamber. His gold-and-ruby crown rested on a red-velvet cushion beside the bed.'},
 {scene:'bedroom',title:'THE ROYAL BEDCHAMBER',speaker:'Narrator',text:'The candles burned low. Outside the tall windows, the castle guards patrolled while Oliver slept.'},
 {scene:'approach',title:'EDWIN THE PAWN',speaker:'Narrator',text:'Edwin was an ordinary black pawn at court. Tired of always obeying orders, he secretly dreamed of wearing the crown himself.'},
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
const puzzles={cell:{},sluice:{},lantern:{},monster:{},exit:{},merrick:{},lumber:{},ropes:{},bridge:{}};

let engine=null,baseWorld=null,scene='intro',chapter={scene:'intro',flags:{},coins:[],step:0,position:null},activePuzzle=null;
const complete=id=>!!chapter.flags[id];
function persist(){try{if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};chapter.scene=scene;localStorage.setItem(KEY,JSON.stringify(chapter));}catch{}}
function restored(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','forest','village','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins)){v.coins=v.coins.slice(0,1);if(!Number.isInteger(v.step)||v.step<0)v.step=0;return v;}}catch{}return chapter;}
function createWorld(width,height,kind){const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'H':kind));return {width,height,tiles:rows.map(a=>a.join('')),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:3,y:5},version:baseWorld.version,music:'default'};}
function updateTile(w,x,y,v){const r=w.tiles[y].split('');r[x]=v;w.tiles[y]=r.join('');}
function cellWorld(){const w=createWorld(25,16,'H');
 // A continuous castle complex: guard corridor to the north, two flanking cells, Oliver's cell in the middle.
 for(let y=1;y<=13;y++)for(let x=1;x<=23;x++)updateTile(w,x,y,'s');
 for(let x=1;x<=23;x++)updateTile(w,x,5,'H'); // Locked northern cell fronts (visible iron bars).
 for(let y=5;y<=13;y++)for(const x of [6,18])updateTile(w,x,y,'H'); // Transparent barred partitions.
 for(let x=1;x<=23;x++)updateTile(w,x,14,'H'); // South exterior wall and barred window.
 for(let x=1;x<=23;x++)updateTile(w,x,0,'H');
 for(let y=1;y<=14;y++){updateTile(w,0,y,'H');updateTile(w,24,y,'H');}
 // Guard has a bed in the northern passage; no direct passage through the cell bars.
 w.spawn={x:12,y:9};w.music='prison';return w;}

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
 const route=[[6,25],[18,25],[18,10],[32,10],[32,38],[49,38],[49,13],[64,13],[64,25],[76,25]];
 for(let i=1;i<route.length;i++)hall(...route[i-1],...route[i]);
 // Side tunnels deliberately finish in stone; the main route remains five across.
 const branches=[[[9,25],[9,39]],[[12,25],[12,17]],[[18,12],[23,12]],
 [[24,10],[24,4]],[[32,17],[41,17]],[[32,31],[23,31]],
 [[40,38],[40,46]],[[49,28],[56,28]],[[56,13],[56,5]],
 [[64,18],[73,18]],[[70,25],[70,36]],[[49,36],[56,36]]];
 for(const [start,end] of branches)hall(...start,...end);
 // Small water gutters remain outside walkable corridors.
 for(let z=2;z<w.height-2;z++)for(let x=2;x<w.width-2;x++)if(w.tiles[z][x]==='H'){
  const neighbours=[[x-1,z],[x+1,z],[x,z-1],[x,z+1]];
  if(neighbours.some(([xx,zz])=>w.tiles[zz]?.[xx]==='s')&&(x*7+z*11)%4===0)updateTile(w,x,z,'w');
 }
 // Each locked sluice blocks the complete five-tile cross-section, not just one square.
 for(const [z,x,id] of [[18,18,'sluice'],[26,32,'lantern']]){
  for(let dx=-radius;dx<=radius;dx++)updateTile(w,x+dx,z,complete(id)?'s':'H');
 }
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
 w.spawn={x:3,y:10};w.music='willowmere';
 w.npcs=[
  {id:'forest-traveller',name:'Travelling Bishop',x:13,y:7,piece:'B',color:'white',lines:['A king? In these muddy woods? You must be joking.','Take the eastern path if you are looking for Willowmere.']},
  {id:'forest-woodcutter',name:'Old Woodcutter',x:21,y:13,piece:'R',color:'black',lines:['King Oliver? I have seen the king in the castle, stranger.','Follow the lanterns. Willowmere is not far.']}
 ];
 return w;
}
function villageWorld(){const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.map(n=>({...n,lines:[...n.lines]}))};for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');w.npcs=w.npcs.filter(n=>!(complete('pip')&&n.id==='pip')).map(n=>n.id==='pip'?{...n,lines:['Oliver, I believe you. Let us repair the bridge.']}:n);w.spawn={x:26,y:29};return w;}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():next==='forest'?forestWorld():villageWorld();const requested=position||({...w.spawn,facing:'down'});const safe=w.tiles[requested.y]?.[requested.x];const pos=safe&&!['H','w','T','F','X'].includes(safe)?requested:{...w.spawn,facing:'right'};engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;}
function say(name,...lines){engine.say(name,lines);}
function objective(){if(scene==='cell')return complete('cell')?'The drain is open. Press E at the toilet to escape.':complete('inspectedToilet')?'Find the mechanism beneath the toilet. Press E to examine it.':'Find a way out of the prison cell.';if(scene==='sewer')return !complete('sluice')?'Explore the wider sewers and open the first iron sluice (E).':!complete('lantern')?'Follow the five-stone-wide tunnels to the second gate (E).':!complete('monster')?'Find the creature lost in the sewer maze (E).':!complete('exit')?'Find the exit and open the final lock (E).':'Escape the sewer into the forest (E).';if(scene==='forest')return 'Follow the woodland path toward Willowmere. Talk to the travellers with E.';if(!complete('pip'))return 'Meet Pip near the village square.';if(!complete('lumber'))return 'Ask Baker Bea about timber for the broken bridge.';if(!complete('ropes'))return 'Find Courier Nox and work out the ropes.';if(!complete('bridge'))return 'Go to the east bridge and solve the final engineering puzzle.';return 'The bridge is restored. Chapter One complete!';}
function updateObjective(){$('fallen-story-objective').textContent=objective();$('fallen-story-objective').hidden=scene==='intro';const detail=$('fallen-story-interact');if(detail)detail.hidden=true;}
function start(api){engine=api;baseWorld=api.getWorld();chapter=restored();if(chapter.scene==='intro'){scene='intro';showIntro();}else setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);if(chapter.scene!=='intro')$('fallen-story-intro').hidden=true;document.addEventListener('keydown',onKey,true);$('fallen-story-next').addEventListener('click',nextIntro);$('fallen-story-skip')?.addEventListener('click',()=>{if(scene!=='intro')return;engine.enableSound();chapter.step=steps.length;const intro=$('fallen-story-intro');intro.hidden=true;setScene('cell',{x:12,y:9,facing:'right'});say('Oliver','A locked cell. The old toilet might conceal a way out.');});$('fallen-story-art').addEventListener('click',nextIntro);$('fallen-story-puzzle-continue').addEventListener('click',continuePuzzle);$('fallen-story-puzzle-close').addEventListener('click',closePuzzle);$('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});updateObjective();}
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
 if(id==='exit')setScene('forest',{x:3,y:10,facing:'right'});
 else if(scene==='sewer')setScene('sewer',engine.getPlayer());
 else if(scene==='village')setScene('village',engine.getPlayer());
 else persist();
 const lines={cell:'The toilet drain is open. I can squeeze into the sewers.',sluice:'The first floodgate rises, revealing deeper tunnels.',lantern:'The second gate unlocks. The maze continues.',monster:'The strange creature finally has an answer. It lets me pass.',exit:'The last gate opens. I can feel fresh woodland air.',merrick:'The bishop nods and lets Oliver pass.',lumber:'We have the timber needed for the bridge.',ropes:'The ropes are ready. Time to repair the bridge.',bridge:'The bridge is repaired. We can cross now.'};
 say('Oliver',lines[id]||'The way ahead is clear.');updateObjective();
}
// Movement never opens a puzzle. Controls and discoveries require an explicit E/Enter/Space action.
function beforeMove(x,y){
 if(scene==='cell')return x===16&&y===10;
 if(scene==='sewer'){if(y===18&&x>=16&&x<=20&&!complete('sluice'))return true;if(y===26&&x>=30&&x<=34&&!complete('lantern'))return true;return x>=79&&y>=23&&y<=27;}
 if(scene==='forest')return x>=34&&y>=7&&y<=10;
 if(scene==='village'&&x>=45&&x<=47&&y===19&&!complete('bridge'))return true;
 return false;
}
const coinSpots={cell:[[12,13]]};
function afterMove(){const p=engine.getPlayer();if(scene==='village'&&!complete('pip')&&Math.abs(p.x-28)+Math.abs(p.y-21)<=2){chapter.flags.pip=true;setScene('village',p);say('Pip','You really are King Oliver? The villagers think you are joking.','I believe you. I will help you reach the eastern bridge!');}
 if(scene==='village'&&complete('bridge')&&p.x>=48&&p.y===19&&!complete('chapterEnd')){chapter.flags.chapterEnd=true;say('Pip','The road east is open! Our adventure has only begun.');}
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
  if(near(p,18,20,3)&&!complete('sluice')){openPuzzle('sluice');return true;}
  if(near(p,32,28,3)&&!complete('lantern')){openPuzzle('lantern');return true;}
  if(near(p,49,38,3)&&!complete('monster')){
   if(!complete('monsterIntroduced')){chapter.flags.monsterIntroduced=true;persist();say('Sewer Creature','I have lived in these filthy drains for years. One strange puzzle has defeated me every night. Can you help me?');}
   else openPuzzle('monster');
   return true;
  }
  if(near(p,76,25,3)){
   if(!complete('monster')){say('Oliver','I cannot leave yet. The strange creature may know the way.');return true;}
   if(!complete('exit')){openPuzzle('exit');return true;}
   setScene('forest',{x:3,y:10,facing:'right'});say('Oliver','Fresh air! A forest path leads toward a village.');return true;
  }
  say('Oliver','The tunnels twist in every direction. Many passages end in solid stone.');return true;
 }
 if(scene==='forest'){
  if(x>=31&&y>=7&&y<=11){
   setScene('village',{x:26,y:29,facing:'up'});
   say('Oliver','A village at last. Perhaps someone here will believe I am the king.');return true;
  }
  return false;
 }
 if(scene==='village'){
  if(near(p,28,21,2)&&!complete('pip')){chapter.flags.pip=true;setScene('village',p);say('Pip','I believe you, Oliver. We can repair the broken bridge together.');persist();updateObjective();return true;}
  if(complete('pip')&&near(p,17,19,2)&&!complete('lumber')){openPuzzle('lumber');return true;}
  if(complete('lumber')&&near(p,16,28,2)&&!complete('ropes')){openPuzzle('ropes');return true;}
  if(x>=41&&y>=17&&y<=21){if(!complete('lumber')||!complete('ropes'))say('Pip','We still need timber and rope. Ask the villagers first.');else if(!complete('bridge'))openPuzzle('bridge');else say('Pip','Our bridge is repaired!');return true;}
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
 function candle(x,z,y=.55){cylinder(x,y,z,.075,.075,.20,'#e9d5b6',8);cone(x,y+.14,z,.062,.16,'#e6a64f',7);sphere(x,y+.24,z,.055,'#f9d69a',6);}
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
function sightOpaque(x,z){if(scene!=='cell')return false;const w=engine.getWorld();if(x<0||z<0||x>=w.width||z>=w.height)return true;
 // Partition bars and the north gate block walking, but NOT the line of sight.
 if(z===5&&x>=1&&x<=23)return false;
 if((x===6||x===18)&&z>=5&&z<=13)return false;
 if(z===14&&x>=11&&x<=13)return false; // South-facing barred window.
 return w.tiles[z]?.[x]==='H';}
function fieldOfView(){if(scene!=='cell'||!engine)return null;return {enabled:true,radius:13,isOpaque:sightOpaque};}
function drawGround(g,x,z){
 const w=engine.getWorld(),tile=w.tiles[z]?.[x]||'H',isPalace=scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison';
 const base=isPalace?'#9d856d':scene==='sewer'?'#43575a':scene==='forest'?'#496b4f':'#696f6d';
 if(scene==='forest'){const path=tile==='p'||tile==='s';g.box(x+.5,-.20,z+.5,1,.18,1,path?'#7e7661':'#37553e');if(path){g.box(x+.5,-.025,z+.5,.94,.025,.94,(x+z)%4===0?'#908267':'#746e5c');}else{g.box(x+.5,-.014,z+.5,.94,.02,.94,(x*3+z)%7===0?'#507451':'#466647');}return;}
 g.box(x+.5,-.20,z+.5,1,.19,1,base);
 if(scene==='sewer'&&tile==='w'){g.box(x+.5,-.045,z+.5,1,.055,1,'#355d68');return;}
 if(scene==='sewer'&&tile==='H'){g.box(x+.5,-.035,z+.5,1,.055,1,'#354447');return;}
 if(isPalace){g.box(x+.5,.006,z+.5,.94,.017,.94,(x+z)%4===0?'#b5a083':'#a8967c');return;}
 if(window.FallenKingDetailPlus?.draw(g,'floor',x+.5,.005,z+.5,.99,.02,.99))return;
 g.box(x+.5,.005,z+.5,.96,.02,.96,scene==='sewer'?'#6c7977':'#94958c');
}
function drawProps(g){
 const {box,cylinder,cone,sphere,piece,oliver,features,recliningKing,tri}=g;
 const drawOliver=(x,z)=>oliver?oliver(x,z):piece(x,z,'P','white',false);
 const dp=window.FallenKingDetailPlus,model=(id,x,y,z,w,h,d,rot=0)=>!!dp?.draw?.(g,id,x,y,z,w,h,d,rot);
 const rock='#687076',iron='#253945',wood='#785943',ivory='#e7ddc8';
 const brass='#d6b46b',royal='#a3474f',azure='#517488',moss='#416c65';
 function wall(x,z,w=1,h=1.8){const dungeon=scene==='cell'||scene==='sewer'||scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene==='prison';if(dungeon&&model('wall',x,0,z,w,h,.86))return;box(x,h/2,z,w,h,.86,rock);box(x,h-.08,z,w,.15,.92,'#ada79a');box(x,h*.53,z,w,.08,.93,'#495960');}
 function rails(a,b,z){/* Genuine forged-iron bars, not Kenney's brown timber dungeon gates. */box((a+b)/2,1.98,z,b-a,.17,.19,'#303b40');box((a+b)/2,.14,z,b-a,.15,.19,'#27353a');for(let x=a+.20;x<b-.12;x+=.46){cylinder(x,.99,z,.052,.055,1.86,iron,10);sphere(x,1.95,z,.070,'#78878a',8);box(x,.20,z,.17,.10,.20,'#455257');}for(let x=a+.16;x<b;x+=1.85)box(x,1.03,z,.15,.11,.24,'#809195');}
 function bed(x,z){/* Narrow prison cot: low iron legs, a pale mattress, a pillow and faded blue blanket. */for(const dx of [-1.35,1.35])for(const dz of [-.63,.63])cylinder(x+dx,.20,z+dz,.065,.065,.39,'#46535a',8);box(x,.31,z,2.95,.10,1.48,'#566166');box(x,.42,z,2.83,.15,1.37,'#c4bea9');box(x-.94,.53,z,.70,.13,1.12,'#e2ddc9');box(x+.55,.52,z,1.54,.09,1.28,'#6d8294');box(x+.52,.58,z+.56,1.5,.06,.10,'#8e9da1');}
 function royalBed(x,z){
  // Recognisable upholstered royal four-poster bed: DetailPlus bed mesh plus carved posts and velvet drapery.
  if(!model('bed',x,0,z,3.85,.82,2.22))bed(x,z);
  for(const dx of [-1.76,1.76])for(const dz of [-1.06,1.06]){
   cylinder(x+dx,.02,z+dz,.13,.14,2.64,'#73523c',10);
   cylinder(x+dx,2.66,z+dz,.20,.20,.13,'#d9b677',10);
   sphere(x+dx,2.86,z+dz,.15,'#d9b677',9);
  }
  for(const dz of [-1.06,1.06]){
   box(x,2.53,z+dz,3.70,.14,.13,'#a17b52');
   for(let i=0;i<7;i++)box(x-1.52+i*.50,2.38,z+dz,.18,.30,.07,i%2?'#8a435c':'#aa576d');
  }
  box(x-1.89,1.09,z,.18,1.89,2.25,'#7f3d56');
  box(x-1.94,1.10,z,.07,1.81,1.93,'#ad6578');
  for(const dz of [-.70,.70])sphere(x-1.79,1.25,z+dz,.085,'#e3c286',9);
  box(x+.65,.72,z,1.88,.07,1.73,'#8d4c6a');
  box(x+1.50,.81,z,0.14,.10,1.74,'#d3b483');
  box(x-1.03,.75,z,.72,.15,1.60,'#e7ddca');
 }
 function toilet(x,z){if(dp?.toilet?.(g,x,z))return;box(x,.36,z-.3,.9,.7,.65,'#aeb4ae');cylinder(x,.57,z+.18,.5,.5,.22,ivory,12);cylinder(x,.7,z+.18,.35,.35,.06,'#becbca',12);cylinder(x,.73,z+.18,.21,.21,.06,'#416477',12);box(x,.87,z-.53,.77,.14,.15,ivory);box(x+.33,.77,z-.59,.10,.18,.12,'#ad9f78');}
 function torch(x,z){box(x,.84,z,.22,.36,.2,wood);cone(x,1.16,z,.15,.38,'#e5a94d',8);sphere(x,1.34,z,.12,'#ffe0a0',8);}
 function banner(x,z,c=royal){box(x,1.85,z,.65,1.48,.07,c);box(x,2.60,z,.77,.10,.13,brass);box(x,1.05,z,.70,.12,.13,brass);box(x,2.05,z+.06,.16,.18,.08,brass);}
 function tapestry(x,z){box(x,1.85,z,1.10,1.45,.09,'#784157');box(x,2.60,z,1.2,.10,.18,brass);for(let i=0;i<3;i++)box(x+(i-1)*.25,1.55,z+.065,.09,.58,.07,brass);}
 function pipe(x,z,length=3){cylinder(x,1.4,z,.24,.24,length,'#697e7a',10);cylinder(x,1.4,z,.28,.28,.12,'#b3a97e',10);}
 function arch(x,z){for(const dx of [-1.7,1.7]){box(x+dx,1.3,z,.37,2.6,.44,'#8a9991');box(x+dx,2.35,z,.49,.19,.52,'#a7ad9d');}box(x,2.68,z,3.8,.40,.5,'#6d7d7b');box(x,2.93,z,3.1,.12,.57,'#4a655f');}
 function king(x,z){drawOliver(x,z);}
 function edwin(x,z,wearingCrown=false){
  piece(x,z,'P','black',false);
  // Edward's burgundy heraldic sash and gold badge distinguish him from ordinary pawns.
  box(x,.68,z+.305,.38,.54,.10,'#a44756');
  box(x+.125,.80,z+.37,.09,.16,.04,'#e3bc72');
  for(const dx of [-.105,.105])sphere(x+dx,1.38,z+.285,.048,'#f7cb8c',8);
  if(wearingCrown)dp?.crown?.(g,x,1.53,z,.82);
 }
 if(scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison'){
  const kind=steps[Math.min(chapter.step,steps.length-1)].scene;
  for(let x=0;x<18;x++){wall(x+.5,.5,1,2.9);wall(x+.5,11.5,1,1.2);if(x%3===0)box(x+.5,2.95,.62,.30,.25,1.3,'#c0ae87');}
  for(let z=1;z<11;z++){wall(.5,z+.5,1,2.4);wall(17.5,z+.5,1,2.4);}
  for(let x=2;x<18;x+=4)box(x,.05,6,.06,.10,9,'#beaa8a');
  if(kind!=='prison'){for(const x of [3,7,11,15]){box(x,1.25,.95,.88,2.5,.4,'#b5a48b');tapestry(x,1.19);}for(const x of [2,16]){cylinder(x,.83,6,.36,.36,1.66,'#d8c599',10);sphere(x,1.76,6,.34,'#e4d3ad',10);}for(let z=2;z<11;z+=3)banner(17.04,z+.5,royal);}
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
    if(['bedroom','approach','theft'].includes(kind)){if(recliningKing)recliningKing(9,5);else{box(8.8,.84,5,2.15,.35,.74,'#e6dbbf');sphere(8.0,1.05,5,.39,'#e8ddc5',12);}}else drawOliver(8.9,7.0);
    box(9.6,.88,5,.72,.10,1.26,'#8e5470');
    if(kind==='approach')edwin(15.1,8.7);
    if(kind==='theft'){edwin(13.0,7.4);dp?.crown?.(g,12.55,1.65,7.0,.88);}
    if(kind==='confrontation')edwin(12.7,7.0,true);
    if(kind==='arrest'){edwin(13.7,7.0,true);for(const x of [6.5,11])piece(x,8.8,'R','white',false);}
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
   wall(x+.5,15.48,1,2.35); // South exterior wall beyond the window.
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
  for(let z=6;z<=13;z+=.52){ // West and east side cells have transparent iron bars, not thick walls.
   for(const x of [6.5,18.5]){cylinder(x,.09,z,.048,.051,1.92,iron,9);sphere(x,2.02,z,.066,'#859196',7);}
  }
  for(const x of [6.5,18.5])for(const y of [.20,1.97])box(x,y,9.7,.16,.13,8.4,'#35464c');
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
  if(g.recliningPiece)g.recliningPiece(12.1,2.38,'R','black');else{
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
  // SOUTH-facing window: inset cyan moonlight behind the southern iron bars (no west-side false window).
  // What Oliver can see beyond the south window: moon, castle silhouettes and a dark moat.
  box(12.5,.84,14.52,2.78,1.26,.11,'#293f57');
  box(12.5,.83,14.45,2.52,.43,.07,'#355e74');
  sphere(13.15,1.76,14.38,.16,'#d7dfd4',12);
  for(const x of [11.51,12.07,12.58]){box(x,1.0,14.37,.33,.53,.08,'#273e48');box(x,1.5,14.36,.40,.12,.09,'#273e48');}
  for(const x of [11.8,12.65,13.2])box(x,.70,14.34,.35,.015,.045,'#88a9b0');
  for(const x of [11.66,12.45,13.24])cylinder(x,.79,14.37,.062,.062,1.35,'#34444b',10);
  for(const y of [.78,1.95])box(12.5,y,14.36,2.52,.11,.19,'#354a50');
  box(12.5,2.05,14.30,3.12,.16,.55,'#a2aca5');
  box(12.5,.67,14.30,3.13,.14,.58,'#828e8b');
  // Cool moonlight pool on the floor, carefully flat and separate from the warm candle.
  for(const [x,z] of [[12.4,12.6],[12.9,12.1],[11.8,12.9]])box(x,.013,z,.44,.012,.69,'#7c9c9f');
  if(scene==='intro'){drawOliver(12.5,9.4);for(const x of [11.4,13.9])piece(x,7.0,'R','white',false);}
  // One readable torch and a small iron pail; never wooden crates or random gate props.
  box(15.3,.85,6.0,.25,.17,.22,'#68767a');torch(15.3,6.0);
  cylinder(8.25,.09,11.45,.24,.29,.43,'#5d6b71',10);
  cylinder(8.25,.51,11.45,.30,.31,.07,'#a2adaf',10);
  cylinder(8.25,.53,11.45,.21,.21,.02,'#2b4147',10);
  model('stones',9.0,0,12.25,.66,.22,.60);
  for(const x of [7.4,16.9]){box(x,.10,13.24,.60,.07,.32,'#596f70');}
 }else if(scene==='sewer'){
  const world=engine.getWorld(),wet='#536a6c',ironDark='#42555b';
  // Walls are only modelled along the actual winding walkways; dead ends are visibly solid stone.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]!=='H')continue;
   const around=[[x-1,z],[x+1,z],[x,z-1],[x,z+1]];
   if(!around.some(([xx,zz])=>world.tiles[zz]?.[xx]==='s'))continue;
   if((x+z)%7===0)model('wall',x+.5,0,z+.5,.98,2.1,.98);
   else{box(x+.5,.82,z+.5,.99,1.64,.98,(x+z)%4===0?'#4c6061':'#536467');box(x+.5,1.72,z+.5,1.02,.12,1.02,'#818c87');}
   if((x*7+z*5)%13===0){box(x+.5,.13,z+.5,.48,.14,.3,'#577b70');model('stones',x+.5,.01,z+.5,.49,.28,.44);}
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
  for(const [x,z] of [[9,25],[18,12],[25,10],[35,38],[55,13],[70,25],[40,44],[27,32]]){
   box(x,.20,z,.51,.4,.51,'#515f5b');model('stones',x,.12,z,.64,.34,.54);
   cylinder(x,.52,z,.07,.07,.47,'#a29b7c',9);
   cone(x,1.04,z,.12,.25,'#d6a65b',8);sphere(x,1.21,z,.095,'#f5d492',8);
  }
  // Gate wheels can be operated from the corridor with E; never trigger on walking.
  for(const [x,z,opened] of [[18,18,complete('sluice')],[32,26,complete('lantern')]]){
   box(x+2.2,.80,z+.44,.38,1.52,.34,wet);
   cylinder(x+2.2,1.10,z+.68,.54,.54,.14,'#ad986d',12);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;box(x+2.2+Math.cos(a)*.38,1.10+Math.sin(a)*.38,z+.78,.13,.13,.11,'#d5c085');}
   // Gate bars span every one of the five corridor tiles.
   if(!opened){for(let dx=-2;dx<=2;dx++){box(x+dx+.5,.85,z+.5,.08,1.67,.16,ironDark);sphere(x+dx+.5,1.72,z+.5,.085,'#889a96',8);}box(x+.5,1.72,z+.5,5.15,.15,.25,ironDark);}
  }
  // The long-lost sewer creature has a distinct silhouette, luminous eyes and a ring of tendrils.
  model('stones',49.4,.15,38.4,1.50,1.38,1.29);model('stones',49.38,1.13,38.4,1.02,.82,.93);
  for(const x of [49.12,49.70]){sphere(x,1.43,38.84,.13,'#e6c178',10);sphere(x,1.44,38.96,.045,'#26353e',8);}
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;cone(49.4+Math.cos(a)*.64,.24,38.4+Math.sin(a)*.64,.14,.63,'#4f7771',7);}
  for(const [x,z] of [[48.7,37.9],[50.2,38.1]])model('stones',x,0,z,.48,.28,.38);
  // Portal to forest after the final PUZZLE -> Continue.
  for(const x of [74.1,78.4]){model('wall',x,0,25.5,.82,2.55,.90);box(x,2.56,25.5,.87,.16,.93,'#a5aca2');}
  box(76.2,2.60,25.5,4.5,.28,.84,'#a5aaa1');
  box(76.2,.06,25.5,1.3,.11,1.0,complete('exit')?'#718c73':'#51646b');
  for(const x of [69,73])model('barrel',x,0,27.75,.55,.67,.55);
 }else if(scene==='forest'){
  const world=engine.getWorld();
  // A forest road with substantial canopies and mossy stones, not random blocks in walkable areas.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]==='T'){
    if(g.tree&&((x<=2||x>=33||z<=2||z>=16)?(x+z)%2===0:(x+z)%3===0))g.tree(x+.5,z+.5);
    if((x*3+z*5)%19===0)model('stones',x+.5,.01,z+.5,.64,.27,.55);
   }
  }
  for(const [x,z] of [[5.5,10.9],[10.5,6.9],[19.4,12.9],[29.3,8.8]]){
   cylinder(x,.05,z,.11,.13,.69,'#665e48',9);
   cone(x,.79,z,.20,.29,'#ddae66',9);sphere(x,.97,z,.095,'#f5d18f',8);
  }
  model('barrel',12.4,0,8.35,.52,.61,.52);
  model('stones',21.5,0,11.0,.84,.31,.71);
  for(const x of [31.4,33.1]){box(x,.70,6.9,.17,1.40,.18,'#795d42');cone(x,1.58,6.9,.23,.29,'#a58b66',9);}
  box(32.25,1.37,6.9,1.60,.17,.15,'#9d835d');
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
   box(x+.3,.19,19.5,.40,.26,2.25,x%1<.45?'#b38c61':'#c19b70');
   box(x+.3,.32,19.5,.08,.03,2.0,'#e1c28e');
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
  for(const [x,z] of lights){const wobble=Math.sin(t*9+x)*.047,glow=.11+Math.sin(t*4+x)*.025;
   sphere(x,1.35+wobble,z,glow,'#f5d5a2',7);
   cone(x,.98+wobble,z,.10,.19,'#e7ad5b',7);
  }
  if(scene==='cell'||kind==='prison'){
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
 // Animate ONLY the actual sewer water tiles. All wave vertices remain anchored;
 // phase changes continuously, and triangles never despawn, wrap or teleport.
 const waterWorld=engine.getWorld();
 for(let z=1;z<waterWorld.height-1;z++)for(let x=1;x<waterWorld.width-1;x++){
  if(waterWorld.tiles[z][x]!=='w')continue;
  for(const stripe of [.23,.50,.77]){
   const y=(u,d)=>.055+.017*Math.sin(u*.92-d*.43-t*1.25);
   const z0=z+stripe,z1=z+stripe+.09,x0=x+.08,x1=x+.92;
   if(tri){
    tri([x0,y(x0,z0),z0],[x1,y(x1,z0),z0],[x1,y(x1,z1),z1],'#6c9b9b');
    tri([x0,y(x0,z0),z0],[x1,y(x1,z1),z1],[x0,y(x0,z1),z1],'#6c9b9b');
   }else box(x+.50,.06,z0+.045,.84,.018,.09,'#6c9b9b');
   const glow=.02+.05*(.5+.5*Math.sin(x*1.3+z*.67-t*1.25));
   box(x+.48,.080+.012*Math.sin(t*1.25+x+z),z0,.13+glow,.009,.022,'#9bc1b8');
  }
 }

}
function drawFollowers(g){if(scene==='village'&&complete('pip')){const p=engine.getPlayer(),x=p.x+(p.facing==='right'?-1:p.facing==='left'?1:0),y=p.y+(p.facing==='down'?-1:p.facing==='up'?1:1);if(x>=0&&x<engine.getWorld().width&&y>=0&&y<engine.getWorld().height){g.piece(x+.5,y+.5,'P','white',false);g.features(x+.5,y+.5,'P','white',false,'pip');}}}
window.FallenKingStory={start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,hasMap,drawGround,backdrop,fieldOfView,drawProps,drawVillageProps,drawEffects,drawFollowers,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();