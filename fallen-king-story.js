(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2'; // Preserve existing chapter saves.
const steps=[
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'In the kingdom of Aldemar, King Oliver slept in his royal chamber. Beside the bed, his crown rested on a velvet cushion.'},
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'Beyond the gold-trimmed curtains, the castle lay silent. The guards had no idea who was approaching.'},
 {scene:'approach',title:'A SHADOW AT THE DOOR',speaker:'Narrator',text:'Edwin slipped through the chamber door. He had watched Oliver for years and knew precisely where the crown was kept.'},
 {scene:'approach',title:'A SHADOW AT THE DOOR',speaker:'Edwin',text:'There it is. The key to the kingdom. No one will see me take it.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Narrator',text:'Edwin lifted the golden crown from its cushion while Oliver slept, unaware.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Edwin',text:'By dawn, Aldemar will bow before its new king.'},
 {scene:'throne',title:'THE FALSE KING',speaker:'Edwin',text:'Guards! Seize that impostor. I am your king!'},
 {scene:'throne',title:'THE FALSE KING',speaker:'Oliver',text:'That is my crown. You know my face. Why will nobody listen?'},
 {scene:'prison',title:'BENEATH THE CASTLE',speaker:'Narrator',text:'The real King Oliver was dragged through the castle dungeon and locked behind iron bars.'},
 {scene:'prison',title:'BENEATH THE CASTLE',speaker:'Oliver',text:'They took my crown, but not my courage. I will find my way out.'}
];
const puzzles={
 cell:{title:'The Prison Lock',question:'The old drain seal has three paired bolts. Each pair needs one turn, and the central catch needs two turns. How many turns in total?',choices:['Four','Five','Six','Eight'],answer:1,hints:['Count the pairs, not the individual bolts.','Three pairs each require one turn.','Add the two turns needed for the central catch.','Answer: Five. Three plus two equals five.'],success:'The porcelain drain shifts, revealing a passage beneath the toilet.'},
 sluice:{title:'The Three Sluices',question:'Three gates A, B and C are in a row. Exactly one is open. A says “B is closed.” B says “C is open.” C says “A is closed.” Exactly two statements are true. Which gate is open?',choices:['A','B','C','None'],answer:2,hints:['Test each possible open gate.','If A were open, only A would be telling the truth.','With C open, the statements of A and C are true.','Answer: C. A and C tell the truth; B is false? Check carefully: B says C is open, so all three would be true.'],success:'The eastern sluice groans open.'},
 lantern:{title:'The Lantern Crossing',question:'A lantern lasts exactly 11 minutes. Oliver and the bishop must cross a tunnel. Oliver takes 4 minutes; the bishop takes 7. They can walk together at the slower speed. How long will they need if they cross together?',choices:['4 minutes','7 minutes','11 minutes','14 minutes'],answer:1,hints:['Two people crossing together do not add their times.','Their pace is limited by the slower walker.','The bishop needs seven minutes.','Answer: 7 minutes. They cross together at the bishop’s pace.'],success:'The lantern throws enough light to reveal the safe tunnel.'},
 merrick:{title:'The Bishop’s Direction',question:'From a stone marker, walk four steps north, three east, four south, then one west. Where do you end relative to the marker?',choices:['Two steps east','Two steps west','At the marker','One step north'],answer:0,hints:['North and south cancel.','The remaining movement is horizontal.','Three east minus one west leaves two east.','Answer: Two steps east.'],success:'Merrick tilts his head. “At least you think before you run.”'},
 lumber:{title:'The Carpenter’s Ledger',question:'A carpenter has three stacks of planks: 3 oak, 4 ash and 5 pine. The bridge needs 12 planks. How many extra planks must be collected?',choices:['0','1','2','3'],answer:0,hints:['Add every stack together.','3 + 4 + 5 is enough to meet the requirement.','The total is exactly twelve.','Answer: 0. There are already twelve planks.'],success:'The carpenter agrees to donate the timber.'},
 ropes:{title:'The Two Ropes',question:'Two ropes are equally long. A third rope is exactly as long as the two put together. Which statement must be true?',choices:['The third is three times either rope','The third is twice either rope','All three ropes are equal','The third is half either rope'],answer:1,hints:['Call the equal length L.','Together the first two ropes measure L + L.','L + L equals 2L.','Answer: The third rope is twice either individual rope.'],success:'Pip finds the correct lengths and knots the rigging.'},
 bridge:{title:'The Bridgebuilder’s Riddle',question:'Eight support beams must be divided equally between two arches. How many beams go under each arch?',choices:['2','3','4','6'],answer:2,hints:['The arches must have equal support.','Divide the number of beams by the number of arches.','Eight divided by two is four.','Answer: 4 beams per arch.'],success:'With the last supports in place, the bridge is safe to cross.'}
};
// With exactly one open gate, A/B/C statements give truth counts respectively 1/2/3.
// Keep the gate challenge unambiguous and make B the only two-truth outcome.
puzzles.sluice.question='Three gates A, B and C stand in a row. Exactly one is open. A says “B is closed.” B says “C is closed.” C says “A is closed.” Exactly TWO statements are true. Which gate is open?';
puzzles.sluice.answer=0;
puzzles.sluice.hints=['Only one gate can be open. Test each candidate.','If A is open, the first two statements are true.','If B or C is open, the truth count changes.','Answer: Gate A. B and C are closed, so A and B speak truth; C lies.'];
// Recheck: A open => B closed TRUE, C closed TRUE, A closed FALSE. B open => FALSE TRUE TRUE; C open=> TRUE FALSE TRUE. All 2! Replace with unique logic.
puzzles.sluice.question='Three gates A, B and C. Exactly one is open. A says “Gate B is open.” B says “Gate C is closed.” C says “Gate A is closed.” Exactly ONE statement is true. Which gate is open?';
puzzles.sluice.answer=0;
puzzles.sluice.hints=['Test the three possible open gates.','If A is open: A lies, B tells the truth, C lies.','If B or C is open, the number of truthful statements is not one.','Answer: Gate A. Only B’s statement is true.'];
// Check B open => A true, B true, C true (3). C open => A false, B false, C true (1). Duplicate! Fix with statements truth patterns A, B, C: exactly one only B: A says B open, B says A closed, C says C closed. Aopen=>F F T 1, Bopen=>T T T 3, Copen=>F T F 1. Still duplicate. Use puzzle with explicit arithmetic instead.
puzzles.sluice.question='A sluice wheel has twelve teeth. A full rotation opens the gate. Each pull turns the wheel by three teeth. How many pulls are needed?';
puzzles.sluice.choices=['Three','Four','Five','Six'];
puzzles.sluice.answer=1;
puzzles.sluice.hints=['A complete turn covers all twelve teeth.','Each pull moves three teeth.','Divide twelve by three.','Answer: Four pulls. 12 ÷ 3 = 4.'];

