import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
const $=id=>document.getElementById(id),board=$('board'),glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let game=new Chess(),history=[game.fen()],cursor=0,mode='pgn',selected=null,arrowFrom=null,arrows=[];
let engine=null,engineReady=false,engineTimer=null,engineFen='',drag=null,rightStart=null;
let engineFallback=false,engineWorkerUrl=null;
let multiPV=3,engineLines=new Map(),bestEngineMove=null,analysisEpoch=0,unlimitedDepth=false;
let sanMoves=[],reviewResults=[],reviewBusy=false;const boardCells=new Map();
const engineInfo=$('engine-info'),engineSwitch=$('engine');
const ENGINE_JS='/vendor/stockfish/stockfish-19-lite-single.js';
const CDN_BASE='https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/';
const evalWrap=document.createElement('div');
evalWrap.className='board-eval-wrap';
evalWrap.setAttribute('role','meter');
evalWrap.setAttribute('aria-label','Stockfish position evaluation');
evalWrap.setAttribute('aria-valuemin','-10');
evalWrap.setAttribute('aria-valuemax','10');
const evalTrack=document.createElement('div');evalTrack.className='board-eval-track';
const evalWhite=document.createElement('div');evalWhite.className='board-eval-white';
const evalText=document.createElement('span');evalText.className='board-eval-text';evalText.textContent='0.00';
evalTrack.append(evalWhite,evalText);evalWrap.append(evalTrack);
const boardLayout=document.createElement('div');boardLayout.className='board-with-eval';
board.parentNode.insertBefore(boardLayout,board);
boardLayout.append(evalWrap,board);
const boardTop=document.createElement('div');boardTop.className='board-top-switch';boardLayout.insertAdjacentElement('beforebegin',boardTop);
const sidePanel=document.createElement('aside');sidePanel.id='review-side-stats';sidePanel.className='review-side-stats';sidePanel.innerHTML='<h3>GAME REVIEW</h3>';boardTop.insertAdjacentElement('beforebegin',sidePanel);const engineToggle=engineSwitch.closest('label');if(engineToggle)boardTop.append(engineToggle);
function updateEvalBar(){
 const item=engineLines.get(1);
 if(!engineSwitch.checked||!engineReady||!item){
  evalWrap.classList.add('eval-inactive');evalWhite.style.height='50%';evalText.textContent='—';
  evalWrap.setAttribute('aria-valuenow','0');evalWrap.setAttribute('aria-valuetext','Analysis disabled or calculating');return;
 }
 evalWrap.classList.remove('eval-inactive');
 const sign=engineFen.split(' ')[1]==='b'?-1:1;
 const cp=item.type==='mate'?(Number(item.value)>0?10000:-10000)*sign:Number(item.value)*sign;
 const pawns=cp/100;
 const whitePercent=Math.max(3,Math.min(97,50+50*(2/Math.PI)*Math.atan(pawns/2.2)));
 evalWhite.style.height=whitePercent+'%';
 const label=item.type==='mate'?'M'+(Number(item.value)*sign):((pawns>=0?'+':'')+pawns.toFixed(2));
 evalText.textContent=label;
 evalWrap.setAttribute('aria-valuenow',String(Math.max(-10,Math.min(10,pawns))));
 evalWrap.setAttribute('aria-valuetext','White evaluation '+label);
}
const enginePanel=document.createElement('div');
enginePanel.className='engine-lines-panel';
enginePanel.setAttribute('aria-live','polite');
engineInfo.insertAdjacentElement('afterend',enginePanel);
const engineSettings=document.createElement('label');
engineSettings.className='engine-lines-settings';
engineSettings.textContent='Best moves to show: ';
const countSelect=document.createElement('select');
countSelect.setAttribute('aria-label','Number of best moves');
for(const n of [3,4,5]){const option=document.createElement('option');option.value=String(n);option.textContent=String(n);countSelect.append(option)}
countSelect.value='3';engineSettings.append(countSelect);
engineInfo.insertAdjacentElement('beforebegin',engineSettings);
const depthControl=document.createElement('div');
depthControl.className='engine-depth-control';
const depthLabel=document.createElement('span');
depthLabel.textContent='Stockfish 19 Lite · Depth 14–18';
const depthPlus=document.createElement('button');
depthPlus.type='button';depthPlus.className='engine-depth-plus';
depthPlus.textContent='+';depthPlus.title='Continue analysing without a depth limit';
depthPlus.setAttribute('aria-label','Enable unlimited depth');
depthControl.append(depthLabel,depthPlus);
engineSettings.insertAdjacentElement('afterend',depthControl);
const analysisControls=document.createElement('div');
analysisControls.className='analysis-compact-controls';
analysisControls.append(engineSettings,depthControl);
boardLayout.insertAdjacentElement('beforebegin',analysisControls);
boardLayout.insertAdjacentElement('beforebegin',engineInfo);
boardLayout.insertAdjacentElement('beforebegin',enginePanel);
depthPlus.addEventListener('click',()=>{
 unlimitedDepth=!unlimitedDepth;
 depthLabel.textContent=unlimitedDepth?'Stockfish 19 Lite · Depth unlimited':'Stockfish 19 Lite · Depth 14–18';
 depthPlus.textContent=unlimitedDepth?'−':'+';
 depthPlus.title=unlimitedDepth?'Return to depth 18 limit':'Continue analysing without a depth limit';
 depthPlus.setAttribute('aria-label',unlimitedDepth?'Disable unlimited depth':'Enable unlimited depth');
 if(engineReady&&engineSwitch.checked)requestAnalysis();
});
function sanMove(uci){
 try{const test=new Chess(engineFen);const move=test.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});return move?.san||uci}catch{return uci}
}
function scoreLabel(type,value){
 if(type==='mate')return 'Mate '+value;
 const cp=Number(value)*(engineFen.split(' ')[1]==='b'?-1:1);
 return (cp>=0?'+':'')+(cp/100).toFixed(2);
}
function variationText(pv){
 const gameLine=new Chess(engineFen),moves=[];
 for(const [j,uci] of pv.slice(0,10).entries()){
  try{
   const move=gameLine.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
   if(!move)break;
   const number=Number(engineFen.split(' ')[5]||1)+Math.floor((j+(engineFen.split(' ')[1]==='b'?1:0))/2);
   const prefix=gameLine.turn()==='b'?number+'.':number+'...';
   moves.push({prefix,san:move.san});
  }catch{break}
 }
 return moves;
}
function renderEngineLines(){
 enginePanel.replaceChildren();
 if(!engineSwitch.checked||!engineReady){enginePanel.style.visibility='hidden';return;}
 enginePanel.style.visibility='visible';
 for(let i=1;i<=multiPV;i++){
  const item=engineLines.get(i);
  const row=document.createElement('div');row.className='engine-line';
  if(!item){row.classList.add('engine-line-pending');row.textContent=i+'.  Calculating…';enginePanel.append(row);continue;}
  const rank=document.createElement('span');rank.className='engine-line-rank';rank.textContent=i+'.';
  const moves=document.createElement('span');moves.className='engine-line-moves';
  const variation=variationText(item.pv||[item.uci]);
  variation.forEach((move,j)=>{
   const span=document.createElement('span');
   span.className='engine-variation-move'+(j===0?' engine-variation-first':'');
   span.textContent=move.prefix+' '+move.san;
   moves.append(span);
  });
  const score=document.createElement('span');score.className='engine-line-score';score.textContent=scoreLabel(item.type,item.value);
  row.append(rank,moves,score);
  row.classList.add('engine-line-clickable');row.setAttribute('role','button');row.tabIndex=0;row.title='Play '+(variation[0]?.san||item.uci);
  const playSuggestion=()=>{try{const next=new Chess(history[cursor]);const u=item.uci;const played=next.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});if(!played)return;history=history.slice(0,cursor+1);history.push(next.fen());sanMoves=sanMoves.slice(0,cursor);sanMoves.push(played.san);cursor++;selected=null;arrows=[];reviewResults=[];render();requestAnalysis()}catch{}};
  row.addEventListener('click',playSuggestion);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();playSuggestion()}});
  enginePanel.append(row);
 }
}
countSelect.addEventListener('change',()=>{
 multiPV=Number(countSelect.value);
 if(engineReady&&engineSwitch.checked)requestAnalysis();
});

