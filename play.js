import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {attachChessBoardControls} from './chess-board-controls.js?v=puzzles-black-2';
import {appendChessArrow} from './chess-board-arrows.js?v=rainbow-1';
const $=id=>document.getElementById(id),board=$('play-board');
const pieces={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
const values={p:100,n:320,b:330,r:500,q:900,k:20000};
const names=Object.fromEntries([["bot400","Bot (400)"],["bot500","Bot (500)"],["bot600","Bot (600)"],["bot700","Bot (700)"],["bot800","Bot (800)"],["bot900","Bot (900)"],["bot1000","Bot (1000)"],["bot1100","Bot (1100)"],["bot1200","Bot (1200)"],["bot1300","Bot (1300)"],["bot1400","Bot (1400)"],["rocket","ROCKETLEAGUE (1500)"],["bot1650","Bot (1650)"],["bot1800","Bot (1800)"],["bot1950","Bot (1950)"],["ominous","ominousgenius (2090)"],["bot2200","Bot (2200)"],["mikhail","Mikhail Hal (2350)"],["bot2500","Bot (2500)"],["bot2700","Bot (2700)"]]);
names["bot300"]="Bot (300)";
names["bot1550"]="Bot (1550)";
names["bot1600"]="Bot (1600)";
names["bot1700"]="Bot (1700)";
names["bot1900"]="Bot (1900)";
names["bot2000"]="Bot (2000)";
names["bot2100"]="Bot (2100)";
names["bot2250"]="Bot (2250)";
names["bot2300"]="Bot (2300)";
names["bot2400"]="Bot (2400)";
names["bot2450"]="Bot (2450)";
names["bot2600"]="Bot (2600)";
names["bot2800"]="Bot (2800)";
names["bot2850"]="Bot (2850)";
names["bot2900"]="Bot (2900)";
names["bot3000"]="Bot (3000)";
const ratings={"bot400":400,"bot500":500,"bot600":600,"bot700":700,"bot800":800,"bot900":900,"bot1000":1000,"bot1100":1100,"bot1200":1200,"bot1300":1300,"bot1400":1400,"rocket":1500,"bot1650":1650,"bot1800":1800,"bot1950":1950,"ominous":2090,"bot2200":2200,"mikhail":2350,"bot2500":2500,"bot2700":2700};
ratings["bot300"]=300;
ratings["bot1550"]=1550;
ratings["bot1600"]=1600;
ratings["bot1700"]=1700;
ratings["bot1900"]=1900;
ratings["bot2000"]=2000;
ratings["bot2100"]=2100;
ratings["bot2250"]=2250;
ratings["bot2300"]=2300;
ratings["bot2400"]=2400;
ratings["bot2450"]=2450;
ratings["bot2600"]=2600;
ratings["bot2800"]=2800;
ratings["bot2850"]=2850;
ratings["bot2900"]=2900;
ratings["bot3000"]=3000;
let chess=new Chess(),human='w',orientation='white',selected=null,last=null,working=false,ended=false,gameToken=0,pending=null,premove=null;
let botLevel='rocket',selectedBot=null,audio=null,sound=true;const squares=new Map(),arrows=[],highlights=new Set();
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
 const sq=String.fromCharCode(97+col)+(8-row),cell=document.createElement('button');
 cell.type='button';cell.className='play-square '+((row+col)%2?'dark':'light');cell.dataset.square=sq;cell.setAttribute('aria-label',sq);squares.set(sq,cell);board.append(cell);
}
function status(message){$('play-status').textContent=message}
function unlock(){
 if(!sound)return;
 try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{})}catch{}
}
function tone(move){
 if(!sound||!audio||audio.state!=='running')return;
 const kind=chess.isCheckmate()?'mate':chess.isCheck()?'check':move?.captured?'capture':'move';
 const notes={move:[420],capture:[220,145],check:[650,900],mate:[520,780,1040]}[kind];
 notes.forEach((hz,i)=>{const t=audio.currentTime+i*.065,o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.14)});
}
function paint(){
 board.dataset.orientation=orientation;
 const moves=selected&&!ended?candidateMoves(selected):[];
 for(const [sq,cell] of squares){
  const pc=chess.get(sq),key=pc?pc.color+pc.type:'',idx=(8-Number(sq[1]))*8+(sq.charCodeAt(0)-97);
  cell.style.order=orientation==='black'?63-idx:idx;
  if(cell.dataset.piece!==key){
   cell.dataset.piece=key;cell.replaceChildren();
   if(pc){const img=document.createElement('img');img.className='chess-piece';img.alt=pc.color+' '+pc.type;img.draggable=false;img.src='/vendor/pieces/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';img.onerror=()=>{img.remove();cell.textContent=pieces[pc.color][pc.type]};cell.append(img)}
  }else cell.querySelectorAll('.legal-dot,.capture-ring').forEach(x=>x.remove());
  cell.classList.toggle('selected',selected===sq);
  cell.classList.toggle('last',!!last&&(last.from===sq||last.to===sq));
  cell.classList.toggle('marked',highlights.has(sq));
  cell.classList.toggle('premove-from',premove?.from===sq);
  cell.classList.toggle('premove-to',premove?.to===sq);
  cell.classList.toggle('check',chess.isCheck()&&pc?.type==='k'&&pc.color===chess.turn());
  if(moves.some(m=>m.to===sq)){const dot=document.createElement('span');dot.className=pc?'capture-ring':'legal-dot';cell.append(dot)}
 }
 // Keep annotations above the pieces, matching the shared Analysis/Puzzles controls.
 board.querySelector('.play-arrow-layer')?.remove();
 if(arrows.length){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 800 800');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('play-arrow-layer');
  for(const [from,to,color] of arrows)appendChessArrow(svg,from,to,color);
  if(orientation==='black')svg.style.transform='rotate(180deg)';
  board.append(svg);
 }
 $('play-side').textContent=(chess.turn()==='w'?'White':'Black')+' to move';
 const history=chess.history(),lines=[];for(let i=0;i<history.length;i+=2)lines.push((i/2+1)+'. '+history[i]+(history[i+1]?' '+history[i+1]:''));
 $('play-history').textContent=lines.join('   ')||'No moves yet.';
 $('play-undo').disabled=!history.length;
 $('play-resign').disabled=ended;
}
function showResult(title,detail,kind){
 const dialog=$('play-result');
 $('play-result-title').textContent=title;
 $('play-result-detail').textContent=detail;
 $('play-result-icon').textContent=kind==='win'?'♕':kind==='loss'?'♟':'½';
 dialog.dataset.result=kind;
 if(!dialog.open)dialog.showModal();
}
$('play-result-ok').addEventListener('click',()=>$('play-result').close());
function terminal(){
 if(chess.isCheckmate()){
  ended=true;working=false;premove=null;
  const win=chess.turn()!==human;
  status(win?'Checkmate — you win!':'Checkmate — the bot wins.');
  showResult(win?'You won!':'You lost!',win?'Checkmate. Well played!':'Checkmate. Try another game.',win?'win':'loss');
 }else if(chess.isDraw()){
  ended=true;working=false;premove=null;
  status('Draw!');
  showResult('Draw!','The game ended in a draw.','draw');
 }else return false;
 paint();return true;
}
function premovePosition(){
 const fields=chess.fen().split(' ');
 fields[1]=human;
 fields[3]='-';
 return new Chess(fields.join(' '));
}
function candidateMoves(from){
 if(ended)return [];
 const piece=chess.get(from);
 if(!piece||piece.color!==human)return [];
 try{return (chess.turn()===human?chess:premovePosition()).moves({square:from,verbose:true})}catch{return []}
}
function queuePremove(from,to,promotion){
 if(ended||chess.turn()===human)return false;
 const options=candidateMoves(from).filter(m=>m.to===to);
 if(!options.length)return false;
 premove={from,to,promotion:promotion||'q'};
 selected=null;status('Prem ove queued'.replace('Prem ove','Premove')+': '+from+' → '+to+'. Right-click to cancel.');
 paint();return true;
}
function runPremove(){
 if(!premove||ended||chess.turn()!==human)return;
 const move=premove;premove=null;
 const options=chess.moves({square:move.from,verbose:true}).filter(m=>m.to===move.to);
 if(!options.length){status('Premove cancelled: move is no longer legal.');paint();return}
 try{apply(move);if(!terminal())scheduleBot()}
 catch{status('Premove cancelled: move is no longer legal.');paint()}
}
function apply(move){const played=chess.move(move);last={from:played.from,to:played.to};selected=null;arrows.length=0;highlights.clear();tone(played);paint();return played}
function play(from,to,promotion=null){
 if(ended)return false;
 if(chess.turn()!==human)return queuePremove(from,to,promotion);
 if(working)return false;
 const choices=chess.moves({square:from,verbose:true}).filter(m=>m.to===to);
 if(!choices.length)return false;
 if(choices.some(m=>m.flags.includes('p'))&&!promotion){pending={from,to};$('play-promotion').hidden=false;return false}
 unlock();
 try{apply({from,to,promotion:promotion||'q'})}catch{return false}
 $('play-promotion').hidden=true;pending=null;
 if(!terminal())scheduleBot();return true;
}
attachChessBoardControls({board,getPosition:()=>chess,getSelected:()=>selected,setSelected:x=>{selected=x},playMove:play,repaint:paint,getArrows:()=>arrows,getHighlights:()=>highlights,canSelectPiece:(_square,piece)=>!ended&&piece.color===human,canAttemptMove:(from,to)=>candidateMoves(from).some(m=>m.to===to),onRightClick:()=>{if(premove){premove=null;status(chess.turn()===human?'':'Premove cancelled.');paint()}}});
board.addEventListener('pointerdown',unlock);board.addEventListener('keydown',unlock);
// Bot search runs in a module worker so deeper positions never freeze the board.
let botWorker=null;
function ensureBotWorker(){
 if(botWorker)return botWorker;
 botWorker=new Worker('/play-bot-worker.js?v=1',{type:'module'});
 botWorker.onerror=()=>{status('Bot calculation failed. Start a new game to retry.');working=false;botWorker?.terminate();botWorker=null;paint()};
 botWorker.onmessage=e=>{
  const {token,move,error}=e.data;
  if(token!==gameToken||ended||chess.turn()===human)return;
  if(error){working=false;status('Bot calculation failed. Start a new game to retry.');paint();return}
  try{if(move)apply(move);working=false;if(!terminal()){status('');runPremove()}}
  catch(err){working=false;status('Bot move failed. Start a new game to retry.');console.error(err)}
  paint();
 };
 return botWorker;
}
function scheduleBot(){
 if(terminal())return;
 working=true;status(names[botLevel]+' is thinking…');paint();
 const token=gameToken,fen=chess.fen(),level=botLevel;
 setTimeout(()=>{if(token!==gameToken||ended||chess.turn()===human)return;
  try{ensureBotWorker().postMessage({token,fen,level})}
  catch(e){working=false;status('Bot calculation unavailable. Please retry.');paint()}
 },120);
}
function newGame(){
 gameToken++;chess=new Chess();human=document.querySelector('input[name=side]:checked').value;
 botLevel=selectedBot||'rocket';
 orientation=human==='b'?'black':'white';selected=null;last=null;pending=null;premove=null;ended=false;working=false;
 if($('play-result').open)$('play-result').close();highlights.clear();arrows.length=0;
 $('play-promotion').hidden=true;$('play-opponent').textContent=names[botLevel];$('play-you').textContent='You · '+(human==='w'?'White':'Black');
 unlock();paint();status(human==='w'?'':'You are Black. The bot moves first.');
 if(human==='b')scheduleBot();
}
$('play-new').addEventListener('click',newGame);
$('play-flip').addEventListener('click',()=>{orientation=orientation==='white'?'black':'white';$('play-flip').setAttribute('aria-pressed',String(orientation==='black'));selected=null;paint()});
$('play-undo').addEventListener('click',()=>{if(!chess.history().length)return;gameToken++;working=false;ended=false;pending=null;premove=null;
 if($('play-result').open)$('play-result').close();$('play-promotion').hidden=true;chess.undo();if(chess.turn()!==human&&chess.history().length)chess.undo();last=null;selected=null;paint();if(chess.turn()!==human)scheduleBot();else status('Move taken back.')});
