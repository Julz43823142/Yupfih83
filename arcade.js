import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {attachChessBoardControls} from '/chess-board-controls.js';
import {appendChessArrow} from '/chess-board-arrows.js';
import {GAME_CATALOG,IDs,COLORS,KNIGHT_COLORS,xy,at,cell,square,makeRandom,shuffle,moves,safeMoves,threatened,freshFalling,knightOptions,stepKnight,knightsAlive,blockPartyLevel,safeSquareLevel,memoryLevel,pawnEnemies,queenEscape} from '/arcade-rules.mjs';

const $=id=>document.getElementById(id);
const board=$('arcade-board'),modeParam=new URLSearchParams(location.search).get('game');
const mode=IDs.has(modeParam)?modeParam:'endgame-survivor';
const info=GAME_CATALOG.find(g=>g.id===mode);
$('arcade-title').textContent=info.name;
$('arcade-description').textContent=info.description;
$('arcade-ranking-name').textContent=info.name;
document.title=info.name+' | EloScanner';
const instructions={
 'endgame-survivor':'You start in a winning endgame as White. Actually finish the win against Stockfish at its maximum available strength. You have three lives. A draw or loss costs one life. Every win is a point.',
 'guess-the-elo':'Watch a short, illustrative bot game, then choose the closest strength rating. The sample ratings are demonstration targets, not verified ratings from real players. Guess quickly to score more.',
 'chess-memory':'Memorize the position while it is visible. After the pieces disappear, choose a piece from the tray and click or drag it onto the correct square. Reconstruct as many boards as possible in three minutes.',
 'missing-piece':'One white piece is missing. Choose it from the tray and place it in the correct square. Black then makes a move. Find mate in one with the piece you placed. Three mistakes end the run.',
 'safe-square-rush':'Move the highlighted king, knight, bishop, rook or queen to a safe square. Red squares are attacked. Every completed level scores. Three minutes; three lives.',
 'falling-board':'You control the blue knight against three computer-controlled knights. Every square disappears when a knight leaves it. Nobody can capture another knight. You must move within three seconds. Last knight standing wins the round. No multiplayer.',
 'queen-chase':'Control the white police pieces and surround the escaping black queen. Only the queen moves for the computer. Capture it or trap every escape to score and start a harder round.',
 'chess-block-party':'Each level announces a colour. Move your knight, bishop or rook onto a matching square before it is too late. Other colours collapse. Earn as many level points as you can in three minutes.',
 'pawn-dash':'Move your pawn forward or diagonally across a shifting chess road. Avoid moving rooks and bishops. Cross as many rows as you can in three minutes; three hits end your run.'
};
$('arcade-instructions').textContent=instructions[mode];