function requestAnalysis(){
 if(!engine||!engineReady||!engineSwitch.checked)return;
 engineFen=history[cursor];
 analysisEpoch++;
 engineLines.clear();bestEngineMove=null;
 renderEngineLines();drawArrows();
 engine.postMessage('stop');
 engine.postMessage('setoption name MultiPV value '+multiPV);
 engine.postMessage('position fen '+engineFen);
 engine.postMessage(unlimitedDepth?'go infinite':'go depth 18');
 engineInfo.textContent=(engineFallback?'Stockfish 19 Lite (CDN)':'Stockfish 19 Lite')+' · calculating…';
}
function cleanupEngine(){
 clearTimeout(engineTimer);engineTimer=null;
 if(engine){try{engine.postMessage('quit')}catch{}engine.terminate()}
 engine=null;engineReady=false;engineLines.clear();bestEngineMove=null;renderEngineLines();updateEvalBar();drawArrows();
 if(engineWorkerUrl){URL.revokeObjectURL(engineWorkerUrl);engineWorkerUrl=null}
}
function engineFailed(message){
 cleanupEngine();
 if(!engineFallback){
  engineFallback=true;
  engineInfo.textContent='Local engine unavailable; trying Stockfish CDN…';
  launchEngine(true);
 }else{
  engineSwitch.checked=false;
  engineInfo.textContent='Stockfish could not start: '+message;
 }
}
function launchEngine(useCdn){
 try{
  cleanupEngine();
  if(useCdn){
   // Blob URL creates a same-origin Worker that can load the official CDN engine.
   const source="self.Module={locateFile:function(path){return '"+CDN_BASE+"'+path;}};importScripts('"+CDN_BASE+"stockfish-19-lite-single.js');";
   engineWorkerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
   engine=new Worker(engineWorkerUrl);
  }else{
   // The engine JS and WASM live side-by-side at /engine/, as required by Stockfish.js.
   engine=new Worker(ENGINE_JS);
  }
  engine.onmessage=e=>{
   for(const line of String(e.data).split('\n')){
    if(line.includes('uciok'))engine.postMessage('isready');
    if(line.includes('readyok')){
     engineReady=true;
     clearTimeout(engineTimer);engineTimer=null;
     requestAnalysis();
    }
    if(engineSwitch.checked&&engineReady&&line.startsWith('info ')&&line.includes(' score ')&&line.includes(' pv ')){
     const depth=line.match(/\bdepth (\d+)/),score=line.match(/\bscore (cp|mate) (-?\d+)/);
     const pv=line.match(/\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?(?:\s+|$))+)/),rank=line.match(/\bmultipv (\d+)/);
     const n=rank?Number(rank[1]):1;
     if(score&&pv&&n>=1&&n<=multiPV&&Number(depth?.[1]||0)>=14){
      const d=Number(depth?.[1]||0),previous=engineLines.get(n);
      if(!previous||d>=previous.depth){
       const pvMoves=pv[1].trim().split(/\s+/);engineLines.set(n,{uci:pvMoves[0],pv:pvMoves,type:score[1],value:score[2],depth:d});
       if(n===1){
        bestEngineMove=pvMoves[0];
        engineInfo.textContent=(engineFallback?'Stockfish 19 Lite (CDN)':'Stockfish 19 Lite')+' · depth '+d;
        updateEvalBar();drawArrows();
       }
       renderEngineLines();
      }
     }
    }
   }
  };
  engine.onerror=e=>{e.preventDefault?.();engineFailed(e.message||'worker script failed')};
  engine.postMessage('uci');
  engineTimer=setTimeout(()=>{if(!engineReady&&engineSwitch.checked)engineFailed('engine did not respond in time')},20000);
 }catch(e){engineFailed(e.message||'Worker unavailable')}
}
function startEngine(){
 engineFallback=false;
 engineInfo.textContent='Loading Stockfish 19 Lite…';
 launchEngine(false);
}
function stopEngine(){cleanupEngine();enginePanel.replaceChildren()}
engineSwitch.addEventListener('change',()=>{
 if(engineSwitch.checked)startEngine();
 else{stopEngine();engineInfo.textContent='Engine disabled.'}
});
let lastPointerAction=0;
function squareAt(x,y){
 const rect=board.getBoundingClientRect();
 if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return null;
 const file=Math.floor((x-rect.left)/rect.width*8),rank=Math.floor((y-rect.top)/rect.height*8);
 return String.fromCharCode(97+file)+(8-rank);
}
function playBoardMove(from,to){
 try{
  const position=new Chess(history[cursor]);
  const legal=position.moves({square:from,verbose:true}).some(m=>m.to===to);
  if(!legal)return false;
  const moved=position.move({from,to,promotion:'q'});
  if(!moved)return false;
  history=history.slice(0,cursor+1);history.push(position.fen());sanMoves=sanMoves.slice(0,cursor);sanMoves.push(moved.san);cursor++;
  selected=null;arrows=[];reviewResults=[];render();requestAnalysis();
  return true;
 }catch{return false}
}
function selectBoardSquare(sq){
 const position=new Chess(history[cursor]),piece=position.get(sq);
 if(selected===sq){selected=null;render();return}
 if(selected&&playBoardMove(selected,sq))return;
 selected=piece&&piece.color===position.turn()?sq:null;
 render();
}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('pointerdown',e=>{
 const sq=squareAt(e.clientX,e.clientY);
 if(!sq)return;
 if(e.button===2){rightStart=sq;e.preventDefault();return}
 if(e.button!==0)return;
 if(arrows.length){arrows=[];drawArrows()}
 const pos=new Chess(history[cursor]),piece=pos.get(sq);
 if(!piece||piece.color!==pos.turn())return;
 const source=e.target.closest('button');
 if(!source)return;
 drag={from:sq,startX:e.clientX,startY:e.clientY,active:false,source,ghost:null,pointerId:e.pointerId};selected=sq;render();drag.source=board.querySelector('[data-square="'+sq+'"]')||source;
 e.preventDefault();
 try{board.setPointerCapture(e.pointerId)}catch{}
});
board.addEventListener('pointermove',e=>{
 if(!drag||drag.pointerId!==e.pointerId)return;
 if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8){
  drag.active=true;
  const img=drag.source.querySelector('img');
  drag.ghost=img?img.cloneNode(true):document.createElement('span');
  if(!img)drag.ghost.textContent=drag.source.textContent;
  drag.ghost.className='dragging-chess-piece';
  drag.source.classList.add('drag-source');
  document.body.append(drag.ghost);
 }
 if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}
});
board.addEventListener('pointerup',e=>{
 if(e.button===2&&rightStart){
  const to=squareAt(e.clientX,e.clientY);
  if(to&&to!==rightStart){const key=rightStart+to,idx=arrows.findIndex(a=>a.join('')===key);if(idx>=0)arrows.splice(idx,1);else arrows.push([rightStart,to]);drawArrows()}
  rightStart=null;return;
 }
 if(!drag||drag.pointerId!==e.pointerId)return;
 lastPointerAction=Date.now();
 const d=drag;drag=null;d.ghost?.remove();d.source.classList.remove('drag-source');
 const to=squareAt(e.clientX,e.clientY);
 if(d.active){
  if(to&&!playBoardMove(d.from,to)){selected=d.from;render()}
  else if(!to){selected=d.from;render()}
 }else{
  if(selected&&selected!==d.from&&playBoardMove(selected,d.from))return;
  selectBoardSquare(d.from);
 }
});
board.addEventListener('pointercancel',()=>{if(!drag)return;drag.ghost?.remove();drag.source.classList.remove('drag-source');drag=null;render()});