/* Chapter puzzles use one verifiable solution and four progressively explicit clues. */
Object.assign(puzzles,{
 cell:{title:'The Prison Levers',question:'Four levers A, B, C and D must be pulled once. A must be before C; B must be immediately after D; C must be last. Which order is valid?',choices:['A – D – B – C','D – A – B – C','A – B – D – C','D – B – C – A'],answer:0,hints:['Start with the lever which must be last.','D and B must sit together, in that order.','Check that A is before the final C.','Answer: A – D – B – C.'],success:'The mechanism releases the old drain beneath the toilet.'},
 sluice:{title:'The Three Sluices',question:'Exactly one of gates A, B and C is open. A says “B is open.” B says “C is open.” C says “B is closed.” Exactly TWO of the statements are true. Which gate is open?',choices:['A','B','C','None'],answer:2,hints:['Test each possible open gate and count true statements.','If A is open, only C is telling the truth.','If C is open, B and C are both correct.','Answer: C. A lies, while B and C speak the truth.'],success:'The third sluice groans aside, revealing the passage.'},
 lantern:{title:'The Lantern Crossing',question:'Three travellers cross a dark bridge with one lantern. Their crossing times are 1, 4 and 7 minutes. At most two cross together, moving at the slower pace, and the lantern must be carried on every trip. What is the MINIMUM total time?',choices:['11 minutes','12 minutes','13 minutes','15 minutes'],answer:1,hints:['Someone must carry the lantern back after the first crossing.','The fastest traveller should return with it.','Cross 1 and 4 (4 min), return 1 (1 min), cross 1 and 7 (7 min).','Answer: 12 minutes. 4 + 1 + 7 = 12.'],success:'The three travellers’ route shows Oliver the safest way through.'},
 lumber:{title:'The Carpenter’s Cut',question:'You need a beam exactly 7 units long. Joining two boards costs 1 unit of length at the joint. You have boards of lengths 2, 3, 4 and 5. Which two should you join?',choices:['2 and 5','3 and 4','3 and 5','4 and 5'],answer:2,hints:['A joint makes the finished beam shorter.','The two starting boards must add up to 8.','Of the pairs given, only 3 and 5 sum to 8.','Answer: 3 and 5. The joint costs 1, leaving 7.'],success:'Baker Bea shows you the perfect planks and sends them to the bridge.'},
 ropes:{title:'The Rope Merchant',question:'One rope is 6 metres, another is 9 metres. Tying them together uses 1 metre from EACH rope in the knot. How much usable rope remains?',choices:['15 metres','14 metres','13 metres','12 metres'],answer:2,hints:['First add the lengths of the two ropes.','The knot consumes material from both ropes.','Subtract two metres from the combined fifteen.','Answer: 13 metres. 6 + 9 – 1 – 1 = 13.'],success:'Courier Nox gives Pip the correctly measured rope.'},
 bridge:{title:'The Five Bridge Posts',question:'Five bridge posts stand in a straight row, each adjacent pair exactly 2 metres apart. How far is it from the FIRST post to the FIFTH?',choices:['6 metres','8 metres','10 metres','12 metres'],answer:1,hints:['Count the spaces, not the posts.','Five posts leave four gaps.','Each of the four gaps is two metres.','Answer: 8 metres. Four gaps times two metres.'],success:'The supports are correctly spaced. The bridge is repaired!'}
});

