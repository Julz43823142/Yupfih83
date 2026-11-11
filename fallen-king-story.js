(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2';
const steps=[
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'In the kingdom of Aldemar, King Oliver slept beneath the banners of his ancestors.'},
 {scene:'bedroom',title:'THE NIGHT THE CROWN FELL',speaker:'Narrator',text:'But someone was moving through the royal chambers. Someone who knew the castle better than the guards.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Edwin',text:'One crown. One convincing disguise. By dawn, the kingdom will kneel to me.'},
 {scene:'theft',title:'THE STOLEN CROWN',speaker:'Narrator',text:'Edwin took the crown and disguised himself as Oliver. By dawn, nobody in the castle knew who the real king was.'},
 {scene:'throne',title:'THE FALSE KING',speaker:'Edwin',text:'Guards! Seize that impostor. I am your king!'},
 {scene:'throne',title:'THE FALSE KING',speaker:'Oliver',text:'That is my face. My crown. How can none of them see?'},
 {scene:'prison',title:'THE KING BELOW',speaker:'Narrator',text:'The real king was thrown into a forgotten cell beneath his own castle.'},
 {scene:'prison',title:'THE KING BELOW',speaker:'Oliver',text:'They took my crown. They did not take my mind. There must be a way out.'}
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
function restored(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','village','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins))return v;}catch{}return chapter;}
function createWorld(width,height,kind){const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'H':kind));return {width,height,tiles:rows.map(a=>a.join('')),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:3,y:5},version:baseWorld.version,music:'default'};}
function updateTile(w,x,y,v){const r=w.tiles[y].split('');r[x]=v;w.tiles[y]=r.join('');}
function cellWorld(){const w=createWorld(15,11,'s');for(let x=1;x<14;x++)updateTile(w,x,2,'H');updateTile(w,11,7,'p');w.spawn={x:4,y:7};w.music='prison';return w;}
function sewerWorld(){const w=createWorld(36,13,'s');for(let y=1;y<12;y++){updateTile(w,12,y,'H');updateTile(w,24,y,'H');}if(complete('sluice'))updateTile(w,12,6,'p');if(complete('lantern'))updateTile(w,24,6,'p');for(let x=2;x<35;x++)updateTile(w,x,6,w.tiles[6][x]==='H'?w.tiles[6][x]:'p');w.spawn={x:2,y:6};w.music='sewer';return w;}
function villageWorld(){const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.map(n=>({...n,lines:[...n.lines]}))};for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');w.npcs=w.npcs.filter(n=>!(complete('pip')&&n.id==='pip')).map(n=>n.id==='pip'?{...n,lines:['Oliver, I believe you. Let us repair the bridge.']}:n);w.spawn={x:26,y:29};return w;}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():villageWorld();const pos=position||({...w.spawn,facing:'down'});engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;}
function say(name,...lines){engine.say(name,lines);}
function objective(){if(scene==='cell')return 'Find a way out of the prison cell. Examine the old toilet (E).';if(scene==='sewer')return !complete('sluice')?'Unlock the first sluice.':!complete('lantern')?'Solve the lantern passage.':!complete('merrick')?'Speak to the mysterious bishop.':'Find the exit to Willowmere.';if(!complete('pip'))return 'Meet Pip near the village square.';if(!complete('lumber'))return 'Ask Baker Bea about timber for the broken bridge.';if(!complete('ropes'))return 'Find Courier Nox and work out the ropes.';if(!complete('bridge'))return 'Go to the east bridge and solve the final engineering puzzle.';return 'The bridge is restored. Chapter One complete!';}
function updateObjective(){$('fallen-story-objective').textContent=objective();$('fallen-story-objective').hidden=scene==='intro';const detail=$('fallen-story-interact');if(detail){detail.hidden=scene==='intro';detail.textContent=scene==='cell'?'CELL GUIDE · Bed: west · Barred gate: north · Toilet: east · Walk to the toilet, then press E.':scene==='sewer'?'SEWERS · Follow the central walkway to the eastern exit.':'WILLOWMERE · Meet Pip, then help repair the eastern bridge.';}}
function start(api){engine=api;baseWorld=api.getWorld();chapter=restored();if(chapter.scene==='intro'){scene='intro';showIntro();}else setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);if(chapter.scene!=='intro')$('fallen-story-intro').hidden=true;document.addEventListener('keydown',onKey,true);$('fallen-story-next').addEventListener('click',nextIntro);$('fallen-story-skip')?.addEventListener('click',()=>{if(scene!=='intro')return;engine.enableSound();chapter.step=steps.length;const intro=$('fallen-story-intro');intro.hidden=true;setScene('cell',{x:4,y:7,facing:'right'});say('Oliver','A locked cell. The old toilet might conceal a way out.');});$('fallen-story-art').addEventListener('click',nextIntro);$('fallen-story-puzzle-close').addEventListener('click',closePuzzle);$('fallen-story-hint').addEventListener('click',showHint);$('fallen-story-answers').addEventListener('click',pickAnswer);$('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});updateObjective();}
function blockedInput(){return scene==='intro'||!!activePuzzle;}
function onKey(e){if(!blockedInput())return;const k=e.key.toLowerCase();if(['e','enter',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(scene==='intro')nextIntro();else if(activePuzzle&&k!=='e'&&k!==' '&&k!=='enter'){}return;}if(k==='escape'&&activePuzzle){e.preventDefault();e.stopImmediatePropagation();closePuzzle();}if(scene==='intro'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}}
function showIntro(){scene='intro';$('fallen-story-intro').hidden=false;const step=steps[Math.min(chapter.step,steps.length-1)];engine.setWorld(introWorld(step.scene),{x:9,y:6,facing:'down'});$('fallen-story-intro-title').textContent=step.title;$('fallen-story-intro-speaker').textContent=step.speaker;$('fallen-story-intro-text').textContent=step.text;$('fallen-story-next').textContent=chapter.step===steps.length-1?'Begin escape →':'Continue →';drawIntroImage(step.scene);persist();}
function nextIntro(){if(scene!=='intro')return;engine.enableSound();if(chapter.step===0)engine.soundCue();chapter.step++;if(chapter.step>=steps.length){$('fallen-story-intro').hidden=true;setScene('cell',{x:4,y:7,facing:'right'});say('Oliver','An old toilet. A barred door. And a puzzle carved into the drain.');}else showIntro();}
function introWorld(kind){const w=createWorld(18,12,'s');w.music=kind==='theft'?'theft':kind==='prison'?'prison':'palace';return w;}
function drawIntroImage(){const c=$('fallen-story-art').getContext('2d');c.fillStyle='#273944';c.fillRect(0,0,640,360);}
function renderIntroFrame(canvas){if(scene!=='intro'||$('fallen-story-intro').hidden)return;const c=$('fallen-story-art').getContext('2d');c.imageSmoothingEnabled=false;try{c.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,640,360);}catch{}}
function isIntro(){return scene==='intro';}
function isPrisoner(){return scene==='cell'||scene==='sewer';}
function musicTheme(){if(scene==='intro')return steps[Math.min(chapter.step,steps.length-1)].scene==='theft'?'theft':steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?'prison':'palace';return scene==='cell'?'prison':scene==='sewer'?'sewer':'willowmere';}
function openPuzzle(id){if(complete(id))return;engine.soundCue();activePuzzle=id;hintLevel=0;const p=puzzles[id];$('fallen-story-puzzle-name').textContent=p.title;$('fallen-story-question').textContent=p.question;$('fallen-story-feedback').textContent='Think carefully. The first three hints give clues; the fourth reveals the answer.';$('fallen-story-answers').replaceChildren(...p.choices.map((value,i)=>{const b=document.createElement('button');b.type='button';b.dataset.choice=String(i);b.textContent=String.fromCharCode(65+i)+'. '+value;return b;}));$('fallen-story-hint').disabled=false;$('fallen-story-hint').textContent='Hint 1 of 4';$('fallen-story-puzzle').hidden=false;}
function closePuzzle(){activePuzzle=null;$('fallen-story-puzzle').hidden=true;document.getElementById('fallen-canvas').focus({preventScroll:true});}
function showHint(){if(!activePuzzle)return;const p=puzzles[activePuzzle];hintLevel=Math.min(4,hintLevel+1);$('fallen-story-feedback').textContent='HINT '+hintLevel+': '+p.hints[hintLevel-1];$('fallen-story-hint').textContent=hintLevel===4?'All hints revealed':'Hint '+(hintLevel+1)+' of 4';$('fallen-story-hint').disabled=hintLevel===4;if(hintLevel===4&&chapter.coins.length){chapter.coins.pop();$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;persist();}}
function pickAnswer(e){const b=e.target.closest('button[data-choice]');if(!b||!activePuzzle)return;const id=activePuzzle;if(+b.dataset.choice!==puzzles[id].answer){$('fallen-story-feedback').textContent='Not quite. Examine each clue and try again.';return;}chapter.flags[id]=true;closePuzzle();if(scene==='sewer')setScene('sewer',engine.getPlayer());else if(scene==='village')setScene('village',engine.getPlayer());else persist();say('Oliver',puzzles[id].success);updateObjective();}
function beforeMove(x,y){if(scene==='cell'&&Math.abs(x-11)+Math.abs(y-7)<=1&&!complete('cell')){openPuzzle('cell');return true;}if(scene==='cell'&&x===11&&y===7){if(!complete('cell')){openPuzzle('cell');return true;}setScene('sewer',{x:2,y:6,facing:'right'});say('Oliver','The castle is above me. The only way is forward.');return true;}if(scene==='sewer'){if(x===12&&y===6&&!complete('sluice')){openPuzzle('sluice');return true;}if(x===24&&y===6&&!complete('lantern')){openPuzzle('lantern');return true;}if(x>=34&&y===6){if(!complete('merrick')){say('Mysterious Bishop','Not so fast. There is a question you must answer first.');openPuzzle('merrick');}else{setScene('village',{x:26,y:29,facing:'up'});say('Oliver','Fresh air. A village. Now I need someone to believe me.');}return true;}}if(scene==='village'&&x>=45&&x<=47&&y===19&&!complete('bridge')){if(!complete('pip'))say('Oliver','The eastern bridge has collapsed. I should ask someone in the village.');else if(!complete('lumber')||!complete('ropes'))say('Pip','We still need timber and ropes. Ask the villagers.');else openPuzzle('bridge');return true;}return false;}
const coinSpots={cell:[[3,3],[10,4]],sewer:[[6,9],[18,3],[29,9]],village:[[21,21],[38,27],[43,18]]};
function afterMove(){const p=engine.getPlayer();const spot=(coinSpots[scene]||[]).find(([x,y])=>Math.abs(p.x-x)+Math.abs(p.y-y)<=1);if(spot){const id=scene+':'+spot.join(':');if(!chapter.coins.includes(id)&&!chapter.flags['coin:'+id]){chapter.coins.push(id);chapter.flags['coin:'+id]=true;$('fallen-story-hintcoins').textContent='Hint coins: '+chapter.coins.length;say('Oliver','A hidden hint coin! I can save it for a difficult puzzle.');}}if(scene==='village'&&!complete('pip')&&Math.abs(p.x-28)+Math.abs(p.y-21)<=2){chapter.flags.pip=true;setScene('village',p);say('Pip','You really are King Oliver? Everyone else thinks you are joking.','I believe you. I will help you reach the eastern bridge!');}if(scene==='village'&&complete('bridge')&&p.x>=48&&p.y===19&&!complete('chapterEnd')){chapter.flags.chapterEnd=true;say('Pip','We did it! The road east is open.','This is only the beginning, Oliver.');}persist();updateObjective();}
function talk(){if(!engine||blockedInput())return blockedInput();const p=engine.getPlayer(),{x,y}=p;let object=null;if(scene==='cell'){if(Math.abs(x-11)+Math.abs(y-7)<=3){if(!complete('cell'))openPuzzle('cell');else{setScene('sewer',{x:2,y:6,facing:'right'});say('Oliver','I am through the drain. I must escape the sewers.');}return true;}if(x<5&&y<5){say('Oliver','A locked cell. No tools. The toilet drain is the only unusual thing here.');return true;}return false;}if(scene==='sewer'){if(Math.abs(x-12)+Math.abs(y-6)<=2&&!complete('sluice')){openPuzzle('sluice');return true;}if(Math.abs(x-24)+Math.abs(y-6)<=2&&!complete('lantern')){openPuzzle('lantern');return true;}if(x>=27&&x<=32&&Math.abs(y-6)<=3&&!complete('merrick')){openPuzzle('merrick');return true;}return false;}if(scene==='village'){if(Math.abs(x-28)+Math.abs(y-21)<=2&&!complete('pip')){chapter.flags.pip=true;setScene('village',p);say('Pip','I believe you, Oliver. We will find a way across the broken bridge.');persist();updateObjective();return true;}if(complete('pip')&&Math.abs(x-17)+Math.abs(y-19)<=2&&!complete('lumber')){openPuzzle('lumber');return true;}if(complete('lumber')&&Math.abs(x-16)+Math.abs(y-28)<=2&&!complete('ropes')){openPuzzle('ropes');return true;}if(x>=41&&y>=17&&y<=21){if(!complete('lumber')||!complete('ropes'))say('Pip','The bridge needs timber and ropes. Find the baker and courier.');else if(!complete('bridge'))openPuzzle('bridge');else say('Pip','The bridge is repaired. We can go east!');return true;}return false;}return false;}
function beforeHouse(){return false;}
function customScene(){return scene==='intro'||scene==='cell'||scene==='sewer';}
function drawProps(g){
 const {box,cylinder,cone,sphere,piece,features}=g;
 const rock='#687076',iron='#253945',wood='#785943',ivory='#e7ddc8';
 function wall(x,z,w=1,h=1.8){box(x,h/2,z,w,h,.86,rock);box(x,h-.08,z,w,.15,.92,'#ada79a');box(x,h*.53,z,w,.08,.93,'#495960');}
 function rails(a,b,z){box((a+b)/2,1.98,z,b-a,.14,.16,iron);box((a+b)/2,.18,z,b-a,.14,.16,iron);for(let x=a+.25;x<b;x+=.53)cylinder(x,.98,z,.067,.067,1.83,iron,7);}
 function bed(x,z){box(x,.22,z,3.1,.40,1.65,wood);box(x,.53,z,2.95,.18,1.45,'#a5a79f');box(x-1,.67,z,.80,.12,1.23,ivory);box(x+.6,.66,z,1.4,.10,1.38,'#728894');for(const a of [-1.36,1.36])for(const b of [-.65,.65])box(x+a,.27,z+b,.16,.54,.17,'#5b4334');}
 function toilet(x,z){box(x,.36,z-.3,.9,.7,.65,'#aeb4ae');cylinder(x,.57,z+.18,.5,.5,.22,ivory,12);cylinder(x,.7,z+.18,.35,.35,.06,'#becbca',12);cylinder(x,.73,z+.18,.21,.21,.06,'#416477',12);box(x,.87,z-.53,.77,.14,.15,ivory);box(x+.33,.77,z-.59,.10,.18,.12,'#ad9f78');}
 function torch(x,z){box(x,.84,z,.22,.36,.2,wood);cone(x,1.16,z,.15,.38,'#e5a94d',8);sphere(x,1.34,z,.12,'#ffe0a0',8);}
 function king(x,z,prisoner=false){const type=prisoner?'P':'K';piece(x,z,type,'white',false);features(x,z,type,'white',false,'aldric');if(prisoner)box(x,.58,z+.3,.48,.42,.08,'#b8aa96');}
 function edwin(x,z,disguised){piece(x,z,'K',disguised?'white':'black',false);features(x,z,'K',disguised?'white':'black',false,disguised?'aldric':'scholar');if(!disguised){cone(x,2.29,z,.30,.56,'#543d65',8);box(x,.74,z+.27,.55,.30,.13,'#74516c');}}
 if(scene==='intro'){
  const kind=steps[Math.min(chapter.step,steps.length-1)].scene;
  for(let x=0;x<18;x++){wall(x+.5,.5,1,2);wall(x+.5,11.5,1,1.2);}
  for(let z=1;z<11;z++){wall(.5,z+.5,1,1.8);wall(17.5,z+.5,1,1.8);}
  for(let x=2;x<18;x+=4)box(x,.05,6,.06,.10,9,'#beaa8a');
  if(kind==='bedroom'||kind==='theft'){
    box(9,.07,4,10,.12,5,'#9b7659');bed(9,5);
    box(3.8,1.0,3.2,1.4,2,.22,'#704751');box(3.8,1.03,3.36,1.2,1.6,.07,'#d4b26b');
    box(14.2,.55,3.8,1.1,1.1,.9,wood);cylinder(14.2,1.15,3.8,.40,.40,.11,'#d7b35d',12);
    // Oliver sleeping, horizontal stone-white torso, turned towards camera.
    box(8.8,.84,5,2.15,.35,.74,'#e6dbbf');sphere(7.38,.97,5,.40,'#e8ddc5',12);
    box(7.27,1.04,5.34,.085,.06,.06,'#3f4547');box(7.56,1.04,5.34,.085,.06,.06,'#3f4547');
    box(9.2,1.02,5,.94,.10,.7,'#c3aa73');
    if(kind==='theft'){edwin(12.2,7.3,false);box(12.95,2.42,7.4,.74,.11,.55,'#ddbb65');for(const n of [-1,0,1])cone(12.95+n*.22,2.52,7.4,.10,.26,'#f2d17b',7);}
  }else if(kind==='throne'){
    box(9,.62,3.8,3.4,1.24,1.4,'#916b54');box(9,1.42,3.7,2,1.6,.47,'#a44b53');
    edwin(9,5.3,true);king(8.5,9);piece(5.2,7.5,'R','white',false);piece(12.8,7.5,'R','white',false);torch(3,3);torch(15,3);
  }else{
    for(let x=1;x<17;x++)wall(x+.5,2,1,1.8);
    rails(3,15,6);bed(5,8.5);toilet(12,8.5);king(9,8.9,true);torch(15,3);
  }
  return;
 }
 if(scene==='cell'){
  // A solid enclosed room, a cell-block corridor BEHIND the bars and an overhead beam.
  for(let x=0;x<15;x++){wall(x+.5,.5,1,2.2);box(x+.5,2.25,.5,1,.2,.9,'#999b92');box(x+.5,.13,10.5,1,.26,.8,'#546269');}
  for(let z=1;z<11;z++){wall(.5,z+.5,.8,2.1);wall(14.5,z+.5,.8,2.1);}
  for(let x=1;x<14;x++){box(x+.5,.07,1.35,1,.14,1.4,'#747e7b');if(x%2===0)box(x+.5,2.29,1.7,.18,.32,2.4,'#8c928c');}
  rails(1.1,13.9,2.15);
  // Blue-tinted, iron-barred window set into the west wall.
  box(1,1.56,5.6,.16,.84,1.6,'#93b9bc');
  for(const z of [5.1,5.6,6.1])box(1.09,1.57,z,.16,.98,.07,iron);
  for(const y of [1.16,1.98])box(1.1,y,5.6,.16,.08,1.7,iron);
  bed(4.6,4.2);toilet(11.5,7.5);cylinder(11.5,.07,7.5,.70,.70,.11,'#73746d',12);
  box(12.5,.55,7.0,.22,1.1,.22,'#7c8382');box(12.2,1.08,7,.7,.15,.2,'#7c8382');
  box(3,.45,8.7,1.2,.22,.65,wood);torch(13,1.45);
  box(12.5,1.05,2.35,.30,.46,.16,'#c4a26d');
 }else if(scene==='sewer'){
  for(let x=0;x<36;x++){wall(x+.5,.5,1,1.6);wall(x+.5,12.5,1,1.6);}
  for(const x of [12,24])for(let y=1;y<12;y++)if((x===12&&!complete('sluice')||x===24&&!complete('lantern'))||y!==6)wall(x+.5,y+.5,.88,1.4);
  for(let x=2;x<35;x+=3){cylinder(x+.5,.08,10.4,.47,.47,.11,'#537d82',8);box(x+.5,.2,10.4,.24,.08,.24,'#819f89');}
  for(let x=3;x<36;x+=6)torch(x,1.5);
  piece(30.5,4.5,'B','black',false);features(30.5,4.5,'B','black',false,'scholar');box(33.5,.25,6.5,.9,.5,.4,'#a2a58f');
 }
}
function drawFollowers(g){if(scene==='village'&&complete('pip')){const p=engine.getPlayer(),x=p.x+(p.facing==='right'?-1:p.facing==='left'?1:0),y=p.y+(p.facing==='down'?-1:p.facing==='up'?1:1);if(x>=0&&x<engine.getWorld().width&&y>=0&&y<engine.getWorld().height){g.piece(x+.5,y+.5,'P','white',false);g.features(x+.5,y+.5,'P','white',false,'pip');}}}
window.FallenKingStory={start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,drawProps,drawFollowers,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();