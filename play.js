import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import {attachChessBoardControls} from './chess-board-controls.js?v=puzzles-black-2';
const $=id=>document.getElementById(id),board=$('play-board');
const pieces={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
const values={p:100,n:320,b:330,r:500,q:900,k:20000};
const names={beginner:'Rookie',easy:'Scout',medium:'Strategist',hard:'Master Bot'};
let chess=new Chess(),human='w',orientation='white',selected=null,last=null,working=false,ended=false,gameToken=0,pending=null;
let botLevel='beginner',audio=null,sound=true;const squares=new Map(),arrows=[],highlights=new Set();
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
 const moves=selected&&!working&&!ended&&chess.turn()===human?chess.moves({square:selected,verbose:true}):[];
 for(const [sq,cell] of squares){
  const pc=chess.get(sq),key=pc?pc.color+pc.type:'',idx=(8-Number(sq[1]))*8+(sq.charCodeAt(0)-97);
  cell.style.order=orientation==='black'?63-idx:idx;
  if(cell.dataset.piece!==key){
   cell.dataset.piece=key;cell.replaceChildren();
   if(pc){const img=document.createElement('img');img.className='play-piece';img.alt=pc.color+' '+pc.type;img.draggable=false;img.src='https://lichess1.org/assets/piece/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';img.onerror=()=>{img.remove();cell.textContent=pieces[pc.color][pc.type]};cell.append(img)}
  }else cell.querySelectorAll('.legal-dot,.capture-ring').forEach(x=>x.remove());
  cell.classList.toggle('selected',selected===sq);
  cell.classList.toggle('last',!!last&&(last.from===sq||last.to===sq));
  cell.classList.toggle('marked',highlights.has(sq));
  cell.classList.toggle('check',chess.isCheck()&&pc?.type==='k'&&pc.color===chess.turn());
  if(moves.some(m=>m.to===sq)){const dot=document.createElement('span');dot.className=pc?'capture-ring':'legal-dot';cell.append(dot)}
 }
 $('play-side').textContent=(chess.turn()==='w'?'White':'Black')+' to move';
 const history=chess.history(),lines=[];for(let i=0;i<history.length;i+=2)lines.push((i/2+1)+'. '+history[i]+(history[i+1]?' '+history[i+1]:''));
 $('play-history').textContent=lines.join('   ')||'No moves yet.';
 $('play-undo').disabled=!history.length;
 $('play-resign').disabled=ended;
}
function terminal(){
 if(chess.isCheckmate()){ended=true;working=false;status((chess.turn()===human?'Checkmate — the bot wins.':'Checkmate — you win!')+' Start a new game to play again.')}
 else if(chess.isDraw()){ended=true;working=false;status('Draw! Start a new game to play again.')}
 else return false;
 paint();return true;
}
function apply(move){const played=chess.move(move);last={from:played.from,to:played.to};selected=null;arrows.length=0;highlights.clear();tone(played);paint();return played}
function play(from,to,promotion=null){
 if(working||ended||chess.turn()!==human)return false;
 const choices=chess.moves({square:from,verbose:true}).filter(m=>m.to===to);
 if(!choices.length)return false;
 if(choices.some(m=>m.flags.includes('p'))&&!promotion){pending={from,to};$('play-promotion').hidden=false;return false}
 unlock();
 try{apply({from,to,promotion:promotion||'q'})}catch{return false}
 $('play-promotion').hidden=true;pending=null;
 if(!terminal())scheduleBot();return true;
}
attachChessBoardControls({board,getPosition:()=>chess,getSelected:()=>selected,setSelected:x=>{selected=x},playMove:play,repaint:paint,getArrows:()=>arrows,getHighlights:()=>highlights});
board.addEventListener('pointerdown',unlock);board.addEventListener('keydown',unlock);
const evaluate=(game,side)=>{
 if(game.isCheckmate())return game.turn()===side?-999999:999999;
 if(game.isDraw())return 0;
 let sum=0;
 for(const row of game.board())for(const pc of row)if(pc){
  const advancement=pc.type==='p'?(pc.color==='w'?Number(pc.square[1])-2:7-Number(pc.square[1])):0;
  const center=(3.5-Math.abs(3.5-(pc.square.charCodeAt(0)-97)))*2;
  const score=values[pc.type]+(pc.type==='p'?advancement*3:0)+center;
  sum+=(pc.color===side?1:-1)*score;
 }
 return sum;
};
function search(game,depth,alpha,beta,side){
 if(depth===0||game.isGameOver())return evaluate(game,side);
 const maximizing=game.turn()===side;
 const moves=game.moves({verbose:true}).sort((a,b)=>(Number(!!b.captured)*100+Number(b.san.includes('+'))*30)-(Number(!!a.captured)*100+Number(a.san.includes('+'))*30));
 let best=maximizing?-Infinity:Infinity;
 for(const move of moves){game.move(move);const v=search(game,depth-1,alpha,beta,side);game.undo();if(maximizing){best=Math.max(best,v);alpha=Math.max(alpha,best)}else{best=Math.min(best,v);beta=Math.min(beta,best)}if(beta<=alpha)break}
 return best;
}
function chooseBotMove(){
 const moves=chess.moves({verbose:true});if(!moves.length)return null;
 if(botLevel==='beginner')return moves[Math.floor(Math.random()*moves.length)];
 const depth=botLevel==='easy'?1:botLevel==='medium'?2:3;
 const ranked=moves.map(m=>{chess.move(m);const score=search(chess,depth-1,-Infinity,Infinity,chess.turn()==='w'?'b':'w');chess.undo();return {move:m,score:score+(Math.random()-.5)*(botLevel==='easy'?140:botLevel==='medium'?28:4)}}).sort((a,b)=>b.score-a.score);
 const pool=botLevel==='easy'?ranked.slice(0,Math.min(3,ranked.length)):ranked;
 return pool[botLevel==='easy'?Math.floor(Math.random()*pool.length):0].move;
}
function scheduleBot(){
 if(terminal())return;
 working=true;status(names[botLevel]+' is thinking…');paint();const token=gameToken;
 setTimeout(()=>{
  if(token!==gameToken||ended||chess.turn()===human)return;
  try{const move=chooseBotMove();if(move)apply({from:move.from,to:move.to,promotion:move.promotion||'q'});working=false;if(!terminal())status('Your move.')}
  catch(e){working=false;status('Bot move failed. Start a new game to retry.');console.error(e)}
  paint();
 },350);
}
function newGame(){
 gameToken++;chess=new Chess();human=document.querySelector('input[name=side]:checked').value;
 botLevel=document.querySelector('input[name=bot]:checked').value;
 orientation=human==='b'?'black':'white';selected=null;last=null;pending=null;ended=false;working=false;highlights.clear();arrows.length=0;
 $('play-promotion').hidden=true;$('play-opponent').textContent=names[botLevel]+' · Bot';$('play-you').textContent='You · '+(human==='w'?'White':'Black');
 unlock();paint();status(human==='w'?'Your move.':'You are Black. The bot moves first.');
 if(human==='b')scheduleBot();
}
$('play-new').addEventListener('click',newGame);
$('play-flip').addEventListener('click',()=>{orientation=orientation==='white'?'black':'white';selected=null;paint()});
$('play-undo').addEventListener('click',()=>{if(!chess.history().length)return;gameToken++;working=false;ended=false;pending=null;$('play-promotion').hidden=true;chess.undo();if(chess.turn()!==human&&chess.history().length)chess.undo();last=null;selected=null;paint();if(chess.turn()!==human)scheduleBot();else status('Move taken back. Your move.')});
$('play-resign').addEventListener('click',()=>{if(ended)return;gameToken++;working=false;ended=true;status('You resigned. '+names[botLevel]+' wins.');paint()});
$('play-sound').addEventListener('click',()=>{sound=!sound;$('play-sound').textContent=sound?'Sound: On':'Sound: Off';$('play-sound').setAttribute('aria-pressed',String(sound));if(sound)unlock()});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{if(pending){const p=pending;play(p.from,p.to,b.dataset.promote)}}));
$('play-cancel-promotion').addEventListener('click',()=>{pending=null;$('play-promotion').hidden=true;selected=null;paint()});
newGame();
