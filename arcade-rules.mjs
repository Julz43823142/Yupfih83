// Shared, DOM-free rules for the EloScanner arcade boards.
// Board indexes are a8=0 ... h1=63, matching the piece artwork and controls.
export const GAME_CATALOG = Object.freeze([
 {id:'endgame-survivor',name:'Endgame Survivor',icon:'♔',description:'Convert winning endgames against the strongest Stockfish. Three lives.'},
 {id:'guess-the-elo',name:'Guess the Elo',icon:'♟',description:'Study a short game and estimate the player strength.'},
 {id:'chess-memory',name:'Chess Memory',icon:'♙',description:'Remember a position, then rebuild it against the clock.'},
 {id:'missing-piece',name:'Missing Piece',icon:'♕',description:'Place the missing piece, watch the reply, then deliver mate in one.'},
 {id:'safe-square-rush',name:'Safe Square Rush',icon:'♚',description:'Move kings, knights, bishops, rooks and queens to safe squares in three minutes.'},
 {id:'falling-board',name:'Falling Board',icon:'♞',description:'Four coloured knights race on a collapsing board. Three bots, no captures or multiplayer.'},
 {id:'queen-chase',name:'Queen Chase',icon:'♛',description:'Corner and capture an escaping queen with your team of pieces.'},
 {id:'chess-block-party',name:'Chess Block Party',icon:'♜',description:'Reach the announced colour with your knight, bishop or rook in three minutes.'},
 {id:'pawn-dash',name:'Pawn Dash',icon:'♟',description:'Cross a chess-themed obstacle course with your pawn.'}
]);
export const IDs=new Set(GAME_CATALOG.map(g=>g.id));
export const MISSING_PUZZLES = Object.freeze([
 {fen:'7k/p7/5K2/8/8/8/8/8 b - - 0 1',square:'g6',piece:'Q',response:['a7','a6'],mate:['g6','g7']},
 {fen:'7k/p4K2/8/8/8/8/8/8 b - - 0 1',square:'g6',piece:'Q',response:['a7','a5'],mate:['g6','g7']},
 {fen:'k7/7p/2K5/8/8/8/8/8 b - - 0 1',square:'b6',piece:'Q',response:['h7','h6'],mate:['b6','b7']},
 {fen:'k7/2K4p/8/8/8/8/8/8 b - - 0 1',square:'b6',piece:'Q',response:['h7','h5'],mate:['b6','b7']}
]);
export const COLORS=['#ee6686','#f7be57','#70d4ef','#79dba5','#a99dfb','#ef96ed','#e9e6b9','#fb985d'];
export const KNIGHT_COLORS=['#52bdff','#f67878','#ffd16a','#8ce597'];
export const xy=i=>[i%8,Math.floor(i/8)];
export const at=(x,y)=>x>=0&&x<8&&y>=0&&y<8?y*8+x:-1;
export const square=i=>i>=0&&i<64?'abcdefgh'[i%8]+(8-Math.floor(i/8)):null;
export const cell=s=>typeof s==='string'&&/^[a-h][1-8]$/.test(s)?at(s.charCodeAt(0)-97,8-Number(s[1])):-1;
export function makeRandom(seed){
 let s=2166136261;for(const c of String(seed))s=Math.imul(s^c.charCodeAt(0),16777619)>>>0;
 return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}
