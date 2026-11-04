import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {attachPlayBotControls} from './play-bot-controls.mjs?v=2-multi-premoves';
import {appendChessArrow} from './chess-board-arrows.js?v=rainbow-1';
const $=id=>document.getElementById(id),board=$('play-board');
const pieces={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
const values={p:100,n:320,b:330,r:500,q:900,k:20000};
const names=Object.fromEntries([["cashojf3r","cashojf3r (800)"],["bot400","Bot (400)"],["bot500","Bot (500)"],["bot600","Bot (600)"],["bot700","Bot (700)"],["bot800","Bot (800)"],["bot900","Bot (900)"],["bot1000","Bot (1000)"],["bot1100","Bot (1100)"],["bot1200","Bot (1200)"],["bot1300","Bot (1300)"],["bot1400","Bot (1400)"],["rocket","ROCKETLEAGUE (1500)"],["bot1650","Bot (1650)"],["bot1800","Bot (1800)"],["bot1950","Bot (1950)"],["ominous","ominousgenius (2090)"],["bot2200","Bot (2200)"],["mikhail","Mikhail Hal (2350)"],["bot2500","Bot (2500)"],["bot2700","Bot (2700)"]]);
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
const ratings={"cashojf3r":800,"bot400":400,"bot500":500,"bot600":600,"bot700":700,"bot800":800,"bot900":900,"bot1000":1000,"bot1100":1100,"bot1200":1200,"bot1300":1300,"bot1400":1400,"rocket":1500,"bot1650":1650,"bot1800":1800,"bot1950":1950,"ominous":2090,"bot2200":2200,"mikhail":2350,"bot2500":2500,"bot2700":2700};
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
let chess=new Chess(),human='w',orientation='white',selected=null,last=null,working=false,ended=false,gameToken=0,pending=null,premoves=[];
let botLevel='rocket',selectedBot=null,audio=null,sound=true;
const botChatLines={cashojf3r:['I love attacking chess!','Your king looks interesting...','Let’s make this tactical!','I play the Queen’s Gambit, London System and Four Knights!'],rocket:['Ready for a Queen’s Gambit?','Control the center!','Nice move!']};
function botChat(message){const log=$('play-bot-chat');if(!log)return;const item=document.createElement('p');item.className='play-chat-message';const who=document.createElement('strong');who.textContent=(names[botLevel]||'Bot').replace(/ \\(.*\\)$/,'')+': ';item.append(who,document.createTextNode(message));log.append(item);while(log.children.length>8)log.firstElementChild.remove();log.scrollTop=log.scrollHeight}
function botChatMove(){const lines=chess.isCheck()?['Check! Keep an eye on your king.','A forcing move changes the position.']:chess.isCheckmate()?['That is checkmate. Good game!']:chess.history().length<9?['The opening is taking shape.','Center control matters early.']:['Interesting middlegame.','Every tempo counts.'];if(Math.random()<.55)botChat(lines[Math.floor(Math.random()*lines.length)])}const squares=new Map(),arrows=[],highlights=new Set();
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
 board.classList.toggle('premove-waiting',!ended&&chess.turn()!==human);
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
  cell.classList.toggle('premove-from',premoves.some(m=>m.from===sq));
  cell.classList.toggle('premove-to',premoves.some(m=>m.to===sq));
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
  ended=true;working=false;premoves.length=0;
  const win=chess.turn()!==human;
  status(win?'Checkmate — you win!':'Checkmate — the bot wins.');
  showResult(win?'You won!':'You lost!',win?'Checkmate. Well played!':'Checkmate. Try another game.',win?'win':'loss');
 }else if(chess.isDraw()){
  ended=true;working=false;premoves.length=0;
  status('Draw!');
  showResult('Draw!','The game ended in a draw.','draw');
 }else return false;
 paint();return true;
}
// Premoves are pseudo-legal intentions, not moves in the current position.
// Switching the FEN side-to-move and asking chess.js for legal moves fails when
// the waiting side is in check (and rejects pawn captures into empty squares).
// Validate movement geometry now; validate full legality after the bot moves.
function premoveCandidates(from,position=chess){
 const piece=position.get(from);
 if(!piece||piece.color!==human||ended)return [];
 const x=from.charCodeAt(0)-97,y=Number(from[1])-1;
 const inside=(a,b)=>a>=0&&a<8&&b>=0&&b<8;
 const square=(a,b)=>String.fromCharCode(97+a)+(b+1);
 const result=[];
 const add=(a,b)=>{
  if(!inside(a,b))return;
  const to=square(a,b),target=position.get(to);
  if(target?.color===human)return;
  result.push({from,to,promotion:piece.type==='p'&&(b===0||b===7)?'q':undefined});
 };
 const ray=(dx,dy)=>{
  for(let a=x+dx,b=y+dy;inside(a,b);a+=dx,b+=dy){
   const occupant=position.get(square(a,b));
   if(occupant?.color===human)break;
   add(a,b);
   if(occupant)break;
  }
 };
 if(piece.type==='p'){
  const dir=human==='w'?1:-1,start=human==='w'?1:6;
  if(inside(x,y+dir)&&!position.get(square(x,y+dir))){
   add(x,y+dir);
   if(y===start&&!position.get(square(x,y+2*dir)))add(x,y+2*dir);
  }
  // A diagonal premove can anticipate the opponent occupying the target.
  for(const dx of [-1,1])if(inside(x+dx,y+dir)&&position.get(square(x+dx,y+dir))?.color!==human)add(x+dx,y+dir);
 }else if(piece.type==='n'){
  for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])add(x+dx,y+dy);
 }else if(piece.type==='k'){
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy)add(x+dx,y+dy);
  // Castle as a premove if the king and rook have not moved and path is empty.
  const rights=position.fen().split(' ')[2],home=human==='w'?0:7;
  if(x===4&&y===home){
   for(const [right,rookX,destX,step] of [[human==='w'?'K':'k',7,6,1],[human==='w'?'Q':'q',0,2,-1]]){
    if(!rights.includes(right)||position.get(square(rookX,home))?.type!=='r'||position.get(square(rookX,home))?.color!==human)continue;
    let clear=true;
    for(let f=x+step;f!==rookX;f+=step)if(position.get(square(f,home))){clear=false;break}
    if(clear)add(destX,home);
   }
  }
 }else{
  const diagonal=[[1,1],[1,-1],[-1,1],[-1,-1]];
  const straight=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of (piece.type==='b'?diagonal:piece.type==='r'?straight:[...diagonal,...straight]))ray(dx,dy);
 }
 return result;
}
// Project queued human moves without advancing the opponent's turn.
function projectedPremovePosition(){
 const position=new Chess(chess.fen());
 for(const move of premoves){
  const piece=position.get(move.from);
  if(!piece||piece.color!==human)break;
  position.remove(move.from);
  position.remove(move.to);
  position.put({...piece,type:move.promotion&&piece.type==='p'&&(move.to[1]==='1'||move.to[1]==='8')?move.promotion:piece.type},move.to);
 }
 return position;
}
function candidateMoves(from){
 if(ended)return [];
 if(chess.turn()===human)return chess.get(from)?.color===human?chess.moves({square:from,verbose:true}):[];
 return premoveCandidates(from,projectedPremovePosition());
}
function queuePremove(from,to,promotion){
 if(ended||chess.turn()===human||premoves.length>=1000)return false;
 const options=candidateMoves(from).filter(m=>m.to===to);
 if(!options.length)return false;
 premoves.push({from,to,promotion:promotion||'q'});
 selected=null;status(premoves.length+' premove(s) queued. Right-click to cancel all.');
 paint();return true;
}
function runPremove(){
 if(!premoves.length||ended||chess.turn()!==human)return;
 const move=premoves.shift();
 const options=chess.moves({square:move.from,verbose:true}).filter(m=>m.to===move.to);
 if(!options.length){premoves.length=0;status('Premoves cancelled: next move is no longer legal.');paint();return}
 try{apply(move);if(!terminal())scheduleBot()}
 catch{premoves.length=0;status('Premoves cancelled: next move is no longer legal.');paint()}
}
function apply(move){const played=chess.move(move);last={from:played.from,to:played.to};selected=null;arrows.length=0;highlights.clear();tone(played);paint();return played}
function openPromotion(){
 const panel=$('play-promotion');
 panel.hidden=false;
 if(typeof panel.showModal==='function'&&!panel.open)panel.showModal();
 panel.querySelector('[data-promote="q"]')?.focus();
}
function closePromotion(){
 const panel=$('play-promotion');
 if(typeof panel.close==='function'&&panel.open)panel.close();
 panel.hidden=true;
}
function play(from,to,promotion=null){
 if(ended)return false;
 if(chess.turn()!==human){
  const options=candidateMoves(from).filter(m=>m.to===to);
  if(options.some(m=>m.promotion)&&!promotion){pending={from,to,premove:true};openPromotion();return true}
  return queuePremove(from,to,promotion);
 }
 if(working)return false;
 const choices=chess.moves({square:from,verbose:true}).filter(m=>m.to===to);
 if(!choices.length)return false;
 if(choices.some(m=>m.promotion)&&!promotion){pending={from,to};openPromotion();return true}
 unlock();
 try{apply({from,to,promotion:promotion||'q'})}catch{status('That promotion could not be completed. Please try again.');return false}
 closePromotion();pending=null;
 if(!terminal())scheduleBot();return true;
}
attachPlayBotControls({board,getPosition:()=>chess,getSelected:()=>selected,setSelected:x=>{selected=x},playMove:play,repaint:paint,getArrows:()=>arrows,getHighlights:()=>highlights,canSelectPiece:(_square,piece)=>!ended&&piece.color===human,canAttemptMove:(from,to)=>candidateMoves(from).some(m=>m.to===to),onRightClick:()=>{if(premoves.length){premoves.length=0;selected=null;status(chess.turn()===human?'':'Premoves cancelled.');paint();return true}return false}});
board.addEventListener('pointerdown',unlock);board.addEventListener('keydown',unlock);
// Master and grandmaster tiers use Stockfish rather than the shallow JS search.
let strongWorker=null;
function stopStrongBot(){if(strongWorker){strongWorker.terminate();strongWorker=null}}
function strongBotTurn(token,fen,level){
 stopStrongBot();
 try{
  const w=new Worker('/play-strong-bot-worker.js?v=2-uci-strength',{type:'module'});strongWorker=w;
  const fallback=()=>{
   if(strongWorker!==w)return;
   stopStrongBot();
   if(token!==gameToken||ended||chess.turn()===human)return;
   status('Strong engine unavailable; using fallback bot.');
   try{ensureBotWorker().postMessage({token,fen,level})}catch{working=false;status('Bot calculation unavailable.');paint()}
  };
  w.onerror=fallback;
  w.onmessage=e=>{
   if(strongWorker!==w)return;
   const {move,error}=e.data;
   if(error){fallback();return}
   stopStrongBot();
   if(token!==gameToken||ended||chess.turn()===human)return;
   try{if(move){apply(move);botChatMove()}working=false;if(!terminal()){status('');runPremove()}}
   catch{working=false;status('Bot move failed.');}
   paint();
  };
  w.postMessage({token,fen,elo:ratings[level]||2000});
 }catch{try{ensureBotWorker().postMessage({token,fen,level})}catch{working=false;status('Bot calculation unavailable.');paint()}}
}
// Bot search runs in a module worker so deeper positions never freeze the board.
let botWorker=null;
function ensureBotWorker(){
 if(botWorker)return botWorker;
 botWorker=new Worker('/play-bot-worker.js?v=4-calibrated-openings',{type:'module'});
 botWorker.onerror=()=>{status('Bot calculation failed. Start a new game to retry.');working=false;botWorker?.terminate();botWorker=null;paint()};
 botWorker.onmessage=e=>{
  const {token,move,error,bookMiss}=e.data;
  if(token!==gameToken||ended||chess.turn()===human)return;
  if(bookMiss){strongBotTurn(token,chess.fen(),botLevel);return}
  if(error){working=false;status('Bot calculation failed. Start a new game to retry.');paint();return}
  try{if(move){apply(move);botChatMove()}working=false;if(!terminal()){status('');runPremove()}}
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
  try{
   const elo=ratings[level]||1000;
   if(elo>=800&&(level==='cashojf3r'||level==='rocket'))ensureBotWorker().postMessage({token,fen,level,bookOnly:true});
   else if(elo>=800)strongBotTurn(token,fen,level);
   else ensureBotWorker().postMessage({token,fen,level});
  }
  catch(e){working=false;status('Bot calculation unavailable. Please retry.');paint()}
 },120);
}
function newGame(){
 stopStrongBot();gameToken++;chess=new Chess();human=document.querySelector('input[name=side]:checked').value;
 botLevel=selectedBot||'rocket';
 orientation=human==='b'?'black':'white';selected=null;last=null;pending=null;premoves.length=0;ended=false;working=false;
 if($('play-result').open)$('play-result').close();highlights.clear();arrows.length=0;
 closePromotion();if($('play-bot-chat'))$('play-bot-chat').replaceChildren();botChat(botLevel==='rocket'?'Let’s play! I like the Queen’s Gambit.':botLevel==='cashojf3r'?'I play the Queen’s Gambit, London System and Four Knights!':'Good luck, have fun!');$('play-opponent').textContent=names[botLevel];$('play-you').textContent='You · '+(human==='w'?'White':'Black');
 unlock();paint();status(human==='w'?'':'You are Black. The bot moves first.');
 if(human==='b')scheduleBot();
}
$('play-new').addEventListener('click',newGame);
$('play-flip').addEventListener('click',()=>{orientation=orientation==='white'?'black':'white';$('play-flip').setAttribute('aria-pressed',String(orientation==='black'));selected=null;paint()});
$('play-undo').addEventListener('click',()=>{if(!chess.history().length)return;stopStrongBot();gameToken++;working=false;ended=false;pending=null;premoves.length=0;
 if($('play-result').open)$('play-result').close();closePromotion();chess.undo();if(chess.turn()!==human&&chess.history().length)chess.undo();last=null;selected=null;paint();if(chess.turn()!==human)scheduleBot();else status('Move taken back.')});
