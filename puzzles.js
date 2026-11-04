import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {attachChessBoardControls} from './chess-board-controls.js?v=puzzles-black-2';
import {appendChessArrow} from './chess-board-arrows.js?v=rainbow-1';
const $=id=>document.getElementById(id),board=$('puzzle-board'),status=$('puzzle-status');
const MODES={random:['Random Puzzle','Train with a random position.'],custom:['Custom Puzzle','Choose your target puzzle Elo.'],sprint:['Puzzle Sprint','Three or five minutes, three mistakes. How many can you solve?'],survival:['Puzzle Survival','Three mistakes, no time limit. Keep your streak alive.']};
const glyph={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
let mode='random',position=new Chess(),solution=[],step=0,puzzle=null,selected=null,lastMove=null;
let ready=false,busy=false,arrows=[],highlights=new Set(),wrongSquare=null,requestId=0,solved=0,misses=0,runActive=false;
let completedRun=null;
let deadline=0,startedAt=0,tick=null,auto=null,pendingPromotion=null,sprintMinutes=5,lastChallengeRating=0,orientation='white';const seen=new Set(),seenPositions=new Set(),cells=new Map();
function say(text,kind=''){status.textContent=text;status.className='puzzle-status'+(kind?' '+kind:'')}

let soundOn=true,audioCtx=null;
function unlockAudio(){
 if(!soundOn)return;
 try{
  const Ctor=window.AudioContext||window.webkitAudioContext;
  if(!Ctor)return;
  if(!audioCtx)audioCtx=new Ctor();
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
 }catch{}
}
// Short synthesised sounds — no third-party audio files.
function playSound(kind){
 if(!soundOn||!audioCtx||audioCtx.state!=='running')return;
 const patterns={
  move:[[420,.048,.08,'triangle']],
  capture:[[230,.068,.16,'triangle'],[145,.052,.10,'sine']],
  check:[[660,.075,.12,'triangle'],[940,.11,.11,'sine']],
  mate:[[520,.070,.14,'triangle'],[780,.085,.14,'triangle'],[1040,.17,.14,'sine']],
  end:[[390,.11,.12,'sine'],[260,.17,.12,'sine']]
 };
 let offset=0;
 for(const [frequency,duration,volume,wave] of patterns[kind]||patterns.move){
  const at=audioCtx.currentTime+offset,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(frequency,at);
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(volume,at+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(gain);gain.connect(audioCtx.destination);
  osc.start(at);osc.stop(at+duration+.015);
  offset+=duration*.85;
 }
}
board.addEventListener('pointerdown',unlockAudio);
board.addEventListener('keydown',unlockAudio);
function soundForMove(move){
 if(position.isCheckmate())playSound('mate');
 else if(position.isCheck())playSound('check');
 else playSound(move?.captured||move?.flags?.includes('e')?'capture':'move');
}

function clock(){return Math.max(0,Math.ceil((deadline-Date.now())/1000))}
function stats(){
 $('puzzle-elo').textContent=puzzle?.rating||'—';$('puzzle-solved').textContent=solved;
 $('puzzle-solved-label').textContent=mode==='sprint'||mode==='survival'?'Score':'Solved';
 $('puzzle-lives-box').hidden=mode!=='sprint'&&mode!=='survival';
 $('puzzle-time-box').hidden=mode!=='sprint';
 $('puzzle-lives').textContent='♥'.repeat(Math.max(0,3-misses))+'♡'.repeat(Math.min(3,misses));
 const sec=mode==='sprint'?(runActive?clock():sprintMinutes*60):0;
 $('puzzle-time').textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
}
function stopTimers(){if(tick)clearInterval(tick);tick=null;if(auto)clearTimeout(auto);auto=null}
function closePromotion(){pendingPromotion=null;$('puzzle-promotion').hidden=true;}
function buttons(){
 const challenge=mode==='sprint'||mode==='survival';
 $('puzzle-start').hidden=!challenge||runActive;$('puzzle-stop').hidden=!challenge||!runActive;
 $('puzzle-next').hidden=challenge;$('puzzle-next').disabled=busy;
 $('puzzle-hint').hidden=challenge;
 $('puzzle-hint').disabled=!ready||busy;
 $('puzzle-start').textContent=mode==='sprint'?'Start '+sprintMinutes+'-minute Sprint':'Start Survival';
 $('puzzle-sprint-settings').hidden=mode!=='sprint';
 document.querySelectorAll('[data-duration]').forEach(b=>{b.disabled=runActive;b.setAttribute('aria-pressed',String(Number(b.dataset.duration)===sprintMinutes));});
}
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
 const sq=String.fromCharCode(97+col)+(8-row),button=document.createElement('button');
 button.type='button';button.dataset.square=sq;button.className='puzzle-square '+((row+col)%2?'dark':'light');
 cells.set(sq,button);board.append(button);
}
function draw(){
 const moves=selected&&ready&&!busy?position.moves({square:selected,verbose:true}):[];
 for(const [sq,cell] of cells){
  const pc=position.get(sq),key=pc?pc.color+pc.type:'';
  if(cell.dataset.piece!==key){
   cell.dataset.piece=key;cell.replaceChildren();
   if(pc){
    const img=document.createElement('img');img.className='chess-piece';img.alt=pc.color+' '+pc.type;img.draggable=false;
    img.src='/vendor/pieces/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';
    img.onerror=()=>{img.remove();cell.textContent=glyph[pc.color][pc.type]};
    cell.append(img);
   }
  }else cell.querySelectorAll('.legal-move-dot,.legal-capture-ring').forEach(x=>x.remove());
  const whiteIndex=(8-Number(sq[1]))*8+(sq.charCodeAt(0)-97);
  cell.style.order=orientation==='black'?63-whiteIndex:whiteIndex;
  cell.classList.toggle('selected-square',selected===sq);
  cell.classList.toggle('recent-square',!!lastMove&&(lastMove.from===sq||lastMove.to===sq));
  cell.classList.toggle('wrong-square',wrongSquare===sq);
  cell.classList.toggle('marked-square',highlights.has(sq));
  cell.setAttribute('aria-label',sq);
  const legal=moves.find(m=>m.to===sq);
  if(legal){const dot=document.createElement('span');dot.className=pc||legal.flags.includes('e')?'legal-capture-ring':'legal-move-dot';cell.append(dot)}
 }
 board.querySelector('.arrows')?.remove();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('arrows');
 svg.setAttribute('viewBox','0 0 800 800');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
 if(orientation==='black')svg.style.transform='rotate(180deg)';
 if(lastMove)appendChessArrow(svg,lastMove.from,lastMove.to,'#ff962f',.7);
 for(const [a,b,c] of arrows)appendChessArrow(svg,a,b,c,.72);
 board.append(svg);
}
attachChessBoardControls({board,getPosition:()=>position,getSelected:()=>selected,setSelected:x=>{selected=x},
 playMove:(from,to)=>play(from,to),repaint:draw,getArrows:()=>arrows,getHighlights:()=>highlights});
// Static, curated CC0 puzzle bank served by EloScanner itself.
// No Lichess API calls are needed for standard play, including timed runs.
let bankPromise=null;
async function getPuzzle(which,target=null){
 if(!bankPromise){
  bankPromise=fetch('/assets/puzzle-bank.json?v=1',{cache:'force-cache'}).then(async response=>{
   if(!response.ok)throw Error('Puzzle library is not available on this deployment.');
   const data=await response.json();
   if(!Array.isArray(data)||data.length<100)throw Error('Puzzle library is incomplete.');
   return data;
  }).catch(error=>{bankPromise=null;throw error});
 }
 const bank=await bankPromise;
 let candidates=bank.filter(row=>!seen.has(row[0])&&!seenPositions.has(row[1]+'|'+row[2].split(' ')[0]));
 if(!candidates.length)throw Error('All local puzzles have been played during this session. Reload to start a new collection.');
 const desired=Number.isFinite(target)&&target>=100?Math.min(3166,target):null;
 if(desired!==null){
  if(which==='sprint'||which==='survival'){
   const minimum=Math.max(lastChallengeRating,desired-35);
   const harder=candidates.filter(row=>row[3]>=minimum);
   if(harder.length)candidates=harder;
   else candidates=candidates.filter(row=>row[3]>=lastChallengeRating);
   if(!candidates.length)throw Error('No harder unused puzzles remain in this session.');
  }
  candidates.sort((a,b)=>Math.abs(a[3]-desired)-Math.abs(b[3]-desired));
  candidates=candidates.slice(0,Math.min(which==='custom'?25:12,candidates.length));
 }
 for(let attempt=0;attempt<Math.min(30,candidates.length);attempt++){
  const index=Math.floor(Math.random()*candidates.length);
  const [id,fen,moves,rating]=candidates.splice(index,1)[0];
  try{
   const fullLine=String(moves).split(' ').filter(Boolean);
   if(fullLine.length<2)continue;
   const setup=fullLine.shift();
   const chess=new Chess(fen);
   chess.move({from:setup.slice(0,2),to:setup.slice(2,4),promotion:setup[4]||'q'});
   // The API-style shape keeps the same legality checks and board renderer.
   return {game:{pgn:'offline puzzle'},puzzle:{
    id,initialPly:1,fen:chess.fen(),lastMove:setup,
    rating,originalKey:fen+'|'+setup,solution:fullLine
   },source:'Lichess CC0 offline dataset'};
  }catch{/* Ignore a malformed source row, never show an unplayable puzzle. */}
 }
 throw Error('No playable puzzle was found in the local puzzle library.');
}
function decode(data){
 let chess,setup=null;
 // Prefer the exact public puzzle position; replay the game only when the FEN is absent.
 if(typeof data.puzzle.fen==='string'&&data.puzzle.fen.trim()){
  chess=new Chess(data.puzzle.fen.trim());
  const uci=String(data.puzzle.lastMove||'');
  if(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))setup={from:uci.slice(0,2),to:uci.slice(2,4)};
 }else{
  const full=new Chess();full.loadPgn(data.game.pgn);
  const moves=full.history(),initial=Math.max(1,Math.min(moves.length,Number(data.puzzle.initialPly)));
  chess=new Chess();const before=new Chess();
  for(let i=0;i<initial;i++)chess.move(moves[i]);
  for(let i=0;i<initial-1;i++)before.move(moves[i]);
  setup=before.move(moves[initial-1]);
 }
 const line=data.puzzle.solution.map(x=>String(x).toLowerCase()),test=new Chess(chess.fen());
 for(const uci of line){
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error('Invalid puzzle move');
  test.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
 }
 return {position:chess,line,setup,id:String(data.puzzle.id||''),rating:Math.round(Number(data.puzzle.rating)||0),puzzleKey:String(data.puzzle.originalKey||chess.fen())};
}
async function load(kind=mode){
 const generation=++requestId;busy=true;ready=false;selected=null;wrongSquare=null;closePromotion();buttons();say('Loading puzzle…');
 try{
  let p;
  if(kind==='custom'){
   const target=Math.min(4000,Math.max(100,Number($('puzzle-target').value)||1200));
   p=decode(await getPuzzle('next',target));
  }else{
   p=decode(await getPuzzle(kind,kind==='sprint'?750+125*solved:kind==='survival'?650+145*solved:null));
  }
  if(generation!==requestId)return;
  position=p.position;solution=p.line;step=0;puzzle=p;lastMove=p.setup;seen.add(p.id);
  seenPositions.add(p.puzzleKey);
  if(kind==='sprint'||kind==='survival')lastChallengeRating=Math.max(lastChallengeRating,p.rating);
  orientation=position.turn()==='b'?'black':'white';board.dataset.orientation=orientation;
  busy=false;ready=true;wrongSquare=null;arrows.length=0;highlights.clear();
  $('puzzle-side').textContent=(position.turn()==='w'?'White':'Black')+' to move';

  say(kind==='custom'?'Selected an available puzzle rated '+p.rating+'. Find the best move.':'Find the best move. Opponent replies are automatic.');
 }catch(e){
  if(generation!==requestId)return;
  if(runActive&&/no harder unused puzzles|all local puzzles have been played/i.test(e.message||'')){
   finishRun('The available puzzle library has been completed.');return;
  }
  busy=false;ready=false;say('Puzzle unavailable: '+e.message+'. '+(runActive?'Retrying automatically…':'Try again.'),'error');
  if(runActive){
   // A temporary provider outage must not count as a mistake.
   // Pause the Sprint clock while waiting for the provider.
   if(mode==='sprint')deadline+=5000;
   if(auto)clearTimeout(auto);
   auto=setTimeout(()=>{if(runActive&&generation===requestId)load(mode)},5000);
  }
 }
 stats();buttons();draw();
}
function finish(){
 ready=false;solved++;if(!position.isCheckmate())playSound('mate');say('Correct! Puzzle solved.','success');stats();buttons();
 if(runActive){
  const activeMode=mode;auto=setTimeout(()=>{if(runActive&&mode===activeMode)load(mode)},850);
 }else if(mode!=='daily')$('puzzle-next').textContent='Next Puzzle';
}
function finishRun(text){
 const score=solved;
 playSound('end');
 stopTimers();closePromotion();runActive=false;ready=false;busy=false;requestId++;

 completedRun={mode:mode==='sprint'?'sprint'+sprintMinutes:'survival',score};
 $('puzzle-final-score').textContent='You solved '+score+' puzzle'+(score===1?'':'s')+'.';
  $('puzzle-save-run').hidden=score<1;
  $('puzzle-save-status').textContent='';
  say(text+' Final score: '+score+' solved. You may optionally submit a nickname.','success');
 stats();buttons();draw();
}
function mistake(to){
 wrongSquare=to;draw();
 if(!runActive){say('That is not the solution. Try another move.','error');return}
 misses++;stats();
 if(misses>=3){finishRun('Three mistakes. Game over!');return}
 ready=false;busy=true;say('Incorrect. '+(3-misses)+' lives remaining.','error');buttons();
 auto=setTimeout(()=>{if(runActive)load(mode)},700);
}
function play(from,to,promotion=null){
 if(!ready||busy)return false;
 const expected=solution[step];if(!expected)return false;
 const pawn=position.get(from);
 if(promotion===null&&pawn?.type==='p'&&(to[1]==='1'||to[1]==='8')){
  pendingPromotion={from,to};$('puzzle-promotion').hidden=false;
  say('Choose a piece to promote your pawn.');return false;
 }
 const chosen=promotion||'q';
 let legal;
 try{legal=new Chess(position.fen()).move({from,to,promotion:chosen})}catch{return false}
 const actual=from+to+(legal.promotion||'');
 const copy=new Chess(position.fen());copy.move({from,to,promotion:chosen});
 if(actual!==expected&&!copy.isCheckmate()){mistake(to);return false}
 const completedMove=position.move({from,to,promotion:chosen});unlockAudio();soundForMove(completedMove);closePromotion();
 lastMove={from,to};selected=null;wrongSquare=null;arrows.length=0;step++;draw();
 if(step>=solution.length||position.isCheckmate()){finish();return true}
 busy=true;buttons();const current=requestId;
 auto=setTimeout(()=>{
  if(current!==requestId)return;
  const response=solution[step];
  try{const reply=position.move({from:response.slice(0,2),to:response.slice(2,4),promotion:response[4]||'q'});soundForMove(reply)}
  catch{busy=false;ready=false;say('Cannot play the automatic reply. Please load a new puzzle.','error');buttons();return}
  lastMove={from:response.slice(0,2),to:response.slice(2,4)};step++;busy=false;draw();
  if(step>=solution.length)finish();
  else{say('Correct. Find the next move.','success');buttons()}
 },500);
 return true;
}
function switchMode(next){
 if(!MODES[next])return;
 completedRun=null;$('puzzle-save-run').hidden=true;
 requestId++;stopTimers();closePromotion();runActive=false;ready=false;busy=false;solved=0;misses=0;lastChallengeRating=0;orientation='white';board.dataset.orientation='white';

 selected=null;wrongSquare=null;lastMove=null;puzzle=null;position=new Chess();mode=next;
 $('puzzle-heading').textContent=MODES[next][0];$('puzzle-subtitle').textContent=MODES[next][1];
 $('puzzle-custom-controls').hidden=mode!=='custom';
 $('puzzle-sprint-guide').hidden=mode!=='sprint';
 $('puzzle-survival-guide').hidden=mode!=='survival';
 $('puzzle-next').textContent='New Puzzle';
 for(const tab of document.querySelectorAll('[data-puzzle-mode]')){
  const isActive=tab.dataset.puzzleMode===next;tab.setAttribute('aria-selected',String(isActive));tab.tabIndex=isActive?0:-1;
 }
 stats();buttons();draw();
 if(mode==='sprint'||mode==='survival')say('Press Start when you are ready.');
 else load(next);
}
document.querySelectorAll('[data-puzzle-mode]').forEach(tab=>{
 tab.addEventListener('click',()=>switchMode(tab.dataset.puzzleMode));
 tab.addEventListener('keydown',e=>{
  if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
  e.preventDefault();const tabs=[...document.querySelectorAll('[data-puzzle-mode]')],index=tabs.indexOf(tab),delta=e.key==='ArrowRight'?1:-1;
  const next=tabs[(index+delta+tabs.length)%tabs.length];next.focus();next.click();
 });
});
document.querySelectorAll('[data-promote]').forEach(button=>button.addEventListener('click',()=>{
 if(!pendingPromotion)return;const move={...pendingPromotion};closePromotion();play(move.from,move.to,button.dataset.promote);
}));
$('puzzle-promotion-cancel').onclick=()=>{closePromotion();selected=null;draw();say('Promotion cancelled. Choose a move.')};
$('puzzle-next').onclick=()=>load(mode);
$('puzzle-target').addEventListener('keydown',e=>{if(e.key==='Enter'&&mode==='custom')load('custom')});
$('puzzle-hint').onclick=()=>{if(!ready||busy)return;selected=solution[step]?.slice(0,2)||null;draw();say('Hint: Look at the selected piece.')};
$('puzzle-start').onclick=()=>{
 if(runActive||mode!=='sprint'&&mode!=='survival')return;
 stopTimers();completedRun=null;$('puzzle-save-run').hidden=true;solved=0;misses=0;lastChallengeRating=0;runActive=true;startedAt=Date.now();
 unlockAudio();
 if(mode==='sprint'){
  deadline=Date.now()+sprintMinutes*60000;
  tick=setInterval(()=>{if(!runActive)return;stats();if(clock()<=0)finishRun('Time is up!')},250);
 }
 stats();buttons();load(mode);
};
$('puzzle-stop').onclick=()=>{if(runActive)finishRun('Run ended.')};
$('puzzle-sound-toggle').addEventListener('click',()=>{
 soundOn=!soundOn;const button=$('puzzle-sound-toggle');button.textContent=soundOn?'Sound: On':'Sound: Off';button.setAttribute('aria-pressed',String(soundOn));button.setAttribute('aria-label',soundOn?'Mute chess move sounds':'Enable chess move sounds');
 if(soundOn)unlockAudio();
});
document.querySelectorAll('[data-duration]').forEach(button=>button.addEventListener('click',()=>{
 if(runActive)return;sprintMinutes=Number(button.dataset.duration)===3?3:5;stats();buttons();
}));
document.addEventListener('visibilitychange',()=>{if(runActive&&mode==='sprint'){stats();if(clock()<=0)finishRun('Time is up!')}});
window.addEventListener('beforeunload',stopTimers);
switchMode('random');