$('play-resign').addEventListener('click',()=>{if(ended)return;gameToken++;working=false;ended=true;premove=null;status('You resigned. '+names[botLevel]+' wins.');showResult('You lost!','You resigned against '+names[botLevel]+'.','loss');paint()});
$('play-sound').addEventListener('click',()=>{sound=!sound;$('play-sound').textContent=sound?'Sound: On':'Sound: Off';$('play-sound').setAttribute('aria-pressed',String(sound));if(sound)unlock()});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{if(pending){const p=pending;play(p.from,p.to,b.dataset.promote)}}));
$('play-cancel-promotion').addEventListener('click',()=>{pending=null;$('play-promotion').hidden=true;selected=null;paint()});
document.querySelectorAll('.play-bot[data-bot]').forEach(button=>button.addEventListener('click',()=>{
 const id=button.dataset.bot;
 if(selectedBot===id){selectedBot=null;$('play-bot-options').hidden=true;}
 else{selectedBot=id;$('play-bot-options').hidden=false;$('play-selected-name').textContent=id==='mikhail'?'Mikhail Hal':id==='ominous'?'ominousgenius':id==='rocket'?'ROCKETLEAGUE':'Bot';$('play-selected-elo').textContent=ratings[id]+' Elo';}
 document.querySelectorAll('.play-bot[data-bot]').forEach(card=>{const active=card.dataset.bot===selectedBot;card.classList.toggle('is-selected',active);card.setAttribute('aria-expanded',String(active))});
}));
paint();

// Keep the difficulty selector compact: only one tier is expanded at a time.
document.querySelectorAll('.play-bot-tier').forEach(tier=>tier.addEventListener('toggle',()=>{
 if(!tier.open)return;
 document.querySelectorAll('.play-bot-tier').forEach(other=>{if(other!==tier)other.open=false});
}));
