import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import {attachChessBoardControls} from './chess-board-controls.js?v=rainbow-1';
import {appendChessArrow} from './chess-board-arrows.js?v=rainbow-1';
const $=id=>document.getElementById(id),board=$('puzzle-board'),status=$('puzzle-status');
const MODES={daily:['Daily Puzzle','A new puzzle every day.'],random:['Random Puzzle','Train with a random position.'],custom:['Custom Puzzle','Choose your target puzzle Elo.'],sprint:['Puzzle Sprint','Five minutes, three mistakes. How many can you solve?'],survival:['Puzzle Survival','Three mistakes, no time limit. Keep your streak alive.']};
const glyph={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
let mode='daily',position=new Chess(),solution=[],step=0,puzzle=null,selected=null,lastMove=null;
let ready=false,busy=false,arrows=[],highlights=new Set(),wrongSquare=null,requestId=0,solved=0,misses=0,runActive=false;
let deadline=0,tick=null,auto=null,pendingPromotion=null;const seen=new Set(),cells=new Map();
function say(text,kind=''){status.textContent=text;status.className='puzzle-status'+(kind?' '+kind:'')}
function clock(){return Math.max(0,Math.ceil((deadline-Date.now())/1000))}
function stats(){
 $('puzzle-elo').textContent=puzzle?.rating||'—';$('puzzle-solved').textContent=solved;
 $('puzzle-solved-label').textContent=mode==='sprint'||mode==='survival'?'Score':'Solved';
 $('puzzle-lives-box').hidden=mode!=='sprint'&&mode!=='survival';
 $('puzzle-time-box').hidden=mode!=='sprint';
 $('puzzle-lives').textContent='♥'.repeat(Math.max(0,3-misses))+'♡'.repeat(Math.min(3,misses));
 const sec=mode==='sprint'?(runActive?clock():300):0;
 $('puzzle-time').textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
}
function stopTimers(){if(tick)clearInterval(tick);tick=null;if(auto)clearTimeout(auto);auto=null}
function closePromotion(){pendingPromotion=null;$('puzzle-promotion').hidden=true;}
function buttons(){
 const challenge=mode==='sprint'||mode==='survival';
 $('puzzle-start').hidden=!challenge||runActive;$('puzzle-stop').hidden=!challenge||!runActive;
 $('puzzle-next').hidden=challenge;$('puzzle-next').disabled=busy;
 $('puzzle-hint').disabled=!ready||busy;
 $('puzzle-start').textContent=mode==='sprint'?'Start 5-minute Sprint':'Start Survival';
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
    img.src='https://lichess1.org/assets/piece/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';
    img.onerror=()=>{img.remove();cell.textContent=glyph[pc.color][pc.type]};
    cell.append(img);
   }
  }else cell.querySelectorAll('.legal-move-dot,.legal-capture-ring').forEach(x=>x.remove());
  cell.classList.toggle('selected-square',selected===sq);
  cell.classList.toggle('recent-square',!!lastMove&&(lastMove.from===sq||lastMove.to===sq));
  cell.classList.toggle('wrong-square',wrongSquare===sq);
  cell.setAttribute('aria-label',sq);
  const legal=moves.find(m=>m.to===sq);
  if(legal){const dot=document.createElement('span');dot.className=pc||legal.flags.includes('e')?'legal-capture-ring':'legal-move-dot';cell.append(dot)}
 }
 board.querySelector('.arrows')?.remove();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('arrows');
 svg.setAttribute('viewBox','0 0 800 800');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
 if(lastMove)appendChessArrow(svg,lastMove.from,lastMove.to,'#ff962f',.7);
 for(const [a,b,c] of arrows)appendChessArrow(svg,a,b,c,.72);
 board.append(svg);
}
attachChessBoardControls({board,getPosition:()=>position,getSelected:()=>selected,setSelected:x=>{selected=x},
 playMove:(from,to)=>play(from,to),repaint:draw,getArrows:()=>arrows,getHighlights:()=>highlights});
