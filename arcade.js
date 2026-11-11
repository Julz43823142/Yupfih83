import {Chess} from './vendor/chess/chess-1.4.0.mjs';
import {attachChessBoardControls} from './chess-board-controls.js';
import {appendChessArrow} from './chess-board-arrows.js';
import {GAME_CATALOG,IDs,MISSING_PUZZLES,COLORS,KNIGHT_COLORS,xy,at,cell,square,makeRandom,shuffle,moves,safeMoves,threatened,freshFalling,knightOptions,stepKnight,knightsAlive,blockPartyLevel,safeSquareLevel,memoryLevel,pawnEnemies,queenEscape,guessEloPoints} from './arcade-rules.mjs';

const $=id=>document.getElementById(id);
window.__eloArcadeLoaded=true;
const board=$('arcade-board'),modeParam=new URLSearchParams(location.search).get('game');
const mode=IDs.has(modeParam)?modeParam:'endgame-survivor';
const info=GAME_CATALOG.find(g=>g.id===mode);
$('arcade-title').textContent=info.name;
$('arcade-description').textContent=info.description;
$('arcade-ranking-name').textContent=info.name;
$('arcade-ranking-link').href='/puzzle-top100.html?mode='+encodeURIComponent(mode);
document.title=info.name+' | EloScanner';
const instructions={
 'endgame-survivor':'Play increasingly varied endgames: pawns, minor pieces and rooks against Stockfish. Convert an advantage into a win. You have three lives; a draw or loss costs one. Every win is one point.',
 'guess-the-elo':'Review a real Lichess game, browse its moves, then enter your own Elo estimate. Exact = 10 points; 50 Elo away = 5, 100 = 4 and 200 = 3. The actual Elo and game link are revealed afterward.',
 'chess-memory':'Memorize the position while it is visible. After the pieces disappear, choose a piece from the tray and click or drag it onto the correct square. Reconstruct as many boards as possible in three minutes.',
 'missing-piece':'Select a white piece from the tray, then tap an empty square. Black responds; find checkmate in one. Any valid solution counts, including alternative pieces and placements. Three mistakes end the run.',
 'safe-square-rush':'Find a safe square without colour hints. Every completed level scores. Three minutes; three lives.',
 'falling-board':'You control the blue knight against three computer-controlled knights. Every square disappears when a knight leaves it. Nobody can capture another knight. You must move within three seconds. Last knight standing wins the round. No multiplayer.',
 'queen-chase':'Control the white police pieces and surround the escaping black queen. Only the queen moves for the computer. Capture it or trap every escape to score and start a harder round.',
 'chess-block-party':'Each level announces a colour. Move your knight, bishop or rook onto a matching square before it is too late. Other colours collapse. Earn as many level points as you can in three minutes.',
 'pawn-dash':'Cross a giant chessboard inside the Pawn Kingdom Chess Club. Collect one coin per token, hop across clockwork gaps, dodge moving chess pieces and visit Menu → Shop for six chess-piece categories with five skins each. Original background music and adjustable sound effects included.'
};
$('arcade-instructions').textContent=instructions[mode];