let engine=null,baseWorld=null,scene='intro',chapter={scene:'intro',flags:{},coins:[],step:0,position:null},activePuzzle=null,hintLevel=0,modalKind='';
const complete=id=>!!chapter.flags[id];
function persist(){try{if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};chapter.scene=scene;localStorage.setItem(KEY,JSON.stringify(chapter));}catch{}}
function restored(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','village','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins)){v.coins=v.coins.slice(0,1);if(!Number.isInteger(v.step)||v.step<0)v.step=0;return v;}}catch{}return chapter;}
function createWorld(width,height,kind){const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'H':kind));return {width,height,tiles:rows.map(a=>a.join('')),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:3,y:5},version:baseWorld.version,music:'default'};}
function updateTile(w,x,y,v){const r=w.tiles[y].split('');r[x]=v;w.tiles[y]=r.join('');}
function cellWorld(){const w=createWorld(15,11,'s');for(let x=1;x<14;x++)updateTile(w,x,2,'H');for(let y=3;y<=8;y++){updateTile(w,2,y,y===5?'s':'H');updateTile(w,13,y,'H');}updateTile(w,11,7,'p');w.spawn={x:7,y:7};w.music='prison';return w;}
function sewerWorld(){const w=createWorld(36,13,'H');for(let x=1;x<35;x++){for(const y of [2,3,9,10])updateTile(w,x,y,'w');for(let y=4;y<=8;y++)updateTile(w,x,y,y===6?'p':'s');}for(const x of [12,24])for(let y=4;y<=8;y++)updateTile(w,x,y,'H');if(complete('sluice'))updateTile(w,12,6,'p');if(complete('lantern'))updateTile(w,24,6,'p');for(const x of [4,9,18,28,33]){updateTile(w,x,5,'s');updateTile(w,x,7,'s');}w.spawn={x:3,y:6};w.music='sewer';return w;}
function villageWorld(){const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.map(n=>({...n,lines:[...n.lines]}))};for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');w.npcs=w.npcs.filter(n=>!(complete('pip')&&n.id==='pip')).map(n=>n.id==='pip'?{...n,lines:['Oliver, I believe you. Let us repair the bridge.']}:n);w.spawn={x:26,y:29};return w;}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():villageWorld();const pos=position||({...w.spawn,facing:'down'});engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;}
function say(name,...lines){engine.say(name,lines);}
function objective(){if(scene==='cell')return complete('cell')?'The drain is open. Press E at the toilet to escape.':complete('inspectedToilet')?'Find the mechanism beneath the toilet. Press E to examine it.':'Find a way out of the prison cell.';if(scene==='sewer')return !complete('sluice')?'Find the sluice wheel. Press E to operate it.':!complete('lantern')?'Inspect the lantern station at the second gate (E).':!complete('merrick')?'Speak to the bishop by the stone archway (E).':'Investigate the tunnel exit to Willowmere (E).';if(!complete('pip'))return 'Meet Pip near the village square.';if(!complete('lumber'))return 'Ask Baker Bea about timber for the broken bridge.';if(!complete('ropes'))return 'Find Courier Nox and work out the ropes.';if(!complete('bridge'))return 'Go to the east bridge and solve the final engineering puzzle.';return 'The bridge is restored. Chapter One complete!';}
function updateObjective(){$('fallen-story-objective').textContent=objective();$('fallen-story-objective').hidden=scene==='intro';const detail=$('fallen-story-interact');if(detail)detail.hidden=true;}
function start(api){engine=api;baseWorld=api.getWorld();chapter=restored();if(chapter.scene==='intro'){scene='intro';showIntro();}else setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);if(chapter.scene!=='intro')$('fallen-story-intro').hidden=true;document.addEventListener('keydown',onKey,true);$('fallen-story-next').addEventListener('click',nextIntro);$('fallen-story-skip')?.addEventListener('click',()=>{if(scene!=='intro')return;engine.enableSound();chapter.step=steps.length;const intro=$('fallen-story-intro');intro.hidden=true;setScene('cell',{x:7,y:7,facing:'right'});say('Oliver','A locked cell. The old toilet might conceal a way out.');});$('fallen-story-art').addEventListener('click',nextIntro);$('fallen-story-puzzle-close').addEventListener('click',closePuzzle);$('fallen-story-hint').addEventListener('click',showHint);$('fallen-story-answers').addEventListener('click',pickAnswer);$('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});updateObjective();}
function blockedInput(){return scene==='intro'||!!activePuzzle;}
function onKey(e){if(!blockedInput())return;const k=e.key.toLowerCase();if(['e','enter',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(scene==='intro')nextIntro();else if(activePuzzle&&k!=='e'&&k!==' '&&k!=='enter'){}return;}if(k==='escape'&&activePuzzle){e.preventDefault();e.stopImmediatePropagation();closePuzzle();}if(scene==='intro'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}}
function showIntro(){scene='intro';$('fallen-story-intro').hidden=false;const step=steps[Math.min(chapter.step,steps.length-1)];engine.setWorld(introWorld(step.scene),{x:9,y:6,facing:'down'});$('fallen-story-intro-title').textContent=step.title;$('fallen-story-intro-speaker').textContent=step.speaker;$('fallen-story-intro-text').textContent=step.text;$('fallen-story-next').textContent=chapter.step===steps.length-1?'Begin escape →':'Continue →';drawIntroImage(step.scene);persist();}
function nextIntro(){if(scene!=='intro')return;engine.enableSound();if(chapter.step===0)engine.soundCue();chapter.step++;if(chapter.step>=steps.length){$('fallen-story-intro').hidden=true;setScene('cell',{x:7,y:7,facing:'right'});say('Oliver','An old toilet. A barred door. And a puzzle carved into the drain.');}else showIntro();}
function introWorld(kind){const w=createWorld(18,12,'s');w.music=['theft','approach'].includes(kind)?'theft':kind==='prison'?'prison':'palace';return w;}
function drawIntroImage(){const c=$('fallen-story-art').getContext('2d');c.fillStyle='#273944';c.fillRect(0,0,640,360);}
function renderIntroFrame(canvas){if(scene!=='intro'||$('fallen-story-intro').hidden)return;const c=$('fallen-story-art').getContext('2d');c.imageSmoothingEnabled=false;try{c.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,640,360);}catch{}}
function isIntro(){return scene==='intro';}
function isPrisoner(){return scene==='cell'||scene==='sewer';}
function musicTheme(){if(scene==='intro')return ['theft','approach'].includes(steps[Math.min(chapter.step,steps.length-1)].scene)?'theft':steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?'prison':'palace';return scene==='cell'?'prison':scene==='sewer'?'sewer':'willowmere';}
function openPuzzle(id){if(complete(id))return;engine.soundCue();activePuzzle=id;hintLevel=0;const p=puzzles[id];$('fallen-story-puzzle-name').textContent=p.title;$('fallen-story-question').textContent=p.question;$('fallen-story-feedback').textContent='Think carefully. The first three hints give clues; the fourth reveals the answer.';$('fallen-story-answers').replaceChildren(...p.choices.map((value,i)=>{const b=document.createElement('button');b.type='button';b.dataset.choice=String(i);b.textContent=String.fromCharCode(65+i)+'. '+value;return b;}));$('fallen-story-hint').disabled=false;$('fallen-story-hint').textContent='Hint 1 of 4';$('fallen-story-puzzle').hidden=false;}
function closePuzzle(){activePuzzle=null;$('fallen-story-puzzle').hidden=true;document.getElementById('fallen-canvas').focus({preventScroll:true});}
function showHint(){if(!activePuzzle)return;const p=puzzles[activePuzzle];hintLevel=Math.min(4,hintLevel+1);$('fallen-story-feedback').textContent='HINT '+hintLevel+': '+p.hints[hintLevel-1];$('fallen-story-hint').textContent=hintLevel===4?'All hints revealed':'Hint '+(hintLevel+1)+' of 4';$('fallen-story-hint').disabled=hintLevel===4;if(hintLevel===4&&chapter.coins.length){chapter.coins.pop();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;persist();}}
function pickAnswer(e){const b=e.target.closest('button[data-choice]');if(!b||!activePuzzle)return;const id=activePuzzle;if(+b.dataset.choice!==puzzles[id].answer){$('fallen-story-feedback').textContent='Not quite. Examine each clue and try again.';return;}chapter.flags[id]=true;closePuzzle();if(scene==='sewer')setScene('sewer',engine.getPlayer());else if(scene==='village')setScene('village',engine.getPlayer());else persist();say('Oliver',puzzles[id].success);updateObjective();}
// Movement never opens a puzzle. Controls and discoveries require an explicit E/Enter/Space action.
function beforeMove(x,y){if(scene==='cell'){if(x===11&&y===7)return true;return false;}
 if(scene==='sewer'){if((x===12&&y===6&&!complete('sluice'))||(x===24&&y===6&&!complete('lantern'))||(x>=34&&y===6))return true;return false;}
 if(scene==='village'&&x>=45&&x<=47&&y===19&&!complete('bridge'))return true;
 return false;}
const coinSpots={cell:[[3,8]]};
function afterMove(){const p=engine.getPlayer();if(scene==='village'&&!complete('pip')&&Math.abs(p.x-28)+Math.abs(p.y-21)<=2){chapter.flags.pip=true;setScene('village',p);say('Pip','You really are King Oliver? The villagers think you are joking.','I believe you. I will help you reach the eastern bridge!');}
 if(scene==='village'&&complete('bridge')&&p.x>=48&&p.y===19&&!complete('chapterEnd')){chapter.flags.chapterEnd=true;say('Pip','The road east is open! Our adventure has only begun.');}
 persist();updateObjective();}
function near(p,x,y,r=2){return Math.abs(p.x-x)+Math.abs(p.y-y)<=r;}
function talk(){if(!engine||blockedInput())return blockedInput();const p=engine.getPlayer(),{x,y}=p;
 if(scene==='cell'){
  if(near(p,11,7,2)){if(!complete('inspectedToilet')){chapter.flags.inspectedToilet=true;say('Oliver','A filthy old toilet. Wait... four levers are hidden beneath the porcelain.','The drain may lead below the castle. I should examine those levers.');}
   else if(!complete('cell'))openPuzzle('cell');
   else{setScene('sewer',{x:3,y:6,facing:'right'});say('Oliver','I drop through the opened drain into a vast underground waterway. The castle is above me now.');}
   persist();updateObjective();return true;}
  if(near(p,4,4,2)){say('Oliver','The prison bed is cold stone and straw. No blanket, no belongings.');return true;}
  if(y<=4){say('Oliver','Iron bars, a locked gate and a torchlit corridor. Guards may return at any moment.');return true;}
  if(!complete('coinFound')&&near(p,3,8,1)){chapter.flags.coinFound=true;chapter.coins=['one-hidden-coin'];$('fallen-story-hintcoins').textContent='Hint coins: 1';say('Oliver','One hint coin hidden beneath a loose stone. I should save it for later.');persist();return true;}
  if(x<=4){say('Oliver','A narrow barred window. I can see a pale sliver of daylight, far beyond my reach.');return true;}
  say('Oliver','Wet stone, a rusty bucket and the smell of rain. There must be some way out.');return true;
 }
 if(scene==='sewer'){
  if(near(p,11,6,2)&&!complete('sluice')){openPuzzle('sluice');return true;}
  if(near(p,23,6,2)&&!complete('lantern')){openPuzzle('lantern');return true;}
  if(x>=27&&x<=33&&near(p,30,6,4)&&!complete('merrick')){openPuzzle('merrick');return true;}
  if(x>=32&&y>=4&&y<=8){if(!complete('merrick'))say('Mysterious Bishop','Solve my riddle before you go.');else{setScene('village',{x:26,y:29,facing:'up'});say('Oliver','Fresh air. At last! Willowmere lies ahead.');}return true;}
  say('Oliver','Water rushes through a stone channel. Rusted pipes, moss, and the echoes of the castle above.');return true;
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
function customScene(){return scene==='intro'||scene==='cell'||scene==='sewer';}

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
function drawProps(g){
 const {box,cylinder,cone,sphere,piece,features,recliningKing}=g;
 const rock='#687076',iron='#253945',wood='#785943',ivory='#e7ddc8';
 const brass='#d6b46b',royal='#a3474f',azure='#517488',moss='#416c65';
 function wall(x,z,w=1,h=1.8){box(x,h/2,z,w,h,.86,rock);box(x,h-.08,z,w,.15,.92,'#ada79a');box(x,h*.53,z,w,.08,.93,'#495960');}
 function rails(a,b,z){box((a+b)/2,1.98,z,b-a,.14,.16,iron);box((a+b)/2,.18,z,b-a,.14,.16,iron);for(let x=a+.25;x<b;x+=.53)cylinder(x,.98,z,.067,.067,1.83,iron,7);}
 function bed(x,z){box(x,.22,z,3.1,.40,1.65,wood);box(x,.53,z,2.95,.18,1.45,'#a5a79f');box(x-1,.67,z,.80,.12,1.23,ivory);box(x+.6,.66,z,1.4,.10,1.38,'#728894');for(const a of [-1.36,1.36])for(const b of [-.65,.65])box(x+a,.27,z+b,.16,.54,.17,'#5b4334');}
 function toilet(x,z){box(x,.36,z-.3,.9,.7,.65,'#aeb4ae');cylinder(x,.57,z+.18,.5,.5,.22,ivory,12);cylinder(x,.7,z+.18,.35,.35,.06,'#becbca',12);cylinder(x,.73,z+.18,.21,.21,.06,'#416477',12);box(x,.87,z-.53,.77,.14,.15,ivory);box(x+.33,.77,z-.59,.10,.18,.12,'#ad9f78');}
 function torch(x,z){box(x,.84,z,.22,.36,.2,wood);cone(x,1.16,z,.15,.38,'#e5a94d',8);sphere(x,1.34,z,.12,'#ffe0a0',8);}
 function banner(x,z,c=royal){box(x,1.85,z,.65,1.48,.07,c);box(x,2.60,z,.77,.10,.13,brass);box(x,1.05,z,.70,.12,.13,brass);box(x,2.05,z+.06,.16,.18,.08,brass);}
 function tapestry(x,z){box(x,1.85,z,1.10,1.45,.09,'#784157');box(x,2.60,z,1.2,.10,.18,brass);for(let i=0;i<3;i++)box(x+(i-1)*.25,1.55,z+.065,.09,.58,.07,brass);}
 function pipe(x,z,length=3){cylinder(x,1.4,z,.24,.24,length,'#697e7a',10);cylinder(x,1.4,z,.28,.28,.12,'#b3a97e',10);}
 function arch(x,z){for(const dx of [-1.7,1.7]){box(x+dx,1.3,z,.37,2.6,.44,'#8a9991');box(x+dx,2.35,z,.49,.19,.52,'#a7ad9d');}box(x,2.68,z,3.8,.40,.5,'#6d7d7b');box(x,2.93,z,3.1,.12,.57,'#4a655f');}
 function king(x,z,prisoner=false){const type=prisoner?'P':'K';piece(x,z,type,'white',false);features(x,z,type,'white',false,'aldric');if(prisoner)box(x,.58,z+.3,.48,.42,.08,'#b8aa96');}
 function edwin(x,z,disguised){piece(x,z,'K',disguised?'white':'black',false);features(x,z,'K',disguised?'white':'black',false,disguised?'aldric':'scholar');if(!disguised){cone(x,2.29,z,.30,.56,'#543d65',8);box(x,.74,z+.27,.55,.30,.13,'#74516c');}}
 if(scene==='intro'){
  const kind=steps[Math.min(chapter.step,steps.length-1)].scene;
  for(let x=0;x<18;x++){wall(x+.5,.5,1,2.9);wall(x+.5,11.5,1,1.2);if(x%3===0)box(x+.5,2.95,.62,.30,.25,1.3,'#c0ae87');}
  for(let z=1;z<11;z++){wall(.5,z+.5,1,2.4);wall(17.5,z+.5,1,2.4);}
  for(let x=2;x<18;x+=4)box(x,.05,6,.06,.10,9,'#beaa8a');
  if(kind!=='prison'){for(const x of [3,7,11,15]){box(x,1.25,.95,.88,2.5,.4,'#b5a48b');tapestry(x,1.19);}for(const x of [2,16]){cylinder(x,.83,6,.36,.36,1.66,'#d8c599',10);sphere(x,1.76,6,.34,'#e4d3ad',10);}for(let z=2;z<11;z+=3)banner(17.04,z+.5,royal);}
  if(['bedroom','approach','theft'].includes(kind)){
    box(9,.07,4,10,.12,5,'#9b7659');bed(9,5);
    box(3.8,1.0,3.2,1.4,2,.22,'#704751');box(3.8,1.03,3.36,1.2,1.6,.07,'#d4b26b');
    // The royal crown is kept on an obvious velvet-topped pedestal beside Oliver's bed.
    box(13.8,.47,5.1,1.65,.94,1.25,wood);box(13.8,.98,5.1,1.7,.14,1.29,'#d2bd97');box(13.8,1.11,5.1,1.25,.15,.92,'#8f3f59');
    if(kind!=='theft'){cylinder(13.8,1.25,5.1,.44,.44,.19,brass,11);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;cone(13.8+Math.cos(a)*.36,1.38,5.1+Math.sin(a)*.36,.095,.36,'#f3d57e',6);}sphere(13.8,1.51,5.1,.15,'#cf445a',8);}else box(13.8,1.22,5.1,.65,.07,.60,'#753c4c');
    box(4.1,1.20,8,1.6,2.4,.14,'#b59c78');for(let k=0;k<4;k++)box(4.1+(k-1.5)*.32,1.28,8.09,.04,1.8,.06,'#d6c29c');
    box(9,.11,8.7,7.3,.15,2.1,'#9c6a56');box(9,.19,8.7,6.7,.05,1.7,'#b89975');
    for(const x of [2.5,16])torch(x,2.9);
    // The real chess-piece mesh is reclined on the pillow, not replaced by a different drawing.
    if(recliningKing)recliningKing(9,5);else{box(8.8,.84,5,2.15,.35,.74,'#e6dbbf');sphere(8.0,1.05,5,.39,'#e8ddc5',12);}
    box(9.6,.88,5,.72,.10,1.26,'#8e5470');
    if(kind==='approach')edwin(15.1,8.7,false);
    if(kind==='theft'){edwin(13.0,7.4,false);cylinder(12.55,2.19,7.0,.36,.36,.15,brass,9);for(const n of [-1,0,1])cone(12.55+n*.23,2.33,7.0,.10,.29,'#f2d17b',7);}
  }else if(kind==='throne'){
    box(9,.62,3.8,3.4,1.24,1.4,'#916b54');box(9,1.42,3.7,2,1.6,.47,'#a44b53');
    // Edwin wears the crown and royal disguise; Oliver remains unmistakably crownless.
    edwin(9,5.3,true);cylinder(9,2.45,5.3,.47,.47,.15,brass,10);for(const n of [-1,0,1])cone(9+n*.3,2.57,5.3,.10,.31,'#e9cf7a',7);
    piece(8.5,9,'P','white',false);features(8.5,9,'P','white',false,'aldric');box(8.5,.6,9.29,.52,.47,.11,'#a8a08d');
    piece(5.2,7.5,'R','white',false);piece(12.8,7.5,'R','white',false);torch(3,3);torch(15,3);
    for(const x of [3.3,14.7]){tapestry(x,1.22);cylinder(x,.73,3.7,.42,.42,1.46,'#d2c2a0',12);}
  }else{
    for(let x=1;x<17;x++)wall(x+.5,2,1,1.8);
    // Dungeon establishing shot: real cell block and narrow corridor beyond the gate.
    for(const x of [4,8,12]){box(x,2.1,2.8,.88,2.8,.7,'#343f45');rails(x-.36,x+.36,3.25);}
    for(const x of [3,7,11,15]){box(x,2.7,1.4,.35,.28,5.2,'#4c5256');}
    rails(3,15,6);bed(5,8.5);toilet(12,8.5);king(9,8.9,true);torch(15,3);
  }
  drawMicroDetail(g,kind);
  return;
 }
 if(scene==='cell'){
  // A solid enclosed room, a cell-block corridor BEHIND the bars and an overhead beam.
  for(let x=0;x<15;x++){wall(x+.5,.5,1,2.2);box(x+.5,2.25,.5,1,.2,.9,'#999b92');box(x+.5,.13,10.5,1,.26,.8,'#546269');}
  // The far wall contains shadowed entrances to neighbouring cells along the corridor.
  for(const x of [3,7,11]){box(x,1.2,.98,1.3,1.9,.17,'#26353e');rails(x-.52,x+.52,1.09);}
  for(const x of [3,7,11]){box(x,2.60,1.6,.40,.45,2.3,'#7d8585');}
  for(let z=1;z<11;z++){wall(.5,z+.5,.8,2.1);wall(14.5,z+.5,.8,2.1);}
  for(let x=1;x<14;x++){box(x+.5,.07,1.35,1,.14,1.4,'#747e7b');if(x%2===0)box(x+.5,2.29,1.7,.18,.32,2.4,'#8c928c');}
  rails(1.1,13.9,2.15);
  // Blue-tinted, iron-barred window set into the west wall.
  box(1,1.56,5.6,.16,.84,1.6,'#93b9bc');
  for(const z of [5.1,5.6,6.1])box(1.09,1.57,z,.16,.98,.07,iron);
  for(const y of [1.16,1.98])box(1.1,y,5.6,.16,.08,1.7,iron);
  bed(4.6,4.2);toilet(11.5,7.5);cylinder(11.5,.07,7.5,.70,.70,.11,'#73746d',12);
  box(12.5,.55,7.0,.22,1.1,.22,'#7c8382');box(12.2,1.08,7,.7,.15,.2,'#7c8382');
  // Loose stone for the one hidden coin, a wooden bucket, chains and damp stains.
  box(3,.12,8.7,.78,.20,.66,'#9a9688');box(3,.24,8.7,.36,.05,.35,'#b7b0a0');
  cylinder(5.4,.28,8.6,.31,.32,.52,'#665343',10);cylinder(5.4,.57,8.6,.35,.35,.08,'#b6a282',10);
  for(const x of [7.3,7.6]){for(let y=.9;y<1.9;y+=.28)cylinder(x,y,10.04,.055,.055,.20,'#536069',7);}torch(13,1.45);
  box(12.5,1.05,2.35,.30,.46,.16,'#c4a26d');
  drawMicroDetail(g,'cell');
 }else if(scene==='sewer'){
  // Long underground aqueduct: two open flowing channels, raised central stone walk, vaulted ribs and major sluice machinery.
  for(let x=0;x<36;x++){wall(x+.5,.5,1,2.5);wall(x+.5,12.5,1,2.5);if(x%3===0){box(x+.5,2.6,2.25,.27,.28,3.0,'#65746f');box(x+.5,2.6,10.75,.27,.28,3.0,'#65746f');}}
  for(let x=1;x<35;x++){box(x+.5,.10,4.1,1,.20,.34,'#b0ad98');box(x+.5,.10,8.9,1,.20,.34,'#b0ad98');box(x+.5,.19,6.5,1,.11,1.7,x%2?'#687f7b':'#758c87');}
  for(const x of [4,10,16,22,28,34]){arch(x,6.5);pipe(x,2.0,3.0);pipe(x,11,3.0);box(x,2.8,6.5,3.7,.20,.54,'#6a817b');}
  for(let x=2;x<35;x+=4){box(x,1.25,1.55,.36,1.0,.55,'#526560');box(x,1.25,11.45,.36,1.0,.55,'#526560');}
  for(const x of [5,11,18,23,29,33]){cylinder(x,.20,3.2,.21,.21,.22,'#b7a475',10);cylinder(x,.20,9.8,.21,.21,.22,'#b7a475',10);} 
  for(const x of [12,24]){for(let y=4;y<=8;y++)if((x===12&&!complete('sluice')||x===24&&!complete('lantern'))||y!==6)wall(x+.5,y+.5,.88,1.4);
    // Sluice wheel and clear machine to interact with via E (never proximity-triggered).
    box(x-.6,.78,5.5,.66,1.45,.42,'#697a75');cylinder(x-.6,1.1,5.78,.66,.66,.15,'#d4bb83',12);for(let k=0;k<8;k++){const t=k*Math.PI/4;box(x-.6+Math.cos(t)*.43,1.1+Math.sin(t)*.43,5.88,.12,.12,.20,'#d8c99a');}
    box(x-.8,.15,6.5,.54,.28,1.5,'#b3aa8c');}
  for(let x=2;x<35;x+=3){cylinder(x+.5,.16,10.4,.29,.29,.26,'#526e67',8);box(x+.5,.34,10.4,.20,.12,.23,'#809c7c');}
  for(let x=3;x<35;x+=5){box(x,.4,4.45,.95,.7,.14,'#7c8d85');box(x,.38,8.50,.95,.7,.14,'#7c8d85');}
  // Drips and algae above the moving canal; recurring lanterns mark the correct route.
  for(let x=2;x<35;x+=6){for(let z of [2.2,10.8]){cone(x,2.15,z,.12,.68,'#4b7460',7);cone(x+.55,2.15,z,.08,.49,'#517d65',7);}}
  for(let x=3;x<36;x+=6)torch(x,1.5);
  piece(30.5,5.5,'B','black',false);features(30.5,5.5,'B','black',false,'scholar');
  box(33.5,.25,6.5,.9,.5,.4,'#a2a58f');box(34,.70,6.5,.16,.92,1.2,'#a8af9e');
  for(const z of [4.4,8.5])box(33.2,.92,z,.45,1.76,.42,'#b0b3a3');
  drawMicroDetail(g,'sewer');
 }
}
function drawVillageProps(g){
 if(scene!=='village')return;
 const {box,cylinder,cone}=g,done=complete('bridge');
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
 if(scene==='village'){
  const {box,sphere}=g,drift=(t*.39)%1;
  for(let x=45;x<48;x++)for(const z of [16.8,19.5,22.2]){
   box(x+.2+drift*.5,.055,z,.42,.02,.055,'#b6d9bd');
   box(x+.45-drift*.3,.06,z+.30,.26,.014,.04,'#8dbec0');
  }
  for(const x of [42.5,49.3])sphere(x,1.30+Math.sin(t*7+x)*.025,18,.15,'#efd19a',7);
  return;
 }
 if(scene!=='sewer')return;
 const {box,sphere}=g;
 // Water glints drift along both channels; distant drips and bubbles move each frame.
 const shift=(t*.65)%1;
 for(let x=2;x<35;x+=3){for(const z of [2.5,9.5]){
  const phase=(x*.27+shift)%1;
  box(x+.35+phase,.12,z,.40,.018,.07,'#8abfb6');
  box(x+.80-phase,.14,z+.37,.23,.015,.05,'#689eac');
 }}
 for(const x of [6,14,22,30]){const p=(t*.6+x*.11)%2.1;
  sphere(x+.3,.09+p*.48,3.25,.055,'#b0c9b5',6);
  sphere(x+.7,.09+(p*.6),9.85,.042,'#96b6b7',6);
 }
}
function drawFollowers(g){if(scene==='village'&&complete('pip')){const p=engine.getPlayer(),x=p.x+(p.facing==='right'?-1:p.facing==='left'?1:0),y=p.y+(p.facing==='down'?-1:p.facing==='up'?1:1);if(x>=0&&x<engine.getWorld().width&&y>=0&&y<engine.getWorld().height){g.piece(x+.5,y+.5,'P','white',false);g.features(x+.5,y+.5,'P','white',false,'pip');}}}
window.FallenKingStory={start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,drawProps,drawVillageProps,drawEffects,drawFollowers,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();