function drawArrows(){
 const old=board.querySelector('svg.arrows');if(old)old.remove();
 const ns='http://www.w3.org/2000/svg';
 const make=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el};
 const svg=make('svg',{viewBox:'0 0 800 800',class:'arrows','aria-hidden':'true'});
 svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
 const point=s=>[(s.charCodeAt(0)-97)*100+50,(8-Number(s[1]))*100+50];
 function arrow(a,b,color,opacity){
  const [x1,y1]=point(a),[x2,y2]=point(b),dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);
  if(d<1)return;
  const fileDistance=Math.abs(a.charCodeAt(0)-b.charCodeAt(0)),rankDistance=Math.abs(Number(a[1])-Number(b[1]));
  if((fileDistance===1&&rankDistance===2)||(fileDistance===2&&rankDistance===1)){
   const bend=fileDistance===2?[x2,y1]:[x1,y2];
   const shaftEnd=[x2-(x2-bend[0])*.32,y2-(y2-bend[1])*.32];
   const line=make('polyline',{points:[[x1,y1],bend,shaftEnd].map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-opacity':opacity,'stroke-width':13,'stroke-linejoin':'round','stroke-linecap':'round'});
   svg.append(line);
   const vx=x2-bend[0],vy=y2-bend[1],vd=Math.hypot(vx,vy),ux2=vx/vd,uy2=vy/vd;
   svg.append(make('polygon',{points:[[x2-ux2*10,y2-uy2*10],[x2-ux2*42-uy2*20,y2-uy2*42+ux2*20],[x2-ux2*42+uy2*20,y2-uy2*42-ux2*20]].map(p=>p.join(',')).join(' '),fill:color,'fill-opacity':opacity}));return;
  }
  const ux=dx/d,uy=dy/d,px=-uy,py=ux;
  const tip=[x2-ux*15,y2-uy*15],base=[x2-ux*54,y2-uy*54],tail=[x1+ux*15,y1+uy*15];
  const coords=[[tail[0]+px*6,tail[1]+py*6],[base[0]+px*6,base[1]+py*6],[base[0]+px*18,base[1]+py*18],tip,[base[0]-px*18,base[1]-py*18],[base[0]-px*6,base[1]-py*6],[tail[0]-px*6,tail[1]-py*6]];
  const points=coords.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
  const glow=make('polygon',{points,fill:color,'fill-opacity':opacity*.16,stroke:color,'stroke-opacity':opacity*.13,'stroke-width':7,'stroke-linejoin':'round'});
  svg.append(glow);
  svg.append(make('polygon',{points,fill:color,'fill-opacity':opacity,stroke:color,'stroke-opacity':opacity*.8,'stroke-width':1,'stroke-linejoin':'round'}));
 }
 for(const [a,b] of arrows)arrow(a,b,'#0a9cff',.78);
 if(bestEngineMove&&engineSwitch.checked&&engineReady)arrow(bestEngineMove.slice(0,2),bestEngineMove.slice(2,4),'#23e65d',.7);
 board.append(svg);
}
function ensureBoardCells(){
 if(boardCells.size)return;
 board.replaceChildren();board.style.position='relative';
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const sq=String.fromCharCode(97+f)+(8-r),b=document.createElement('button');
  b.type='button';b.className=(r+f)%2?'dark':'light';b.draggable=false;
  b.dataset.square=sq;b.onclick=()=>{if(Date.now()-lastPointerAction<450)return;selectBoardSquare(sq)};
  boardCells.set(sq,b);board.append(b);
 }
}
function render(){
 ensureBoardCells();
 const pos=new Chess(history[cursor]),possible=selected?pos.moves({square:selected,verbose:true}):[];
 for(const [sq,b] of boardCells){
  const p=pos.get(sq),key=p?p.color+p.type:'';
  if(b.dataset.piece!==key){
   b.dataset.piece=key;b.replaceChildren();
   if(p){const img=document.createElement('img');img.className='chess-piece';img.src='https://lichess1.org/assets/piece/cburnett/'+p.color+p.type.toUpperCase()+'.svg';img.alt=p.color+' '+p.type;img.draggable=false;img.onerror=()=>{img.remove();b.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};b.append(img)}
  }else b.querySelectorAll('.legal-move-dot,.legal-capture-ring').forEach(x=>x.remove());
  b.setAttribute('aria-label',sq+(p?' '+p.color+' '+p.type:''));
  b.classList.toggle('selected-square',selected===sq);
  const target=possible.find(m=>m.to===sq);
  if(target){const indicator=document.createElement('span');indicator.className=(p||target.flags.includes('e'))?'legal-capture-ring':'legal-move-dot';indicator.setAttribute('aria-hidden','true');b.append(indicator)}
 }
 drawArrows();$('back').disabled=cursor===0;$('forward').disabled=cursor===history.length-1;
 renderNotation();
}
const OPENINGS=[
 ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6','Sicilian Defense: Najdorf Variation'],
 ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4','Sicilian Defense: Open Variation'],
 ['e4 c5','Sicilian Defense'],['e4 e5 Nf3 Nc6 Bb5','Ruy Lopez'],
 ['e4 e5 Nf3 Nc6 Bc4 Bc5','Italian Game: Giuoco Piano'],
 ['e4 e5 Nf3 Nc6 Bc4 Nf6','Italian Game: Two Knights Defense'],
 ['e4 e5 Nf3 Nc6 Bc4','Italian Game'],
 ['e4 e5 Nf3 Nc6','King’s Pawn Game: Three Knights Setup'],
 ['e4 e5 Nf3 Nf6','Petrov Defense'],['e4 e5 Nf3','King’s Knight Opening'],
 ['e4 e5','King’s Pawn Game'],['e4 e6 d4 d5','French Defense'],['e4 e6','French Defense'],
 ['e4 c6 d4 d5','Caro-Kann Defense'],['e4 c6','Caro-Kann Defense'],
 ['e4 d5','Scandinavian Defense'],['e4 Nf6','Alekhine Defense'],
 ['e4 d6 d4 Nf6 Nc3 g6','Pirc Defense'],['e4 d6','Pirc Defense'],
 ['d4 d5 c4 e6','Queen’s Gambit Declined'],['d4 d5 c4 c6','Slav Defense'],
 ['d4 d5 c4 dxc4','Queen’s Gambit Accepted'],['d4 d5 c4','Queen’s Gambit'],
 ['d4 Nf6 c4 g6 Nc3 Bg7','King’s Indian Defense'],['d4 Nf6 c4 g6','King’s Indian Defense'],
 ['d4 Nf6 c4 e6 Nc3 Bb4','Nimzo-Indian Defense'],['d4 Nf6 c4 e6 Nf3 b6','Queen’s Indian Defense'],
 ['d4 Nf6 c4 e6','Indian Defense'],['d4 Nf6','Indian Defense'],
 ['d4 d5','Queen’s Pawn Game'],['c4 e5','English Opening: Reversed Sicilian'],
 ['c4','English Opening'],['Nf3','Réti Opening'],['b3','Nimzowitsch-Larsen Attack'],
 ['b4','Sokolsky Opening'],['f4','Bird Opening'],['g3','Hungarian Opening'],
 ['e3','Van’t Kruijs Opening'],['d4','Queen’s Pawn Opening'],['e4','King’s Pawn Opening']
];
function openingName(){
 const played=sanMoves.slice(0,cursor).join(' ');
 for(const [line,name] of OPENINGS)if(played===line||played.startsWith(line+' '))return name;
 return cursor?'Unclassified opening':'Starting position';
}
function renderNotation(){
 let panel=$('live-notation');
 if(!panel){
  panel=document.createElement('section');panel.id='live-notation';panel.className='live-notation';
  panel.innerHTML='<div id="opening-name"></div><div id="notation-moves"></div>';
  boardLayout.insertAdjacentElement('afterend',panel);
  panel.insertBefore(enginePanel,panel.firstChild);
  panel.insertBefore(engineSettings,enginePanel);
  panel.insertBefore(depthControl,enginePanel);
 }
 $('opening-name').textContent=openingName();
 const list=$('notation-moves');list.replaceChildren();
 for(let i=0;i<sanMoves.length;i++){
  if(i%2===0){const number=document.createElement('span');number.textContent=Math.floor(i/2)+1+'.';number.className='notation-number';list.append(number)}
  const button=document.createElement('button');button.type='button';
  button.textContent=sanMoves[i]+(reviewResults[i]?' '+reviewResults[i].symbol:'');
  button.title=reviewResults[i]?.label||'Go to move';
  button.className='notation-move'+(cursor===i+1?' active':'');
  button.onclick=()=>{cursor=i+1;selected=null;render();requestAnalysis()};list.append(button);
  if(i===sanMoves.length-1&&i%2===0)list.append(document.createElement('span'));
 }
}
document.addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight'].includes(e.key)||e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 e.preventDefault();const btn=e.key==='ArrowLeft'?$('back'):$('forward');if(!btn.disabled)btn.click();
});
$('back').onclick=()=>{if(cursor){cursor--;selected=null;render();requestAnalysis()}};$('forward').onclick=()=>{if(cursor<history.length-1){cursor++;selected=null;render();requestAnalysis()}};$('reset').onclick=()=>{history=[new Chess().fen()];sanMoves=[];reviewResults=[];cursor=0;selected=null;arrows=[];render();requestAnalysis()};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('import-value').placeholder=mode==='pgn'?'Paste PGN here':mode==='fen'?'Paste FEN here':'Paste Chess.com game URL'});
$('load').onclick=async()=>{const value=$('import-value').value.trim();const status=$('import-status');try{let text=value;if(mode==='url'){const url=new URL(value);if(url.hostname!=='www.chess.com'&&url.hostname!=='chess.com')throw Error('Only Chess.com game URLs are supported.');throw Error('Direct game-link import is not supported yet. Paste PGN instead.')}const next=new Chess();if(mode==='fen')next.load(text);else next.loadPgn(text);const replay=new Chess(mode==='fen'?next.fen():undefined);const states=[replay.fen()];if(mode==='pgn')for(const m of next.history()){replay.move(m);states.push(replay.fen())}history=states;sanMoves=mode==='pgn'?next.history():[];reviewResults=[];cursor=0;selected=null;arrows=[];status.textContent='Loaded '+(states.length-1)+' moves.';render();requestAnalysis()}catch(e){status.textContent='Could not load: '+e.message}};

