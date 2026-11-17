// Shared chessboard material display for Play, Analysis, Player Prep and Guess the Elo.
// Current positions are authoritative; Stockfish evaluations are deliberately separate.
const VALUES={p:1,n:3,b:3,r:5,q:9};
const START={p:8,n:2,b:2,r:2,q:1};
const ORDER=['q','r','b','n','p'];
const names={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen'};
const instances=new WeakMap();

export function materialSnapshot(fen,{moves=null}={}){
 const pieceField=String(fen||'').split(' ')[0];
 const ranks=pieceField.split('/');
 if(ranks.length!==8)throw Error('Invalid chess position');
 const on={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};
 for(const rank of ranks){
  let squares=0;
  for(const char of rank){
   if(/[1-8]/.test(char)){squares+=Number(char);continue}
   if(!/[pnbrqkPNBRQK]/.test(char))throw Error('Invalid chess piece');
   squares++;
   const kind=char.toLowerCase();
   if(kind!=='k')on[char===char.toUpperCase()?'w':'b'][kind]++;
  }
  if(squares!==8)throw Error('Invalid chess rank');
 }
 const points=color=>ORDER.reduce((total,kind)=>total+on[color][kind]*VALUES[kind],0);
 const white=points('w'),black=points('b');
 const captured={w:[],b:[]};
 if(Array.isArray(moves)){
  for(const move of moves){
   const kind=String(move?.captured||'').toLowerCase();
   if(VALUES[kind]&&['w','b'].includes(move.color))captured[move.color].push(kind);
  }
  for(const color of ['w','b'])captured[color].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
 }else for(const color of ['w','b']){
  const victim=color==='w'?'b':'w';
  for(const kind of ORDER){
   // A lone FEN cannot distinguish promoted pawns from captures. Prefer
   // the actual move history when one is available.
   const missing=Math.max(0,START[kind]-on[victim][kind]);
   for(let i=0;i<missing;i++)captured[color].push(kind);
  }
 }
 return {on,white,black,lead:white-black,captured};
}
function ensure(board){
 let info=instances.get(board);
 if(info&&info.container===board.parentElement&&info.top.isConnected&&info.bottom.isConnected)return info;
 const container=board.parentElement;
 if(!container)return null;
 if(getComputedStyle(container).position==='static')container.style.position='relative';
 const top=document.createElement('div'),bottom=document.createElement('div');
 top.className='elo-material-strip elo-material-top';
 bottom.className='elo-material-strip elo-material-bottom';
 top.setAttribute('aria-label','Black pieces and captured material');
 bottom.setAttribute('aria-label','White pieces and captured material');
 container.append(top,bottom);
 info={container,top,bottom,fen:null,flipped:null};
 const layout=()=>{
  if(!top.isConnected)return;
  const parent=container.getBoundingClientRect(),rect=board.getBoundingClientRect();
  const left=rect.left-parent.left+container.scrollLeft;
  for(const strip of [top,bottom]){
   strip.style.left=left+'px';strip.style.width=rect.width+'px';
  }
  top.style.top=(rect.top-parent.top+container.scrollTop-28)+'px';
  bottom.style.top=(rect.bottom-parent.top+container.scrollTop+4)+'px';
 };
 info.layout=layout;
 instances.set(board,info);
 if(typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(layout);
  observer.observe(board);
 }
 layout();
 return info;
}
function draw(strip,color,data){
 const own=color==='w'?'White':'Black',total=color==='w'?data.white:data.black;
 const lead=color==='w'?data.lead:-data.lead;
 const pieces=data.captured[color];
 strip.replaceChildren();
 const name=document.createElement('strong');name.textContent=own;name.className='elo-material-name';
 strip.append(name);
 const captures=document.createElement('span');captures.className='elo-material-captures';
 for(const kind of pieces){
  const img=document.createElement('img');
  // Display the opponent pieces this side has captured, Chess.com style.
  img.src='/vendor/pieces/cburnett/'+(color==='w'?'b':'w')+kind.toUpperCase()+'.svg';
  img.alt=names[kind];img.width=19;img.height=19;img.draggable=false;
  captures.append(img);
 }
 strip.append(captures);
 if(lead>0){
  const score=document.createElement('strong');score.className='elo-material-lead';
  score.textContent='+'+lead;strip.append(score);
 }
 const remaining=document.createElement('span');remaining.className='elo-material-remaining';
 remaining.textContent=total+' pts on board';
 strip.append(remaining);
 strip.setAttribute('aria-label',own+': '+total+' material points on board'+
  (pieces.length?', captured '+pieces.map(k=>names[k]).join(', '):'')+
  (lead>0?', ahead by '+lead:''));
}
export function updateMaterial(board,fen,{flipped=false,moves=null}={}){
 if(!board)return;
 const info=ensure(board);
 if(!info)return;
 if(info.fen!==fen||info.flipped!==flipped){
  const data=materialSnapshot(fen,{moves});
  draw(info.top,flipped?'w':'b',data);
  draw(info.bottom,flipped?'b':'w',data);
  info.fen=fen;info.flipped=flipped;
 }
 info.layout();
}