async function getPuzzle(which,target=null){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
 try{
  const url='/api/puzzles?mode='+encodeURIComponent(which)+(Number.isFinite(target)?'&target='+encodeURIComponent(Math.round(target)):'')+'&nonce='+Date.now();
  const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Puzzle provider unavailable');
  if(!data?.puzzle?.solution?.length||!data?.game?.pgn)throw Error('Incomplete puzzle data');
  return data;
 }finally{clearTimeout(timeout)}
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
 return {position:chess,line,setup,id:String(data.puzzle.id||''),rating:Math.round(Number(data.puzzle.rating)||0)};
}
async function load(kind=mode){
 const generation=++requestId;busy=true;ready=false;selected=null;wrongSquare=null;closePromotion();buttons();say('Loading puzzle…');
 try{
  let p;
  if(kind==='custom'){
   const target=Number($('puzzle-target').value)||1200;
   for(let i=0;i<3;i++){
    const choice=decode(await getPuzzle('next',target));
    if(!p||Math.abs(choice.rating-target)<Math.abs(p.rating-target))p=choice;
    if(Math.abs(p.rating-target)<=150)break;
   }
  }else{
   p=decode(await getPuzzle(kind==='daily'?'daily':'next',kind==='sprint'?1200+40*solved:kind==='survival'?1200+75*solved:null));
   for(let attempt=0;attempt<2&&kind!=='daily'&&p.id&&seen.has(p.id);attempt++)p=decode(await getPuzzle('next',kind==='sprint'?1200+40*solved:kind==='survival'?1200+75*solved:null));
  }
  if(generation!==requestId)return;
  position=p.position;solution=p.line;step=0;puzzle=p;lastMove=p.setup;seen.add(p.id);
  busy=false;ready=true;wrongSquare=null;arrows.length=0;highlights.clear();
  $('puzzle-side').textContent=(position.turn()==='w'?'White':'Black')+' to move';
  $('puzzle-source').href=p.id?'https://lichess.org/training/'+encodeURIComponent(p.id):'https://lichess.org/training';
  say(kind==='custom'?'Selected an available puzzle rated '+p.rating+'. Find the best move.':'Find the best move. Opponent replies are automatic.');
 }catch(e){
  if(generation!==requestId)return;
  busy=false;ready=false;say('Puzzle unavailable: '+e.message+'. Try again.','error');
 }
 stats();buttons();draw();
}
function finish(){
 ready=false;solved++;say('Correct! Puzzle solved.','success');stats();buttons();
 if(runActive){
  const activeMode=mode;auto=setTimeout(()=>{if(runActive&&mode===activeMode)load(mode)},850);
 }else if(mode!=='daily')$('puzzle-next').textContent='Next Puzzle';
}
function finishRun(text){
 stopTimers();closePromotion();runActive=false;ready=false;busy=false;requestId++;
 say(text+' Final score: '+solved+' solved.','success');stats();buttons();draw();
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
 position.move({from,to,promotion:chosen});closePromotion();
 lastMove={from,to};selected=null;wrongSquare=null;arrows.length=0;step++;draw();
 if(step>=solution.length||position.isCheckmate()){finish();return true}
 busy=true;buttons();const current=requestId;
 auto=setTimeout(()=>{
  if(current!==requestId)return;
  const response=solution[step];
  try{position.move({from:response.slice(0,2),to:response.slice(2,4),promotion:response[4]||'q'})}
  catch{busy=false;ready=false;say('Cannot play the automatic reply. Please load a new puzzle.','error');buttons();return}
  lastMove={from:response.slice(0,2),to:response.slice(2,4)};step++;busy=false;draw();
  if(step>=solution.length)finish();
  else{say('Correct. Find the next move.','success');buttons()}
 },500);
 return true;
}
function switchMode(next){
 if(!MODES[next])return;
 requestId++;stopTimers();closePromotion();runActive=false;ready=false;busy=false;solved=0;misses=0;
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
 stopTimers();solved=0;misses=0;runActive=true;
 if(mode==='sprint'){
  deadline=Date.now()+300000;
  tick=setInterval(()=>{if(!runActive)return;stats();if(clock()<=0)finishRun('Time is up!')},250);
 }
 stats();buttons();load(mode);
};
$('puzzle-stop').onclick=()=>{if(runActive)finishRun('Run ended.')};
document.addEventListener('visibilitychange',()=>{if(runActive&&mode==='sprint'){stats();if(clock()<=0)finishRun('Time is up!')}});
window.addEventListener('beforeunload',stopTimers);
switchMode('daily');