const reviewPanel=document.createElement('section');reviewPanel.id='game-review';reviewPanel.className='game-review';
reviewPanel.innerHTML='<h2>GAME REVIEW</h2><p>Review every move with Stockfish on your device. Categories are approximate engine-based assessments, not Chess.com proprietary ratings.</p><button id="review-start" type="button">Review Game</button><button id="review-cancel" type="button" disabled>Cancel</button><div id="review-status" role="status">Load or play a game to begin.</div><div id="review-summary"></div>';
boardLayout.closest('.tool-card').insertAdjacentElement('afterend',reviewPanel);
const reviewSpeed=document.createElement('label');reviewSpeed.textContent='Review speed: ';const reviewSpeedSelect=document.createElement('select');reviewSpeedSelect.setAttribute('aria-label','Game Review analysis speed');for(const [value,label] of [['fast','Fast (0.12 second per position)'],['depth','Standard (depth 12)']]){const option=document.createElement('option');option.value=value;option.textContent=label;reviewSpeedSelect.append(option)}reviewSpeed.append(reviewSpeedSelect);$('review-start').before(reviewSpeed);let reviewWorker=null,reviewCancelled=false;
function reviewWin(cp){return 100/(1+Math.exp(-0.00368208*Math.max(-1000,Math.min(1000,cp))))}
function reviewMoveAccuracy(loss){return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*loss)-3.1669))}
function reviewAccuracy(rows,positions,side){
 const selected=rows.map((r,i)=>({r,i})).filter(x=>x.i%2===side&&x.r.label!=='Book');
 if(!selected.length)return rows.some((_,i)=>i%2===side)?100:null;
 const mean=selected.reduce((v,x)=>v+x.r.accuracy,0)/selected.length;
 const n=Math.min(8,Math.max(2,Math.floor(rows.length/10)));
 if(positions.length<rows.length+1)return mean;
 const deviations=positions.map((_,i)=>{const start=Math.min(i,Math.max(0,positions.length-n));const window=positions.slice(start,start+n);const avg=window.reduce((a,b)=>a+b,0)/window.length;return Math.max(.5,Math.min(12,Math.sqrt(window.reduce((a,b)=>a+(b-avg)**2,0)/window.length)))});
 const total=selected.reduce((v,x)=>v+deviations[x.i],0);
 return Math.max(0,Math.min(100,(mean+selected.reduce((v,x)=>v+x.r.accuracy*deviations[x.i],0)/total)/2));
}
function reviewOfferedMaterial(board,played,captured){
 const piece=board.get(played.to);if(!piece||played.promotion)return 0;
 const values={p:100,n:320,b:330,r:500,q:900,k:20000};
 const value=values[piece.type];if(value<300)return 0;
 const replies=board.moves({verbose:true});
 const vulnerable=replies.some(m=>m.to===played.to&&m.captured&&(values[board.get(m.from)?.type]||20000)<=value);
 return vulnerable?Math.max(0,value-captured):0;
}
function reviewCategory(loss,book,best,brilliant,great,bestWin,actualWin){
 if(book)return {label:'Book',symbol:'📖'};
 if(brilliant)return {label:'Brilliant',symbol:'💎'};
 if(great)return {label:'Great',symbol:'❗'};
 if(best)return {label:'Best',symbol:'⭐'};
 if(bestWin>=70&&actualWin>=35&&actualWin<62&&loss>=12&&loss<30)return {label:'Miss',symbol:'🎯'};
 if(loss<=2)return {label:'Excellent',symbol:'✨'};
 if(loss<=5)return {label:'Good',symbol:'✔️'};
 if(loss<=10)return {label:'Inaccuracy',symbol:'⚠️'};
 if(loss<=20)return {label:'Mistake',symbol:'❓'};
 return {label:'Blunder',symbol:'‼️'};
}
function stopReview(){
 reviewCancelled=true;
 if(reviewWorker){reviewWorker.terminate();reviewWorker=null}
 reviewBusy=false;$('review-start').disabled=false;$('review-cancel').disabled=true;
}
$('review-cancel').onclick=()=>{stopReview();$('review-status').textContent='Review cancelled.'};
$('review-start').onclick=async()=>{
 if(reviewBusy||history.length<2){$('review-status').textContent='Play or import a game first.';return}
 reviewBusy=true;reviewCancelled=false;$('review-start').disabled=true;$('review-cancel').disabled=false;
 const snapshot=history.slice(),moves=sanMoves.slice();
 const status=$('review-status'),summary=$('review-summary');summary.replaceChildren();
 const worker=new Worker(ENGINE_JS);reviewWorker=worker;
 const waitFor=(predicate,timeout=45000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.removeEventListener('message',listener);reject(Error('Engine timed out'))},timeout);
  function listener(e){const lines=String(e.data).split(/\r?\n/);if(lines.some(predicate)){clearTimeout(timer);worker.removeEventListener('message',listener);resolve(lines)}}
  worker.addEventListener('message',listener);
 });
 try{
  const uciReady=waitFor(line=>line.includes('uciok'));worker.postMessage('uci');await uciReady;
  worker.postMessage('setoption name MultiPV value 2');
  const ready=waitFor(line=>line.includes('readyok'));worker.postMessage('isready');await ready;
  const evaluations=[];
  for(let i=0;i<snapshot.length;i++){
   if(reviewCancelled)throw Error('Cancelled');
   status.textContent='Analyzing position '+(i+1)+' of '+snapshot.length+' (local Stockfish, '+(reviewSpeedSelect.value==='fast'?'0.12 second':'depth 12')+')…';
   let lastScore=null,lastPv=null,secondScore=null;
   const result=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.removeEventListener('message',listener);reject(Error('Engine timeout at position '+i))},60000);
    function listener(e){
     for(const line of String(e.data).split(/\r?\n/)){
      if(line.startsWith('info ')&&line.includes(' score ')){
       const score=line.match(/\bscore (cp|mate) (-?\d+)/),pv=line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
       if(score){if(line.includes('multipv 2'))secondScore=Number(score[2]);else{lastScore=score;lastPv=pv?.[1]||lastPv}}
      }
      if(line.startsWith('bestmove ')){clearTimeout(timer);worker.removeEventListener('message',listener);resolve({score:lastScore,pv:lastPv,second:secondScore})}
     }
    }
    worker.addEventListener('message',listener);
   });
   worker.postMessage('position fen '+snapshot[i]);worker.postMessage(reviewSpeedSelect.value==='fast'?'go movetime 120':'go depth 12');
   const info=await result;
   if(!info.score)throw Error('Engine returned no evaluation');
   const side=snapshot[i].split(' ')[1]==='w'?1:-1;
   const value=info.score[1]==='mate'?(Number(info.score[2])>0?1200:-1200):Number(info.score[2]);
   evaluations.push({white:value*side,pv:info.pv,second:info.second===null?null:info.second*side});
  }
  const categories=[],counts={};
  for(let i=0;i<moves.length;i++){
   const mover=i%2===0?1:-1;
   const bestWin=reviewWin(evaluations[i].white*mover),actualWin=reviewWin(evaluations[i+1].white*mover);const loss=Math.max(0,bestWin-actualWin);
   let best=false;
   try{const before=new Chess(snapshot[i]),played=before.move(moves[i]);best=!!played&&evaluations[i].pv===played.from+played.to+(played.promotion||'')}catch{}
   const book=false; // Never invent verified opening-book matches from move number alone.
   const second=evaluations[i].second;const before=new Chess(snapshot[i]);const alternatives=before.moves().length;const played=before.move(moves[i]);const captured=played?.captured?({p:100,n:320,b:330,r:500,q:900}[played.captured]||0):0;const sacrifice=played?reviewOfferedMaterial(before,played,captured):0;const brilliant=best&&!book&&sacrifice>=250&&actualWin>=50&&alternatives>1&&(second===null||reviewWin(second*mover)<90);const great=best&&!book&&!brilliant&&second!==null&&reviewWin(evaluations[i].white*mover)-reviewWin(second*mover)>=8;const category=reviewCategory(loss,book,best,brilliant,great,bestWin,actualWin);
   categories.push({...category,loss:Number(loss.toFixed(2)),accuracy:reviewMoveAccuracy(loss),move:moves[i]});counts[category.label]=(counts[category.label]||0)+1;
  }
  reviewResults=categories;
  status.textContent='';
  const title=document.createElement('h3');title.textContent='Move classifications';summary.append(title);
  for(const name of ['Brilliant','Great','Book','Best','Excellent','Good','Inaccuracy','Mistake','Miss','Blunder']){
   const row=document.createElement('div');row.className='review-stat';row.textContent=({Brilliant:'💎',Great:'❗',Book:'📖',Best:'⭐',Excellent:'✨',Good:'✔️',Inaccuracy:'⚠️',Mistake:'❓',Miss:'🎯',Blunder:'‼️'}[name]||'')+' '+name+': '+(counts[name]||0);summary.append(row);
  }
  const accuracyTitle=document.createElement('h3');accuracyTitle.textContent='EloScanner Accuracy';summary.prepend(accuracyTitle);
  const sideStats=[];
  for(const [side,label] of [[0,'White'],[1,'Black']]){
   const rows=categories.filter((x,i)=>i%2===side&&x.label!=='Book');
   const avg=reviewAccuracy(categories,evaluations.map(x=>reviewWin(x.white)),side);
   const el=document.createElement('div');el.className='review-stat';el.textContent=label+': '+(avg===null?'N/A':avg.toFixed(1)+'%');accuracyTitle.insertAdjacentElement('afterend',el);sideStats.push({label,accuracy:avg});
  }

  const statsPanel=$('review-side-stats');if(statsPanel){statsPanel.replaceChildren();const heading=document.createElement('h3');heading.textContent='Game statistics';statsPanel.append(heading);for(const [side,label] of [[0,'White'],[1,'Black']]){const rows=categories.filter((x,i)=>i%2===side);const score=sideStats.find(x=>x.label===label)?.accuracy;const mean=rows.length?rows.reduce((a,x)=>a+x.loss,0)/rows.length:0;const grade=score===null||score===undefined?'—':score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';for(const [key,value] of [['Accuracy',score==null?'—':score.toFixed(1)+'%'],['Variance',mean.toFixed(1)+' pp'],['Grade',grade]]){const item=document.createElement('div');item.className='review-side-item';item.textContent=label+' '+key+' · '+value;statsPanel.append(item)}}}
  renderNotation();
 }catch(e){if(!reviewCancelled)status.textContent='Review failed: '+e.message}
 finally{if(reviewWorker===worker)stopReview()}
};

render();