let runOffset=Math.floor(Math.random()*1000000),feedbackUntil=0,reviewStep=0,runReview=[];
const eloSeen=(()=>{try{const a=JSON.parse(localStorage.getItem('elo-arcade-seen-v2')||'[]');return Array.isArray(a)?a.filter(x=>/^[a-zA-Z0-9]{6,20}$/.test(x)).slice(-30):[]}catch{return []}})();
function rememberEloGame(id){if(!/^[a-zA-Z0-9]{6,20}$/.test(String(id)))return;const old=eloSeen.indexOf(id);if(old>=0)eloSeen.splice(old,1);eloSeen.push(id);while(eloSeen.length>30)eloSeen.shift();try{localStorage.setItem('elo-arcade-seen-v2',JSON.stringify(eloSeen))}catch{}}
let state=null,selected=null,palettePiece=null,submitted=false,session=null,botWorker=null,botToken=0,clockTimer=null,account=null,pawnWorld=null,queuedPremove=null,premovePointer=null;
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
  const chess=mode==='guess-the-elo'?(state.eloView||state.chess):state.chess;
  const list={};
  for(let i=0;i<64;i++){const p=chess.get(square(i));if(p)list[i]={type:p.type.toUpperCase(),side:p.color==='w'?'player':'enemy'};}
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
 if(mode==='endgame-survivor'&&state?.lastOpponentMove)appendChessArrow(marksLayer,state.lastOpponentMove.from,state.lastOpponentMove.to,'#ffd86a',.93);
 if(queuedPremove)appendChessArrow(marksLayer,square(queuedPremove.from),square(queuedPremove.to),'#48f2e0',.9);
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
  if(p?.colour)classes+=' knight-'+p.colour;
  if(sources.includes(i)&&mode!=='chess-block-party')classes+=' available';
  if(state&&mode==='falling-board'&&state.falling.gone.includes(i))classes+=' lost';
  if(state&&mode==='chess-block-party'){
   classes+=' board-color';
   el.style.setProperty('--board-color',COLORS[state.block.palette[i]]);
  }else el.style.removeProperty('--board-color');
  if(state&&mode==='pawn-dash'&&state.stars?.includes(i))classes+=' star';
  const standingKnight=state&&mode==='falling-board'?state.falling?.knights.find(k=>k.alive&&k.pos===i):null;
  if(standingKnight){
   const elapsed=(Date.now()-standingKnight.lastAt)/30;
   el.style.setProperty('--lava-progress',Math.min(100,Math.max(0,elapsed))+'%');
   el.style.setProperty('--lava-opacity',standingKnight.id===0?'0.94':'0.43');
   classes+=' lava-tile';
  }else if(state&&mode==='chess-block-party'&&i===state.block?.pos&&state.phase==='playing'){
   const elapsed=100*(Date.now()-(state.levelUntil-state.block.seconds*1000))/(state.block.seconds*1000);
   el.style.setProperty('--lava-progress',Math.min(100,Math.max(0,elapsed))+'%');
   el.style.setProperty('--lava-opacity','0.94');classes+=' lava-tile';
  }else{el.style.removeProperty('--lava-progress');el.style.removeProperty('--lava-opacity')}
  if(state&&mode==='chess-memory'&&state.phase==='build'&&state.placed[i]&&state.answer[i])classes+=' safe-zone';
  el.className=classes;
  const existing=el.querySelector(':scope > .chess-piece');
  if(id!==el.dataset.pieceKey){
   if(existing)existing.remove();
   if(p)el.append(pieceImage(p));
   el.dataset.pieceKey=id;
  }
  const label=square(i)+(p?', '+(p.colour?p.colour+' ':p.side==='player'?'white ':'black ')+(letters[p.type]||p.type):'')+(sources.includes(i)?', available move':'');
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
function score(points){state.score+=points;recordReview('Correct · +'+points+' point'+(points===1?'':'s'),true);flashFeedback('Correct! +'+points);paint()}
function flashFeedback(message){const el=$('arcade-feedback');if(!el)return;el.textContent=message;el.classList.add('visible');el.classList.toggle('incorrect',message.startsWith('Incorrect'));feedbackUntil=Date.now()+1100}
function recordReview(message,correct=false){if(!state||state.finished)return;runReview.push({message,correct,level:state.level,position:structuredClone(currentPosition()),palette:state.block?.palette?.slice(),safe:state.safe?.safe?.slice(),answer:mode==='chess-memory'?structuredClone(state.answer):null});if(runReview.length>150)runReview.shift()}
function displayReview(){const wrap=$('arcade-review');if(!wrap||!runReview.length)return;wrap.replaceChildren();wrap.hidden=false;const title=document.createElement('h3');title.textContent='Round review · '+runReview.length+' moments';wrap.append(title);const buttons=document.createElement('div');buttons.className='arcade-review-nav';const prev=document.createElement('button'),next=document.createElement('button'),counter=document.createElement('span'),label=document.createElement('p'),mini=document.createElement('div');prev.textContent='← Previous';next.textContent='Next →';mini.className='arcade-review-board';const render=()=>{const item=runReview[reviewStep];counter.textContent=(reviewStep+1)+' / '+runReview.length+' · Level '+item.level;label.textContent=item.message;label.className=item.correct?'review-correct':'review-error';mini.replaceChildren();for(let i=0;i<64;i++){const el=document.createElement('span');el.className=(Math.floor(i/8)+i%8)%2?'dark':'light';const p=item.position[i]||item.answer?.[i];if(!item.position[i]&&item.answer?.[i])el.classList.add('review-ghost');if(item.palette)el.style.background=COLORS[item.palette[i]];else if(item.safe?.includes(i))el.style.background='#278b76';el.textContent=p?({'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙'}[p.type]||'♙'):'';if(p?.side==='enemy')el.classList.add('enemy');mini.append(el)}prev.disabled=reviewStep===0;next.disabled=reviewStep===runReview.length-1};prev.onclick=()=>{reviewStep--;render()};next.onclick=()=>{reviewStep++;render()};buttons.append(prev,counter,next);wrap.append(buttons,label,mini);render()}
function lose(message){
 if(!state||state.finished)return;
 recordReview('Mistake: '+message,false);flashFeedback('Incorrect!');
 state.lives--;status(message+' '+(state.lives>0?'Lives remaining: '+state.lives:'No lives left.'));
 if(state.lives<=0){finish();return}
}
function nextLevel(){
 if(!state||state.finished)return;
 $('arcade-next').hidden=true;state.level++;
 resetAnnotations();
 setupLevel();
 paint();
}
const endgames=[
 // Start with material-balanced conversion problems, not instant queen/rook mates.
 '4r1k1/5ppp/8/4P3/3P4/8/5PPP/3R2K1 w - - 0 1',
 '8/5pk1/5np1/8/4P3/3N2P1/5P1P/6K1 w - - 0 1',
 '6k1/5ppp/8/8/4P3/5P2/6PP/6K1 w - - 0 1',
 '8/4k3/8/3P1K2/8/8/8/8 w - - 0 1',
 '6k1/5p1p/6p1/8/3PP3/6P1/5P1P/6K1 w - - 0 1',
 '8/5pk1/5np1/8/4P3/3N2P1/5P1P/6K1 w - - 0 1',
 '8/5pk1/4p1p1/8/3PP3/4B1P1/5P1P/6K1 w - - 0 1',
 '6k1/5ppp/8/8/8/1P3P2/P5PP/2R3K1 w - - 0 1',
 '8/6kp/5pp1/8/2P5/3P2P1/5P1P/4R1K1 w - - 0 1'
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
const missing=MISSING_PUZZLES;
function setupLevel(){
 if(state.finished)return;
 state.phase='playing';state.pieces={};palettePiece=null;premoveSource=null;queuedPremove=null;
 $('arcade-choices').replaceChildren();$('arcade-choices').hidden=true;
 $('arcade-palette').replaceChildren();$('arcade-palette').hidden=true;
 if(mode==='endgame-survivor'){
  const rng=makeRandom(state.seed+':endgame:'+state.level),index=(state.level-1+state.positionOffset)%endgames.length;
  state.chess=new Chess(endgames[index]);
  // Create different but fully legal starting variations from each endgame family.
  for(let i=0,plies=Math.floor(rng()*6)*2;i<plies;i++){const candidates=state.chess.moves({verbose:true});if(!candidates.length)break;state.chess.move(candidates[Math.floor(rng()*candidates.length)]);if(state.chess.isGameOver())break}
  if(state.chess.isGameOver())state.chess=new Chess(endgames[index]);
  status('Challenging endgame. White to move; win against Stockfish for one point.');
 }else if(mode==='guess-the-elo'){
  state.chess=new Chess();state.eloView=new Chess();state.phase='waiting';
  status('Loading a different finished Chess.com game…');
  void loadRealEloGame(state);
 }else if(mode==='chess-memory'){
  state.answer=memoryLevel(state.seed,state.level);state.placed={};state.phase='preview';
  state.revealUntil=Date.now()+Math.max(2700,6500-state.level*200);
  status('Memorize the pieces! They disappear shortly.');
 }else if(mode==='missing-piece'){
  state.puzzle=missing[(state.level-1+state.positionOffset)%missing.length];
  state.chess=new Chess(state.puzzle.fen);state.phase='placement';
  palette(['Q','R','B','N'].map(type=>({type,side:'player'})));
  status('Step 1: Choose a white piece below. Step 2: Place it on an empty square. Step 3: After Black replies, find mate in one. Other valid solutions count.');
 }else if(mode==='safe-square-rush'){
  state.safe=safeSquareLevel(state.seed,state.level);
  state.pieces=state.safe.pieces;
  state.levelUntil=Date.now()+Math.max(1500,4600-state.level*55);
  status('Find a safe square with your '+(letters[state.safe.type]||state.safe.type)+'. No hints!');
 }else if(mode==='falling-board'){
  state.falling=freshFalling(state.seed+':'+state.level);
  const now=Date.now();state.botDue=Object.fromEntries([1,2,3].map(id=>[id,now+300+Math.random()*1000]));
  for(const k of state.falling.knights)k.lastAt=now;
  status('Blue knight is yours. Jump within 3 seconds. Last knight standing wins.');
 }else if(mode==='queen-chase'){
  const rand=makeRandom(state.seed+':queen:'+state.level);
  const q=[18,19,20,21,26,27,28,29,34,35,36,37,42,43,44,45][Math.floor(rand()*16)];
  const pick=pool=>pool[Math.floor(rand()*pool.length)];
  const r1=pick([0,1,2,3,4,5,6,7]),r2=pick([56,57,58,59,60,61,62,63]),n=pick([40,41,42,43,44,45,46,47].filter(i=>i!==q)),bishop=pick([48,49,50,51,52,53,54,55]);
  state.pieces={[r1]:{type:'R',side:'player'},[r2]:{type:'R',side:'player'},[n]:{type:'N',side:'player'},[bishop]:{type:'B',side:'player'},[q]:{type:'Q',side:'enemy'}};
  state.queen=q;state.turns=0;state.phase='playing';
  status('Move your officers to corner the queen. She can only move, not capture.');
 }else if(mode==='chess-block-party'){
  state.block=blockPartyLevel(state.seed,state.level);
  state.pieces={[state.block.pos]:{type:state.block.type,side:'player'}};
  state.levelUntil=Date.now()+Math.round(state.block.seconds*1000);
  status('MOVE TO '+['RED','YELLOW','CYAN','GREEN','PURPLE','PINK','CREAM','ORANGE'][state.block.target]+'! Use your '+letters[state.block.type]+'.');
 }else if(mode==='pawn-dash'){
  status('Welcome to Pawn Kingdom Chess Club! Hop across the board, collect 1 coin per token and browse Menu → Shop.');
  board.hidden=true;pawnWorld?.destroy();
  import('./pawn-world.js?v=20261111-stage12').then(({createPawnWorld})=>{
   if(!state||state.finished||mode!=='pawn-dash')return;
   pawnWorld=createPawnWorld({host:board.parentElement,seed:state.seed,onScore:n=>{if(!state?.finished)score(n)},onHit:()=>{if(!state?.finished){lose('An enemy chess piece caught you, or you stepped into the river.');paint()}},onStatus:message=>status(message),onPauseChange:paused=>{if(!state)return;if(paused)state.pausedAt=Date.now();else if(state.pausedAt){state.endsAt+=Date.now()-state.pausedAt;state.pausedAt=0}}});
  }).catch(error=>{board.hidden=false;console.error('Pawn Dash world startup failed:',error);status('Pawn Dash could not start: '+(error?.message||'Unknown error')+'. Please refresh and retry.')});
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
    flashFeedback('Correct!');
   state.placed[to]={...palettePiece};const n=Object.keys(state.placed).length,total=Object.keys(state.answer).length;
   status(n+' of '+total+' pieces placed.');
   if(n===total){score(1);status('Perfect board! +1 point.');nextLevel();}
  }else{lose('Incorrect '+palettePiece.type+' at '+square(to)+'.');}
  paint();return;
 }
 if(mode==='missing-piece'&&state.phase==='placement'){
  const p=state.puzzle,trial=new Chess(p.fen);
  // Check EVERY legal Black reply. A solution is not tied to the one
  // canned pawn move in the seed, and any legal mating move is accepted.
  const dest=square(to),ok=trial.put({type:palettePiece.type.toLowerCase(),color:'w'},dest);
  if(ok&&trial.isCheckmate()){state.chess=trial;score(1);status('Checkmate immediately! Valid alternate solution.');nextLevel();paint();return}
  let chosen=null;
  if(ok&&!trial.isStalemate()){
   const replies=trial.moves({verbose:true});
   const preferred=replies.find(m=>m.from===p.response[0]&&m.to===p.response[1]);
   if(preferred){replies.splice(replies.indexOf(preferred),1);replies.unshift(preferred)}
   for(const reply of replies){
    const after=new Chess(trial.fen());after.move(reply);
    const mating=after.moves({verbose:true}).some(m=>{
     const candidate=new Chess(after.fen());candidate.move(m);return candidate.isCheckmate()
    });
    if(mating){chosen={after,reply};break}
   }
  }
  if(!chosen){
   lose('No mate in one follows '+palettePiece.type+' on '+dest+'. Example: '+p.piece+' on '+p.square+'.');
   paint();return
  }
  state.chess=chosen.after;state.phase='mate';
  $('arcade-palette').hidden=true;palettePiece=null;
  flashFeedback('Valid placement!');status('Black plays '+chosen.reply.san+'. Find any checkmate in one — alternative moves count.');
  paint();return;
 }
}
function guessElo(guess){
 if(!state||state.finished||state.phase!=='guess'||!Number.isInteger(guess)||guess<100||guess>4000)return;
 const diff=Math.abs(guess-state.answer),points=guessEloPoints(diff);
 state.score+=points;recordReview('Guess '+guess+' · Actual '+state.answer+' · '+diff+' Elo away · +'+points+' points',diff<=50);flashFeedback(diff<=50?'Excellent guess!':'Off by '+diff+' Elo');paint();state.phase='revealed';
 const choices=$('arcade-choices');choices.replaceChildren();choices.hidden=false;
 const answer=document.createElement('strong');answer.className='arcade-elo-reveal';answer.textContent='Actual '+state.eloSide+' Elo: '+state.answer+' · Your guess: '+guess+' · +'+points+' points';
 const link=document.createElement('a');link.href=state.eloLink;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View the real '+state.eloPlatform+' game ↗';choices.append(answer,link);
 $('arcade-next').hidden=false;status('Rating revealed. You were '+diff+' Elo away. Continue when ready.');
}
async function loadRealEloGame(run){
 const choices=$('arcade-choices');choices.replaceChildren();choices.hidden=true;
 run.eloAbort?.abort();run.eloAbort=new AbortController();
 try{
  const response=await fetch('/api/arcade-game?exclude='+encodeURIComponent(eloSeen.join(',')),{cache:'no-store',signal:run.eloAbort.signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Game unavailable');
  if(state!==run||state.finished)return;
  if(!Number.isInteger(data.elo)||!/^https:\/\/(?:lichess\.org\/[A-Za-z0-9]+|www\.chess\.com\/game\/(?:live|daily)\/[0-9]+)$/.test(data.link))throw Error('Invalid real game');
  const validate=new Chess(),moves=[];
  if(data.platform==='chesscom'&&typeof data.pgn==='string'){validate.loadPgn(data.pgn);moves.push(...validate.history({verbose:true}))}
  else for(const uci of data.moves||[]){const move=validate.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});if(!move)throw Error('Invalid game record');moves.push(move)}
  if(moves.length<12)throw Error('Incomplete game record');
  rememberEloGame(data.id);state.answer=data.elo;state.eloSide=data.side;state.eloLink=data.link;state.eloGameId=data.id;state.eloPlatform=data.platform==='chesscom'?'Chess.com':'Lichess';state.eloMoves=moves;state.eloIndex=0;state.eloView=new Chess();state.phase='guess';
  const prompt=document.createElement('p');prompt.textContent='Real '+state.eloPlatform+' game · Estimate the '+data.side+' player Elo.';
  const prev=document.createElement('button');prev.type='button';prev.textContent='◀ Previous move';
  const progress=document.createElement('span');progress.className='arcade-elo-progress';
  const next=document.createElement('button');next.type='button';next.textContent='Next move ▶';
  const guess=document.createElement('input');guess.type='number';guess.min='100';guess.max='4000';guess.step='1';guess.placeholder='Your Elo estimate';guess.setAttribute('aria-label','Your Elo estimate');guess.className='arcade-elo-input';
  const submit=document.createElement('button');submit.type='button';submit.textContent='Reveal Elo & score';
  const navigate=delta=>{const index=Math.max(0,Math.min(moves.length,state.eloIndex+delta));state.eloIndex=index;state.eloView=new Chess();for(let i=0;i<index;i++)state.eloView.move(moves[i]);progress.textContent=index+' / '+moves.length+' half-moves';prev.disabled=index===0;next.disabled=index===moves.length;paint()};
  prev.addEventListener('click',()=>navigate(-1));next.addEventListener('click',()=>navigate(1));
  const keyboard=e=>{if(state!==run||state.phase!=='guess')return;if(e.target?.matches?.('input,textarea,select'))return;if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1)}else if(e.key==='ArrowRight'){e.preventDefault();navigate(1)}};
  window.addEventListener('keydown',keyboard,{signal:run.eloAbort.signal});
  submit.addEventListener('click',()=>{const n=Number(guess.value);if(guess.value!==''&&Number.isInteger(n))guessElo(n);else status('Enter a whole-number Elo estimate first.')});
  guess.addEventListener('keydown',e=>{if(e.key==='Enter')submit.click()});
  choices.append(prompt,prev,progress,next,guess,submit);choices.hidden=false;navigate(0);
  status('Review the real game. Then enter a rating from 100 to 4000.');
 }catch(error){
  if(state!==run||state.finished)return;state.phase='waiting';choices.hidden=false;
  const retry=document.createElement('button');retry.textContent='Retry loading a real game';retry.type='button';retry.addEventListener('click',()=>{retry.disabled=true;void loadRealEloGame(run)});
  choices.replaceChildren(retry);status(error.message||'Could not load a real game.');
 }
}
function applyQueuedPremove(){
 const move=queuedPremove;queuedPremove=null;
 selected=null;
 if(!move||!state||state.finished||state.phase!=='playing')return false;
 if(canMove(move.from,move.to)){play(move.from,move.to);return true}
 status('Premove is no longer legal. Choose another move.');return false;
}
// Premoves permit a friendly-occupied target during planning, like the live
// online board. The actual move is only committed if legal on the next turn.
// During the engine's turn, accept either two clicks or a direct drag.
// This capture-phase handler keeps the shared board controller out of the
// premove gesture, even while the real chess.js position has Black to move.
let premoveSource=null;
function queuePremove(from,to){
 if(from<0||to<0||from===to)return;
 if(getPiece(from)?.side!=='player')return;
 queuedPremove={from,to};premoveSource=null;selected=null;
 status('Premove queued: '+square(from)+' → '+square(to));paint();
}
board.addEventListener('pointerdown',e=>{
 if(e.button!==0||state?.phase!=='thinking'||!['endgame-survivor','queen-chase'].includes(mode))return;
 const i=cell(controls.squareAt(e.clientX,e.clientY));if(i<0)return;
 e.preventDefault();e.stopImmediatePropagation();
 premovePointer={from:i,id:e.pointerId,x:e.clientX,y:e.clientY};
},true);
board.addEventListener('pointerup',e=>{
 if(!premovePointer||e.pointerId!==premovePointer.id)return;
 e.preventDefault();e.stopImmediatePropagation();
 const to=cell(controls.squareAt(e.clientX,e.clientY)),from=premovePointer.from;
 premovePointer=null;if(to<0)return;
 if(to!==from&&getPiece(from)?.side==='player'){queuePremove(from,to);return}
 if(premoveSource!==null&&to!==premoveSource){queuePremove(premoveSource,to);return}
 if(getPiece(to)?.side==='player'){
  premoveSource=premoveSource===to?null:to;selected=premoveSource===null?null:square(premoveSource);
  status(premoveSource===null?'Premove selection cleared.':'Choose the destination for '+square(premoveSource)+' (premove).');paint();
 }
},true);
board.addEventListener('pointercancel',()=>{premovePointer=null},true);
// Allow analysis arrows while a piece is held: the shared board controller
// cancels left-drag on right-click, so handle the combined gesture first.
let heldAnalysisFrom=null;
board.addEventListener('mousedown',e=>{
 if(e.button!==2||!selected||!state||state.finished)return;
 heldAnalysisFrom=selected;e.preventDefault();e.stopImmediatePropagation();
},true);
board.addEventListener('mouseup',e=>{
 if(e.button!==2||!heldAnalysisFrom)return;
 e.preventDefault();e.stopImmediatePropagation();
 const destination=controls.squareAt(e.clientX,e.clientY),from=heldAnalysisFrom;
 heldAnalysisFrom=null;
 if(destination&&from!==destination){marks.push([from,destination,'#0a9cff']);paint()}
},true);
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
  premoveSource=null;queuedPremove=null;state.lastOpponentMove=null;
  state.phase='thinking';status('Stockfish is choosing a quick reply…');
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
 if(!state||state.finished||state.pausedAt)return;
 const now=Date.now();
 if(feedbackUntil&&now>feedbackUntil){$('arcade-feedback')?.classList.remove('visible');feedbackUntil=0}
 if(mode==='falling-board'||mode==='chess-block-party')paint();
 if(mode==='endgame-survivor')$('arcade-time').textContent='∞';
 else $('arcade-time').textContent=clockLabel(timeLeft());
 if(mode==='falling-board'){
  const player=state.falling.knights[0];
  if(player?.alive){
   const left=Math.max(0,3000-(now-player.lastAt));
   $('arcade-move-clock').textContent=(left/1000).toFixed(1)+'s';
   if(left===0){player.alive=false;status('Three seconds expired. Your knight is out.');finish();return}
  }
  for(const k of state.falling.knights.slice(1)){
   if(!k.alive||now<state.botDue[k.id])continue;
   const targets=knightOptions(state.falling,k.id);
   if(!targets.length)k.alive=false;
   else stepKnight(state.falling,k.id,targets[Math.floor(Math.random()*targets.length)],now);
   state.botDue[k.id]=now+260+Math.random()*1450;
   checkFalling();paint();
  }
 }else if(mode==='safe-square-rush'&&state.phase==='playing'&&now>=state.levelUntil){
  lose('Too slow!');if(!state.finished){nextLevel();paint();}
 }else if(mode==='chess-block-party'&&state.phase==='playing'&&now>=state.levelUntil){
  lose('The other colours collapsed!');if(!state.finished){nextLevel();paint();}
 }else if(mode==='chess-memory'&&state.phase==='preview'&&now>=state.revealUntil){
  resetAnnotations();state.phase='build';state.placed={};palette([
   ...['K','Q','R','B','N','P'].map(type=>({type,side:'player'})),
   ...['K','Q','R','B','N','P'].map(type=>({type,side:'enemy'}))
  ]);
  status('Rebuild the position! Choose a piece and place it on its original square.');
  paint();
 }
 if(mode!=='endgame-survivor'&&mode!=='pawn-dash'&&now>=state.endsAt)finish();
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
  if(!applyQueuedPremove())paint();
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
   try{const played=state.chess.move(m);if(!played)throw Error('Illegal response');state.lastOpponentMove={from:played.from,to:played.to};}catch{stopBot();status('Engine returned an illegal move. Please restart.');state.phase='waiting';paint();return}
   stopBot();
   if(checkEndgame()){paint();return}
   state.phase='playing';status('Stockfish played '+state.lastOpponentMove.from+' → '+state.lastOpponentMove.to+'. Your turn.');if(!applyQueuedPremove())paint();
  };
  worker.onerror=()=>{if(token!==botToken)return;stopBot();state.phase='waiting';status('Stockfish could not start. Finish this run or play again.');paint()};
  worker.postMessage({token,fen:state.chess.fen(),elo:3190,fullStrength:true,arcadeFast:true});
 }catch{state.phase='waiting';status('Stockfish unavailable. Please try again.')}
}
async function getSession(){
 try{
  const r=await fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return;const data=await r.json();
  account=data.user||null;
  if(account?.username){$('arcade-nickname').value=account.username.charAt(0).toUpperCase()+account.username.slice(1);$('arcade-nickname').disabled=true;}
 }catch{}
}
async function start(){
 state?.eloAbort?.abort();stopBot();clearInterval(clockTimer);resetAnnotations();controls.cancelDrag();queuedPremove=null;premovePointer=null;pawnWorld?.destroy();pawnWorld=null;board.hidden=false;
 
 const now=Date.now(),s=seed();premoveSource=null;runOffset=(runOffset+1+Math.floor(Math.random()*1000))%1000000;runReview=[];reviewStep=0;$('arcade-review').hidden=true;$('arcade-feedback').classList.remove('visible');
 state={mode,seed:s,positionOffset:runOffset,score:0,level:1,lives:['endgame-survivor','missing-piece','chess-memory','safe-square-rush','chess-block-party','pawn-dash'].includes(mode)?3:null,startedAt:now,endsAt:now+180000,finished:false,phase:'playing',pieces:{}};
 submitted=false;session=null;palettePiece=null;
 $('arcade-submit-panel').hidden=true;$('arcade-submit-status').textContent='';
 $('arcade-start').textContent='Restart game';
 $('arcade-finish').hidden=false;
 $('arcade-time').textContent=(mode==='endgame-survivor'||mode==='pawn-dash')?'∞':'3:00';
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
 queuedPremove=null;pawnWorld?.destroy();pawnWorld=null;state.eloAbort?.abort();
 state.finished=true;state.phase='done';clearInterval(clockTimer);stopBot();controls.cancelDrag();
 $('arcade-finish').hidden=true;
 $('arcade-final-score').textContent='Final score: '+state.score+' points · level '+state.level+'.';
 $('arcade-submit-panel').hidden=false;
 $('arcade-submit').disabled=state.score<1;
 $('arcade-submit-status').textContent=state.score<1?'Score at least one point to enter the Top 100.':'';
 if(mode!=='endgame-survivor'&&mode!=='pawn-dash')$('arcade-time').textContent=clockLabel(timeLeft());
 status('Run finished with '+state.score+' points. Review your moves and mistakes below.');reviewStep=Math.max(0,runReview.length-1);displayReview();
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
   const report=document.createElement('button');report.className='rank-report';report.type='button';report.textContent='Report';report.dataset.nickname=row.nickname;report.dataset.mode=mode;report.dataset.score=String(row.score);
   li.append(n,points,report);list.append(li);
  }
 }catch(e){const li=document.createElement('li');li.className='arcade-empty';li.textContent='Rankings temporarily unavailable: '+e.message;list.append(li);}
}
$('arcade-start').addEventListener('click',start);
$('arcade-finish').addEventListener('click',finish);
$('arcade-submit').addEventListener('click',submit);
$('arcade-next').addEventListener('click',nextLevel);
window.addEventListener('elo-account-changed',e=>{account=e.detail?.user||null;if(account?.username){$('arcade-nickname').value=account.username;$('arcade-nickname').disabled=true}});
window.addEventListener('pagehide',()=>{stopBot();pawnWorld?.destroy()});

void getSession();void loadRanking();paint();
// Pawn Dash is an immersive arcade: launching its card launches the game.
if(mode==='pawn-dash')void start();