let state=null,selected=null,palettePiece=null,submitted=false,session=null,botWorker=null,botToken=0,clockTimer=null,account=null;
const marks=[],highlights=new Set(),cells=[];
const svgNS='http://www.w3.org/2000/svg';
const marksLayer=document.createElementNS(svgNS,'svg');
marksLayer.setAttribute('viewBox','0 0 800 800');
marksLayer.setAttribute('preserveAspectRatio','none');
marksLayer.classList.add('arcade-marks');
for(let i=0;i<64;i++){
 const el=document.createElement('button');el.type='button';el.className='arcade-square';
 el.dataset.square=square(i);el.dataset.index=String(i);
 if(i%8===0){const rank=document.createElement('span');rank.className='arcade-coordinate';rank.textContent=String(8-Math.floor(i/8));rank.setAttribute('aria-hidden','true');el.append(rank);}
 if(i>=56){const file=document.createElement('span');file.className='arcade-coordinate file';file.textContent='abcdefgh'[i%8];file.setAttribute('aria-hidden','true');el.append(file);}
 cells.push(el);board.append(el);
}
board.append(marksLayer);
const letters={K:'King',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
const currentPosition=()=>{
 if(!state)return {};
 if(mode==='endgame-survivor'||mode==='guess-the-elo'||(mode==='missing-piece'&&state.chess)){
  const list={};
  for(let i=0;i<64;i++){const p=state.chess.get(square(i));if(p)list[i]={type:p.type.toUpperCase(),side:p.color==='w'?'player':'enemy'};}
  return list;
 }
 if(mode==='falling-board'){
  return Object.fromEntries(state.falling.knights.filter(k=>k.alive).map(k=>[k.pos,{type:'N',side:k.id===0?'player':'enemy',colour:['blue','red','yellow','green'][k.id]}]));
 }
 if(mode==='chess-memory')return state.phase==='preview'?state.answer:state.placed;
 return state.pieces||{};
};
const getPiece=i=>currentPosition()[i];
function usable(){
 return state&&!state.finished&&state.phase!=='preview'&&state.phase!=='thinking'&&state.phase!=='guess'&&state.phase!=='waiting';
}
function canSelect(i){
 if(!usable())return false;
 const p=getPiece(i);if(!p||p.side!=='player')return false;
 if(mode==='missing-piece')return state.phase==='mate'&&p.type==='Q';
 if(mode==='chess-memory')return state.phase==='build';
 if(mode==='endgame-survivor')return state.chess.turn()==='w';
 if(mode==='falling-board')return state.falling.knights[0]?.alive&&i===state.falling.knights[0].pos;
 return true;
}
function available(i){
 if(!canSelect(i))return [];
 const p=getPiece(i);
 if(mode==='endgame-survivor'||mode==='missing-piece')return state.chess.moves({square:square(i),verbose:true}).map(m=>cell(m.to));
 if(mode==='falling-board')return knightOptions(state.falling,0);
 if(mode==='chess-memory')return Array.from({length:64},(_,j)=>j).filter(j=>j!==i&&!getPiece(j));
 if(mode==='safe-square-rush')return moves(p.type,i,state.pieces,{side:'player'});
 if(mode==='chess-block-party')return moves(p.type,i);
 if(mode==='pawn-dash')return moves('P',i,{}, {arcadePawn:true});
 if(mode==='queen-chase')return moves(p.type,i,state.pieces,{side:'player',capture:true}).filter(t=>!state.pieces[t]||state.pieces[t].side==='enemy');
 return [];
}
const canMove=(f,t)=>available(f).includes(t);
const controls=attachChessBoardControls({
 board,
 getPosition:()=>({get:s=>{const p=getPiece(cell(s));return p?{type:p.type.toLowerCase(),color:p.side==='player'?'w':'b'}:null},turn:()=> 'w'}),
 getSelected:()=>selected,setSelected:v=>{selected=v},
 canSelectPiece:(s)=>canSelect(cell(s)),
 canAttemptMove:(f,t)=>canMove(cell(f),cell(t)),
 playMove:(f,t)=>play(cell(f),cell(t)),
 repaint:()=>paint(),
 getArrows:()=>marks,getHighlights:()=>highlights
});
function resetAnnotations(){marks.length=0;highlights.clear();selected=null}
function drawAnnotations(){
 marksLayer.replaceChildren();
 for(const s of highlights){
  const i=cell(s);if(i<0)continue;
  const r=document.createElementNS(svgNS,'rect');
  r.setAttribute('x',String(i%8*100+5));r.setAttribute('y',String(Math.floor(i/8)*100+5));
  r.setAttribute('width','90');r.setAttribute('height','90');r.setAttribute('fill','none');
  r.setAttribute('stroke','#ecb445');r.setAttribute('stroke-width','10');
  marksLayer.append(r);
 }
 for(const arrow of marks)appendChessArrow(marksLayer,arrow[0],arrow[1],arrow[2]);
}
function pieceImage(p){
 const img=document.createElement('img');img.className='chess-piece';
 img.alt=(p.side==='player'?'White ':'Black ')+(letters[p.type]||p.type);
 img.src='/vendor/pieces/cburnett/'+(p.side==='player'?'w':'b')+p.type+'.svg';
 img.draggable=false;
 if(p.colour)img.classList.add('piece-'+p.colour);
 return img;
}
function paint(){
 const pos=currentPosition();
 const sources=selected?available(cell(selected)):[];
 for(let i=0;i<64;i++){
  const el=cells[i],p=pos[i],id=p?p.side+p.type+(p.colour||''):'';
  const [x,y]=xy(i);
  let classes='arcade-square '+((x+y)%2?'dark':'light');
  if(selected===square(i))classes+=' selected';
  if(sources.includes(i))classes+=' available';
  if(state&&mode==='falling-board'&&state.falling.gone.includes(i))classes+=' lost';
  if(state&&mode==='safe-square-rush'&&state.phase==='playing'){
   if(state.safe.safe.includes(i))classes+=' safe-zone';
   else if(threatened(i,state.pieces,'enemy'))classes+=' threatened';
  }
  if(state&&mode==='chess-block-party'){
   classes+=' board-color';
   el.style.setProperty('--board-color',COLORS[state.block.palette[i]]);
   if(state.block.palette[i]===state.block.target&&state.phase==='playing')classes+=' goal-colour';
  }else el.style.removeProperty('--board-color');
  if(state&&mode==='pawn-dash'&&state.stars?.includes(i))classes+=' star';
  if(state&&mode==='chess-memory'&&state.phase==='build'&&state.placed[i]&&state.answer[i])classes+=' safe-zone';
  el.className=classes;
  const existing=el.querySelector(':scope > .chess-piece');
  if(id!==el.dataset.pieceKey){
   if(existing)existing.remove();
   if(p)el.append(pieceImage(p));
   el.dataset.pieceKey=id;
  }
  const label=square(i)+(p?', '+(p.side==='player'?'white ':'black ')+(letters[p.type]||p.type):'')+(sources.includes(i)?', available move':'');
  el.setAttribute('aria-label',label);
 }
 $('arcade-score').textContent=String(state?.score||0);
 $('arcade-level').textContent=String(state?.level||1);
 $('arcade-lives').textContent=state&&Number.isFinite(state.lives)?String(state.lives):'—';
 $('arcade-move-clock-row').hidden=mode!=='falling-board'||!state||state.finished;
 if(state&&mode==='chess-block-party'&&state.phase==='playing'){
  $('arcade-status').style.borderLeft='5px solid '+COLORS[state.block.target];
 }else $('arcade-status').style.borderLeft='';
 drawAnnotations();
}
function status(text){$('arcade-status').textContent=text}
const timeLeft=()=>!state?180:Math.max(0,Math.ceil((state.endsAt-Date.now())/1000));
function clockLabel(sec){return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')}
const seed=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const random=()=>Math.random();
function score(points){state.score+=points;paint()}
function lose(message){
 if(!state||state.finished)return;
 state.lives--;status(message+' '+(state.lives>0?'Lives remaining: '+state.lives:'No lives left.'));
 if(state.lives<=0){finish();return}
}
function nextLevel(){
 if(!state||state.finished)return;
 state.level++;
 resetAnnotations();
 setupLevel();
 paint();
}
const endgames=[
 '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
 '7k/8/5K2/8/8/8/8/R7 w - - 0 1',
 '8/7k/5K2/8/8/8/8/3Q4 w - - 0 1',
 '8/8/6k1/8/3K4/8/8/5Q2 w - - 0 1'
];
const examples=[
 {elo:400,moves:['f3','e5','g4','Qh4#']},
 {elo:700,moves:['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#']},
 {elo:1000,moves:['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7','e3','O-O','Nf3','h6']},
 {elo:1300,moves:['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6','Be3','e5']},
 {elo:1600,moves:['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d4','exd4','cxd4','Bb4+']},
 {elo:1900,moves:['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6','Nf3','O-O','Be2','e5','O-O','Nc6']},
 {elo:2200,moves:['e4','e6','d4','d5','Nd2','c5','exd5','exd5','Ngf3','Nc6','Bb5','Bd6']},
 {elo:2500,moves:['d4','d5','c4','c6','Nf3','Nf6','Nc3','e6','Bg5','h6','Bh4','dxc4','e4']},
 {elo:2800,moves:['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','O-O']}
];
const missing=[
 {fen:'7k/p7/5K2/8/8/8/8/8 b - - 0 1',square:'g6',response:['a7','a6'],mate:['g6','g7']},
 {fen:'7k/p4K2/8/8/8/8/8/8 b - - 0 1',square:'g6',response:['a7','a5'],mate:['g6','g7']},
 {fen:'k7/7p/2K5/8/8/8/8/8 b - - 0 1',square:'b6',response:['h7','h6'],mate:['b6','b7']},
 {fen:'k7/2K4p/8/8/8/8/8/8 b - - 0 1',square:'b6',response:['h7','h5'],mate:['b6','b7']}
];
function setupLevel(){
 if(state.finished)return;
 state.phase='playing';state.pieces={};palettePiece=null;
 $('arcade-choices').replaceChildren();$('arcade-choices').hidden=true;
 $('arcade-palette').replaceChildren();$('arcade-palette').hidden=true;
 if(mode==='endgame-survivor'){
  state.chess=new Chess(endgames[(state.level-1)%endgames.length]);
  status('Winning position. White to move. Beat Stockfish to earn one point.');
 }else if(mode==='guess-the-elo'){
  const e=examples[(state.level-1)%examples.length];
  state.chess=new Chess();let applied=0;
  for(const m of e.moves){try{state.chess.move(m);applied++}catch{break}}
  state.answer=e.elo;state.phase='guess';
  status('Illustrative game ('+applied+' moves). Estimate the player strength.');
  const choices=$('arcade-choices');choices.hidden=false;
  for(const guess of [400,700,1000,1300,1600,1900,2200,2500,2800]){
   const b=document.createElement('button');b.textContent=guess+' Elo';b.type='button';b.addEventListener('click',()=>guessElo(guess));
   choices.append(b);
  }
 }else if(mode==='chess-memory'){
  state.answer=memoryLevel(state.seed,state.level);state.placed={};state.phase='preview';
  state.revealUntil=Date.now()+Math.max(2700,6500-state.level*200);
  status('Memorize the pieces! They disappear shortly.');
 }else if(mode==='missing-piece'){
  state.puzzle=missing[(state.level-1)%missing.length];
  state.chess=new Chess(state.puzzle.fen);state.phase='placement';
  palette(['Q','R','B','N'].map(type=>({type,side:'player'})));
  status('Which missing piece goes where? Drag from the tray or tap a piece, then a square.');
 }else if(mode==='safe-square-rush'){
  state.safe=safeSquareLevel(state.seed,state.level);
  state.pieces=state.safe.pieces;
  state.levelUntil=Date.now()+Math.max(1500,4600-state.level*55);
  status('Reach any safe square with your '+(letters[state.safe.type]||state.safe.type)+'! Red means attacked.');
 }else if(mode==='falling-board'){
  state.falling=freshFalling(state.seed+':'+state.level);
  state.nextBots=Date.now()+900;
  const now=Date.now();
  for(const k of state.falling.knights)k.lastAt=now;
  status('Blue knight is yours. Jump within 3 seconds. Last knight standing wins.');
 }else if(mode==='queen-chase'){
  const rand=makeRandom(state.seed+':queen:'+state.level);
  const q=[27,28,35,36][Math.floor(rand()*4)];
  state.pieces={0:{type:'R',side:'player'},7:{type:'R',side:'player'},48:{type:'N',side:'player'},63:{type:'B',side:'player'},[q]:{type:'Q',side:'enemy'}};
  state.queen=q;state.turns=0;state.phase='playing';
  status('Move your officers to corner the queen. She can only move, not capture.');
 }else if(mode==='chess-block-party'){
  state.block=blockPartyLevel(state.seed,state.level);
  state.pieces={[state.block.pos]:{type:state.block.type,side:'player'}};
  state.levelUntil=Date.now()+Math.round(state.block.seconds*1000);
  status('MOVE TO '+['RED','YELLOW','CYAN','GREEN','PURPLE','PINK','CREAM','ORANGE'][state.block.target]+'! Use your '+letters[state.block.type]+'.');
 }else if(mode==='pawn-dash'){
  state.pawn=at(4,7);state.enemies=pawnEnemies(state.seed,state.level);
  state.pieces={[state.pawn]:{type:'P',side:'player'}};
  state.nextEnemies=Date.now()+650;
  status('Cross the road! Move your pawn forward or diagonally; avoid the roaming pieces.');
  drawRoad();
 }
}
function drawRoad(){
 if(!state||mode!=='pawn-dash')return;
 state.pieces={[state.pawn]:{type:'P',side:'player'}};
 for(const e of state.enemies){const i=at(e.x,e.y);if(i>=0&&i!==state.pawn)state.pieces[i]={type:e.type,side:'enemy'};}
}
function palette(items){
 const wrap=$('arcade-palette');wrap.replaceChildren();wrap.hidden=false;
 for(const p of items){
  const button=document.createElement('button');button.type='button';
  button.setAttribute('aria-label','Pick '+(p.side==='enemy'?'black ':'white ')+letters[p.type]);
  const img=pieceImage(p);button.append(img);
  button.addEventListener('click',()=>{palettePiece=p;selectPalette(button)});
  button.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;
   e.preventDefault();palettePiece=p;selectPalette(button);
   const ghost=img.cloneNode(true);ghost.style.cssText='position:fixed;z-index:9999;pointer-events:none;width:64px;height:64px;transform:translate(-50%,-50%);opacity:.96';
   document.body.append(ghost);ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
   const id=e.pointerId;let moved=false;let downX=e.clientX,downY=e.clientY;
   button.setPointerCapture(id);
   const track=event=>{if(event.pointerId!==id)return;ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';if(Math.hypot(event.clientX-downX,event.clientY-downY)>8)moved=true};
   const done=event=>{
    if(event.pointerId!==id)return;
    button.removeEventListener('pointermove',track);button.removeEventListener('pointerup',done);button.removeEventListener('pointercancel',cancel);
    ghost.remove();if(moved){const to=controls.squareAt(event.clientX,event.clientY);if(to)placePalette(cell(to));}
   };
   const cancel=()=>{button.removeEventListener('pointermove',track);button.removeEventListener('pointerup',done);button.removeEventListener('pointercancel',cancel);ghost.remove()};
   button.addEventListener('pointermove',track);button.addEventListener('pointerup',done);button.addEventListener('pointercancel',cancel);
  });
  wrap.append(button);
 }
}
function selectPalette(button){for(const el of $('arcade-palette').children)el.classList.toggle('active',el===button);}
board.addEventListener('pointerup',e=>{
 if(!palettePiece||!state||state.finished||!['build','placement'].includes(state.phase))return;
 // Ordinary tap-to-place is handled on pointerup even when pointerdown began on an empty cell.
 if(e.pointerType==='mouse'&&e.button!==0)return;
 const sq=controls.squareAt(e.clientX,e.clientY);
 if(sq)placePalette(cell(sq)); // board pointer capture retargets pointerup to the board, not the child square
},true);
board.addEventListener('click',e=>{
 if(e.detail!==0||!palettePiece||!state||!['build','placement'].includes(state.phase))return;
 const target=e.target.closest('[data-square]');if(target)placePalette(cell(target.dataset.square));
},true);
function placePalette(to){
 if(to<0||!palettePiece||!state||state.finished)return;
 if(mode==='chess-memory'&&state.phase==='build'){
  if(state.placed[to])return;
  const a=state.answer[to];
  if(a&&a.type===palettePiece.type&&a.side===palettePiece.side){
   state.placed[to]={...palettePiece};const n=Object.keys(state.placed).length,total=Object.keys(state.answer).length;
   status(n+' of '+total+' pieces placed.');
   if(n===total){score(10+state.level*3);status('Perfect board! Next level.');nextLevel();}
  }else{lose('Incorrect square or piece.');}
  paint();return;
 }
 if(mode==='missing-piece'&&state.phase==='placement'){
  const p=state.puzzle;
  if(square(to)!==p.square||palettePiece.type!=='Q'){lose('That piece or square is incorrect.');paint();return}
  const ok=state.chess.put({type:'q',color:'w'},p.square);
  if(!ok){lose('That placement is not legal.');return}
  try{
   const response=state.chess.move({from:p.response[0],to:p.response[1]});
   if(!response)throw Error('Missing scripted move');
   state.phase='mate';
   $('arcade-palette').hidden=true;palettePiece=null;
   status('Black played '+response.san+'. Now find mate in one!');
  }catch{state.phase='placement';status('This puzzle could not start. Please restart.')}
  paint();return;
 }
}
function guessElo(guess){
 if(!state||state.finished||state.phase!=='guess')return;
 const diff=Math.abs(guess-state.answer);
 const points=Math.max(0,120-Math.round(diff/10));
 score(points);
 $('arcade-choices').hidden=true;
 status('Target: '+state.answer+' Elo (illustrative). You earned '+points+' points.');
 nextLevel();
}
function successfulCapture(){
 score(20+Math.max(0,12-state.turns));
 status('Queen cornered! New pursuit.');
 nextLevel();
}
function play(f,t){
 if(!state||state.finished||!canMove(f,t))return false;
 resetAnnotations();
 if(mode==='endgame-survivor'){
  const m=state.chess.move({from:square(f),to:square(t),promotion:'q'});
  if(!m)return false;
  if(checkEndgame()){paint();return true}
  state.phase='thinking';status('Stockfish is calculating its strongest available reply…');
  stockfishMove();paint();return true;
 }
 if(mode==='missing-piece'){
  const m=state.chess.move({from:square(f),to:square(t),promotion:'q'});
  if(!m)return false;
  if(state.chess.isCheckmate()){score(1);status('Checkmate! You solved the missing piece.');nextLevel();}
  else{lose('Not checkmate.');if(!state.finished)setupLevel();}
  paint();return true;
 }
 if(mode==='chess-memory'){
  const p=state.placed[f];if(!p||state.placed[t])return false;
  if(state.answer[t]?.type===p.type&&state.answer[t]?.side===p.side){
   delete state.placed[f];state.placed[t]=p;status('Piece moved.');
  }else lose('Incorrect piece placement.');
  paint();return true;
 }
 if(mode==='safe-square-rush'){
  if(state.safe.safe.includes(t)){score(1);status('Safe square reached!');nextLevel();}
  else{lose('That square is attacked.');if(!state.finished)nextLevel();}
  paint();return true;
 }
 if(mode==='falling-board'){
  if(!stepKnight(state.falling,0,t,Date.now()))return false;
  score(1);
  if(!state.falling.knights[0].alive){status('No jumps left.');finish();}
  else checkFalling();
  paint();return true;
 }
 if(mode==='queen-chase'){
  const p=state.pieces[f];delete state.pieces[f];state.pieces[t]=p;state.turns++;
  if(t===state.queen){successfulCapture();paint();return true;}
  state.phase='thinking';status('Stockfish is finding a queen-only escape…');
  stockfishQueenEscape();
  paint();return true;
 }
 if(mode==='chess-block-party'){
  if(state.block.palette[t]===state.block.target){score(1);status('Correct colour!');nextLevel();}
  else{lose('Wrong colour!');if(!state.finished)nextLevel();}
  paint();return true;
 }
 if(mode==='pawn-dash'){
  state.pawn=t;score(1);
  if(state.enemies.some(e=>at(e.x,e.y)===t)){pawnHit();paint();return true;}
  const row=xy(t)[1];
  if(row===0){score(8);state.level++;state.pawn=at(4,7);state.enemies=pawnEnemies(state.seed,state.level);status('Road crossed! Next level.');}
  else status('Keep crossing. '+(7-row)+' rows cleared.');
  drawRoad();paint();return true;
 }
 return false;
}
function pawnHit(){
 lose('A moving chess piece caught your pawn.');
 if(state.finished)return;
 state.pawn=at(4,7);state.enemies=pawnEnemies(state.seed,++state.level);
 drawRoad();
}
function checkFalling(){
 const alive=knightsAlive(state.falling);
 if(alive<=1){
  if(state.falling.knights[0].alive){score(20);status('You are the last knight standing!');nextLevel();}
  else finish();
 }
}
function tick(){
 if(!state||state.finished)return;
 const now=Date.now();
 if(mode==='endgame-survivor')$('arcade-time').textContent='∞';
 else $('arcade-time').textContent=clockLabel(timeLeft());
 if(mode==='falling-board'){
  const player=state.falling.knights[0];
  if(player?.alive){
   const left=Math.max(0,3000-(now-player.lastAt));
   $('arcade-move-clock').textContent=(left/1000).toFixed(1)+'s';
   if(left===0){player.alive=false;status('Three seconds expired. Your knight is out.');finish();return}
  }
  if(now>=state.nextBots){
   const rand=makeRandom(state.seed+':bots:'+state.level+':'+state.falling.turns);
   for(const k of state.falling.knights.slice(1)){
    if(!k.alive)continue;
    const targets=knightOptions(state.falling,k.id);
    if(!targets.length){k.alive=false;continue}
    stepKnight(state.falling,k.id,targets[Math.floor(rand()*targets.length)],now);
   }
   state.nextBots=now+850;checkFalling();paint();
  }
 }else if(mode==='safe-square-rush'&&state.phase==='playing'&&now>=state.levelUntil){
  lose('Too slow!');if(!state.finished){nextLevel();paint();}
 }else if(mode==='chess-block-party'&&state.phase==='playing'&&now>=state.levelUntil){
  lose('The other colours collapsed!');if(!state.finished){nextLevel();paint();}
 }else if(mode==='chess-memory'&&state.phase==='preview'&&now>=state.revealUntil){
  state.phase='build';state.placed={};palette([
   ...['K','Q','R','B','N','P'].map(type=>({type,side:'player'})),
   ...['K','Q','R','B','N','P'].map(type=>({type,side:'enemy'}))
  ]);
  status('Rebuild the position! Choose a piece and place it on its original square.');
  paint();
 }else if(mode==='pawn-dash'&&now>=state.nextEnemies){
  state.nextEnemies=now+Math.max(250,650-state.level*20);
  for(const e of state.enemies)e.x=(e.x+e.dir+8)%8;
  if(state.enemies.some(e=>at(e.x,e.y)===state.pawn)){pawnHit();}
  drawRoad();paint();
 }
 if(mode!=='endgame-survivor'&&now>=state.endsAt)finish();
}
function checkEndgame(){
 if(!state.chess.isGameOver())return false;
 if(state.chess.isCheckmate()&&state.chess.turn()==='b'){
  score(1);status('Checkmate against Stockfish!');nextLevel();
 }else{
  lose('The position ended in a draw or a loss.');
  if(!state.finished)nextLevel();
 }
 return true;
}
function stopBot(){botToken++;try{botWorker?.postMessage({action:'stop'});botWorker?.terminate()}catch{}botWorker=null}
function stockfishQueenEscape(){
 stopBot();
 const token=++botToken;
 const finalize=result=>{
  if(token!==botToken||!state||state.finished||state.phase!=='thinking'||mode!=='queen-chase')return;
  stopBot();
  const queen=state.queen;
  const vacant={...state.pieces};delete vacant[queen];
  const candidates=moves('Q',queen,state.pieces,{side:'enemy'})
   .filter(i=>!vacant[i]&&!threatened(i,{...vacant,[i]:{type:'Q',side:'enemy'}},'player'));
  let target=Number.isInteger(result)&&candidates.includes(result)?result:queenEscape(state.pieces,queen);
  if(!Number.isInteger(target)||target<0){successfulCapture();paint();return}
  delete state.pieces[queen];state.pieces[target]={type:'Q',side:'enemy'};state.queen=target;
  state.phase='playing';status('Queen escaped to '+square(target)+'. Close the net!');
  paint();
 };
 try{
  const worker=new Worker('/arcade-queen-stockfish-worker.js',{type:'module'});botWorker=worker;
  worker.onmessage=e=>finalize(e.data?.to);
  worker.onerror=()=>finalize(-1);
  worker.postMessage({token,pieces:state.pieces,queen:state.queen});
 }catch{finalize(-1)}
}
function stockfishMove(){
 stopBot();
 if(!state||state.finished)return;
 const token=++botToken;
 try{
  const worker=new Worker('/play-strong-bot-worker.js',{type:'module'});botWorker=worker;
  worker.onmessage=e=>{
   if(token!==botToken||!state||state.finished||state.phase!=='thinking')return;
   const m=e.data?.move;
   if(!m){stopBot();status('Stockfish unavailable. Restart this level.');state.phase='waiting';paint();return}
   try{state.chess.move(m)}catch{stopBot();status('Engine returned an illegal move. Please restart.');state.phase='waiting';paint();return}
   stopBot();
   if(checkEndgame()){paint();return}
   state.phase='playing';status('Stockfish played. Your turn.');paint();
  };
  worker.onerror=()=>{if(token!==botToken)return;stopBot();state.phase='waiting';status('Stockfish could not start. Finish this run or play again.');paint()};
  worker.postMessage({token,fen:state.chess.fen(),elo:3190,fullStrength:true});
 }catch{state.phase='waiting';status('Stockfish unavailable. Please try again.')}
}
async function getSession(){
 try{
  const r=await fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return;const data=await r.json();
  account=data.user||null;
  if(account?.username){$('arcade-nickname').value=account.username;$('arcade-nickname').disabled=true;}
 }catch{}
}
async function start(){
 stopBot();clearInterval(clockTimer);resetAnnotations();controls.cancelDrag();
 const now=Date.now(),s=seed();
 state={mode,seed:s,score:0,level:1,lives:['endgame-survivor','missing-piece','chess-memory','safe-square-rush','chess-block-party','pawn-dash'].includes(mode)?3:null,startedAt:now,endsAt:now+180000,finished:false,phase:'playing',pieces:{}};
 submitted=false;session=null;palettePiece=null;
 $('arcade-submit-panel').hidden=true;$('arcade-submit-status').textContent='';
 $('arcade-start').textContent='Restart game';
 $('arcade-finish').hidden=false;
 $('arcade-time').textContent=mode==='endgame-survivor'?'∞':'3:00';
 setupLevel();paint();
 clockTimer=setInterval(tick,100);
 tick();
 try{
  const r=await fetch('/api/arcade',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'start',mode}),cache:'no-store'});
  if(r.ok){const data=await r.json();if(state?.startedAt===now)session=data.session;}
  else status(($('arcade-status').textContent||'')+' Online scores are currently unavailable.');
 }catch{status(($('arcade-status').textContent||'')+' Online scores are currently unavailable.')}
}
function finish(){
 if(!state||state.finished)return;
 state.finished=true;state.phase='done';clearInterval(clockTimer);stopBot();controls.cancelDrag();
 $('arcade-finish').hidden=true;
 $('arcade-final-score').textContent='Final score: '+state.score+' points · level '+state.level+'.';
 $('arcade-submit-panel').hidden=false;
 $('arcade-submit').disabled=state.score<1;
 $('arcade-submit-status').textContent=state.score<1?'Score at least one point to enter the Top 100.':'';
 if(mode!=='endgame-survivor')$('arcade-time').textContent=clockLabel(timeLeft());
 status('Run finished with '+state.score+' points. You can play again or submit your score.');
 paint();
}
async function submit(){
 if(!state?.finished||submitted||state.score<1)return;
 const b=$('arcade-submit');b.disabled=true;
 $('arcade-submit-status').textContent='Submitting score…';
 if(!session){$('arcade-submit-status').textContent='No online game session. Score cannot be submitted. Play again when connected.';return}
 await getSession();
 try{
  const r=await fetch('/api/arcade',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'submit',session,mode,score:state.score,nickname:$('arcade-nickname').value.trim(),sourceType:account?'account':'nickname'})});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Submission failed.');
  submitted=true;$('arcade-submit-status').textContent='Score saved (provisional arcade ranking).';
  await loadRanking();
 }catch(e){$('arcade-submit-status').textContent=e.message;b.disabled=false;}
}
async function loadRanking(){
 const list=$('arcade-ranking');list.replaceChildren();
 try{
  const r=await fetch('/api/arcade?mode='+encodeURIComponent(mode)+'&limit=100',{cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Unavailable');
  if(!Array.isArray(data.entries))throw Error('Invalid ranking');
  if(!data.entries.length){const li=document.createElement('li');li.className='arcade-empty';li.textContent='No scores yet. Be the first!';list.append(li);return}
  for(const row of data.entries){
   const li=document.createElement('li');const n=document.createElement(row.profileVerified?'a':'span');
   n.textContent=row.nickname;n.className='nickname'+(row.sourceType==='account'?' account':'');
   if(row.profileVerified)n.href='/profile/'+encodeURIComponent(row.nickname);
   const points=document.createElement('span');points.className='score';points.textContent=String(row.score);
   li.append(n,points);list.append(li);
  }
 }catch(e){const li=document.createElement('li');li.className='arcade-empty';li.textContent='Rankings temporarily unavailable: '+e.message;list.append(li);}
}
$('arcade-start').addEventListener('click',start);
$('arcade-finish').addEventListener('click',finish);
$('arcade-submit').addEventListener('click',submit);
$('arcade-next').addEventListener('click',nextLevel);
window.addEventListener('elo-account-changed',e=>{account=e.detail?.user||null;if(account?.username){$('arcade-nickname').value=account.username;$('arcade-nickname').disabled=true}});
window.addEventListener('pagehide',stopBot);
void getSession();void loadRanking();paint();