$('play-resign').addEventListener('click',()=>{if(ended)return;stopStrongBot();gameToken++;working=false;ended=true;premoves.length=0;status('You resigned. '+names[botLevel]+' wins.');showResult('You lost!','You resigned against '+names[botLevel]+'.','loss');paint()});
$('play-sound').addEventListener('click',()=>{sound=!sound;$('play-sound').textContent=sound?'Sound: On':'Sound: Off';$('play-sound').setAttribute('aria-pressed',String(sound));if(sound)unlock()});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{if(!pending)return;const p={...pending};if(play(p.from,p.to,b.dataset.promote)){closePromotion();pending=null}}));
$('play-cancel-promotion').addEventListener('click',()=>{pending=null;closePromotion();selected=null;paint()});
$('play-promotion').addEventListener('cancel',e=>{e.preventDefault();pending=null;closePromotion();selected=null;paint()});
document.querySelectorAll('.play-bot[data-bot]').forEach(button=>button.addEventListener('click',()=>{
 const id=button.dataset.bot;
 if(selectedBot===id){selectedBot=null;$('play-bot-options').hidden=true;}
 else{selectedBot=id;$('play-bot-options').hidden=false;$('play-selected-name').textContent=id==='mikhail'?'Mikhail Hal':id==='ominous'?'ominousgenius':id==='rocket'?'ROCKETLEAGUE':id==='cashojf3r'?'cashojf3r':'Bot';$('play-selected-elo').textContent=ratings[id]+' Elo';}
 document.querySelectorAll('.play-bot[data-bot]').forEach(card=>{const active=card.dataset.bot===selectedBot;card.classList.toggle('is-selected',active);card.setAttribute('aria-expanded',String(active))});
}));
$('play-chat-form').addEventListener('submit',event=>{
 event.preventDefault();
 const input=$('play-chat-input'),message=input.value.trim();
 if(!message)return;
 input.value='';
 const log=$('play-bot-chat'),entry=document.createElement('p');
 entry.className='play-chat-message play-chat-user';
 const label=document.createElement('strong');label.textContent='You: ';
 entry.append(label,document.createTextNode(message));log.append(entry);
 const replies=/score|evaluation|position|positie/i.test(message)?['The current board is the best guide. I do not run an AI evaluation in this chat.']: /hello|hi|hey|hoi/i.test(message)?['Hey! Ready to play?','Hi! Good luck!']:/queen|gambit|opening/i.test(message)?['I like fighting for the center.','The Queen’s Gambit starts with 1.d4 d5 2.c4.']:/attack|king|check/i.test(message)?['I love tactical chess!','Keep your king safe!']:['Interesting! Your move.','Let’s see what happens on the board.','Good luck!'];
 botChat(replies[Math.floor(Math.random()*replies.length)]);
});
paint();

// Keep the difficulty selector compact: only one tier is expanded at a time.
document.querySelectorAll('.play-bot-tier').forEach(tier=>tier.addEventListener('toggle',()=>{
 if(!tier.open)return;
 document.querySelectorAll('.play-bot-tier').forEach(other=>{if(other!==tier)other.open=false});
}));