async function updateRanking(id,mode){
 const list=$(id);if(!list)return;
 try{
  const response=await fetch('/api/puzzle-leaderboard?mode='+mode+'&limit=10',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unavailable');
  list.replaceChildren();
  if(!data.entries.length){const li=document.createElement('li');li.className='rank-note';li.textContent='No scores yet.';list.append(li);return}
  for(const entry of data.entries){
   const li=document.createElement('li'),name=document.createElement('span'),score=document.createElement('span');
   name.className='rank-name';name.textContent=entry.nickname;score.className='rank-score';score.textContent=entry.score;
   const report=document.createElement('button');
   report.type='button';report.className='rank-report';report.textContent='Report';report.title='Report an inappropriate nickname';
   report.dataset.nickname=entry.nickname;report.dataset.mode=mode;report.dataset.score=entry.score;
   li.append(name,score,report);list.append(li);
  }
 }catch{list.replaceChildren();const li=document.createElement('li');li.className='rank-note';li.textContent='Rankings temporarily unavailable.';list.append(li)}
}
function refreshRankings(){updateRanking('puzzle-sprint-ranking','sprint');updateRanking('puzzle-survival-ranking','survival')}
$('puzzle-submit-score').addEventListener('click',async()=>{
 if(!completedRun||completedRun.score<1)return;
 const nickname=$('puzzle-nickname').value.trim(),label=$('puzzle-save-status'),button=$('puzzle-submit-score');
 if(!/^[a-zA-Z0-9 _-]{2,20}$/.test(nickname)){label.textContent='Use 2–20 letters, numbers, spaces, _ or -.';return}
 button.disabled=true;label.textContent='Submitting…';
 try{
  const response=await fetch('/api/puzzle-leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...completedRun,nickname})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Submission failed');
  label.textContent='Score submitted. Top 100 scores appear publicly; places 101-110 may be kept as reserves.';completedRun=null;refreshRankings();
 }catch(e){label.textContent=e.message}finally{button.disabled=false}
});
refreshRankings();