export function shuffle(items,rand=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function moves(type,from,pieces={},options={}){
 if(from<0||from>=64)return [];
 const [x,y]=xy(from),unit=type.toUpperCase(),out=[];
 const empty=i=>i>=0&&(!pieces[i]||options.passThrough===true);
 const opponent=i=>i>=0&&!!pieces[i]&&pieces[i].side!==options.side;
 if(unit==='N'||unit==='K'){
  const deltas=unit==='N'?[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for(const [dx,dy] of deltas){const t=at(x+dx,y+dy);if(empty(t)||(options.capture&&opponent(t)))out.push(t)}
 }else if(unit==='P'){
  // Pawn Dash is an arcade crossing game: left/right diagonal hops do
  // not require a capture, unlike orthodox chess. Other modes use chess.js.
  for(const dx of options.arcadePawn?[-1,0,1]:[0]){const t=at(x+dx,y-1);if(empty(t)||(dx!==0&&options.capture&&opponent(t)))out.push(t)}
 }else if('RBQ'.includes(unit)){
  const dirs=[...(unit==='R'||unit==='Q'?[[1,0],[-1,0],[0,1],[0,-1]]:[]),...(unit==='B'||unit==='Q'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[])];
  for(const [dx,dy] of dirs){for(let step=1;step<8;step++){const t=at(x+dx*step,y+dy*step);if(t<0)break;if(empty(t)){out.push(t);continue}if(options.capture&&opponent(t))out.push(t);break}}
 }
 return out;
}
export const threatened=(target,pieces,by='enemy')=>Object.entries(pieces).some(([i,p])=>p.side===by&&moves(p.type,Number(i),pieces,{side:by,capture:true}).includes(target));
export const safeMoves=(type,from,pieces={},side='player')=>moves(type,from,pieces,{side,capture:false}).filter(i=>{const next={...pieces};delete next[from];next[i]={type,side};return !threatened(i,next,'enemy')});
export function knightsAlive(state){
 return state.knights.filter(k=>k.alive).length;
}
export function knightOptions(state,id){
 const k=state.knights.find(k=>k.id===id);
 if(!k?.alive)return [];
 const occupied=Object.fromEntries(state.knights.filter(a=>a.alive).map(a=>[a.pos,{type:'N',side:a.id}]));
 return moves('N',k.pos,occupied).filter(i=>!state.gone.includes(i));
}
export function stepKnight(state,id,to,now){
 if(!Number.isInteger(to)||!knightOptions(state,id).includes(to))return false;
 const k=state.knights.find(k=>k.id===id);state.gone.push(k.pos);
 k.pos=to;k.lastAt=now;state.turns++;
 if(!knightOptions(state,id).length)k.alive=false;
 return true;
}
export function freshFalling(seed){
 const rand=makeRandom(seed);
 const starts=shuffle([0,7,56,63],rand);
 return {knights:starts.map((pos,id)=>({id,pos,alive:true,lastAt:0})),gone:[],turns:0};
}
export function blockPartyLevel(seed,n){
 const rand=makeRandom(seed+':block:'+n);
 const type=['N','B','R'][n%3];
 const pos=at(2+Math.floor(rand()*4),2+Math.floor(rand()*4));
 const palette=Array.from({length:64},()=>Math.floor(rand()*COLORS.length));
 const reachable=moves(type,pos);
 const possible=shuffle([...new Set(reachable.map(i=>palette[i]))],rand);
 return {type,pos,palette,target:possible[0]??palette[pos],seconds:Math.max(1.5,3.6-n*.045)};
}
export function safeSquareLevel(seed,n){
 const rand=makeRandom(seed+':safe:'+n);
 const type=['K','N','B','R','Q'][Math.floor((n-1)/3)%5];
 for(let attempt=0;attempt<80;attempt++){
  const pos=at(2+Math.floor(rand()*4),2+Math.floor(rand()*4)),pieces={[pos]:{type,side:'player'}};
  const enemyTypes=['R','B','N','Q'];
  for(let j=0;j<Math.min(1+Math.floor(n/3),5);j++){
   const free=shuffle(Array.from({length:64},(_,i)=>i).filter(i=>!pieces[i]&&i!==pos),rand);
   if(free.length)pieces[free[0]]={type:enemyTypes[(j+n)%enemyTypes.length],side:'enemy'};
  }
  const safe=safeMoves(type,pos,pieces);const danger=moves(type,pos,pieces,{side:'player'}).filter(i=>!safe.includes(i));
  if(safe.length&&danger.length)return {type,pos,pieces,safe};
 }
 return {type,pos:27,pieces:{27:{type,side:'player'},0:{type:'R',side:'enemy'}},safe:[...safeMoves(type,27,{27:{type,side:'player'},0:{type:'R',side:'enemy'}})]};
}
export function memoryLevel(seed,n){
 const rand=makeRandom(seed+':memory:'+n);
 const count=Math.min(11,3+Math.ceil(n/2));
 const free=shuffle(Array.from({length:64},(_,i)=>i),rand);
 const types=['K','Q','R','B','N','P'],pieces={};
 for(let j=0;j<count;j++)pieces[free[j]]={type:types[(j+Math.floor(rand()*types.length))%types.length],side:j%3===0?'enemy':'player'};
 return pieces;
}
export function pawnEnemies(seed,n){
 const rand=makeRandom(seed+':pawn:'+n);
 const list=[];
 for(let row=1;row<=6;row++){const y=row,x=Math.floor(rand()*8);list.push({y,x,dir:rand()>.5?1:-1,type:row%2?'R':'B'});}
 return list;
}
export function queenEscape(pieces,queenPos){
 // Re-evaluate attacks after the queen VACATES her original square.
 // Otherwise her old position incorrectly blocks rook/bishop rays.
 const from={...pieces};delete from[queenPos];
 const occupied={...from,[queenPos]:{type:'Q',side:'enemy'}};
 const candidates=moves('Q',queenPos,occupied,{side:'enemy'})
  .filter(t=>!from[t]&&!threatened(t,{...from,[t]:{type:'Q',side:'enemy'}},'player'));
 if(!candidates.length)return -1;
 const score=t=>{
  const next={...from,[t]:{type:'Q',side:'enemy'}};
  const mobility=moves('Q',t,next,{side:'enemy'})
   .filter(i=>!next[i]&&!threatened(i,{...from,[i]:{type:'Q',side:'enemy'}},'player')).length;
  const [x,y]=xy(t),edge=Math.min(x,7-x,y,7-y);
  return mobility*30+edge*2;
 };
 return candidates.sort((a,b)=>score(b)-score(a)||a-b)[0];
}

// Piecewise Elo guessing rewards: exact = 10, 50 away = 5, 100 = 4, 200 = 3.
export function guessEloPoints(diff){
 if(!Number.isFinite(diff)||diff<0)return 0;
 return diff===0?10:diff<=10?9:diff<=25?7:diff<=50?5:diff<=100?4:diff<=200?3:diff<=300?2:diff<=450?1:0;
}
