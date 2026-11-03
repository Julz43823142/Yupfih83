import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import {appendChessArrow} from './chess-board-arrows.js';
import {attachChessBoardControls} from './chess-board-controls.js?v=2';
const $=id=>document.getElementById(id),board=$('board'),glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let game=new Chess(),history=[game.fen()],cursor=0,mode='pgn',selected=null,arrowFrom=null,arrows=[],blueSquares=new Set();
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
// The evaluation meter is measured from the actual board, not from the panel.
const syncAnalysisMeter=()=>{
 const rect=board.getBoundingClientRect();
 if(rect.height>0&&evalWrap){
  evalWrap.style.setProperty('--chess-board-height',rect.height+'px');
  const row=evalWrap.parentElement.getBoundingClientRect();
  evalWrap.style.top=(rect.top-row.top)+'px';
 }
};
if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncAnalysisMeter).observe(board);
window.addEventListener('resize',syncAnalysisMeter);
requestAnimationFrame(syncAnalysisMeter);
const boardTop=document.createElement('div');boardTop.className='board-top-switch';boardLayout.insertAdjacentElement('beforebegin',boardTop);
const arrowToggleLabel=document.createElement('label');
arrowToggleLabel.className='analysis-arrow-toggle';
const arrowToggle=document.createElement('input');
arrowToggle.type='checkbox';arrowToggle.checked=true;arrowToggle.setAttribute('aria-label','Show Arrow');
const arrowToggleText=document.createElement('span');arrowToggleText.textContent='Show Arrow';
arrowToggleLabel.append(arrowToggle,arrowToggleText);
boardTop.prepend(arrowToggleLabel);
let previewEngineMove=null;
arrowToggle.addEventListener('change',()=>drawArrows());
const sidePanel=document.createElement('aside');sidePanel.id='review-side-stats';sidePanel.className='review-side-stats';sidePanel.innerHTML='<h3>GAME REVIEW</h3>';boardTop.insertAdjacentElement('beforebegin',sidePanel);const engineToggle=engineSwitch.closest('label');if(engineToggle)boardTop.append(engineToggle);
function updateEvalBar(){
 const item=engineLines.get(1);
 if(!engineSwitch.checked||!engineReady||!item){
  evalWrap.classList.add('eval-inactive');evalWhite.style.height='50%';evalText.textContent='0.00';
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
  if(!item){row.classList.add('engine-line-pending','prep-engine-line');row.textContent='Analyzing…';enginePanel.append(row);continue;}
  const moves=document.createElement('span');moves.className='engine-line-moves prep-engine-variation';
  const variation=variationText(item.pv||[item.uci]);
  variation.forEach((move,j)=>{
   const span=document.createElement(j===0?'strong':'span');
   span.className='engine-variation-move'+(j===0?' engine-variation-first':'');
   span.textContent=move.prefix+move.san;
   moves.append(span);
   if(j<variation.length-1)moves.append(document.createTextNode('  '));
  });
  const score=document.createElement('strong');score.className='engine-line-score prep-engine-score';score.textContent=scoreLabel(item.type,item.value);
  row.classList.add('prep-engine-line');
  row.append(moves,score);
  row.dataset.engineUci=item.uci;
  row.classList.add('engine-line-clickable');row.setAttribute('role','button');row.tabIndex=0;row.title='Play '+(variation[0]?.san||item.uci);
  const playSuggestion=()=>{try{const next=new Chess(history[cursor]);const u=item.uci;const played=next.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});if(!played)return;history=history.slice(0,cursor+1);history.push(next.fen());sanMoves=sanMoves.slice(0,cursor);sanMoves.push(played.san);cursor++;selected=null;arrows=[];blueSquares.clear();reviewResults=[];render();requestAnalysis()}catch{}};
  row.addEventListener('click',playSuggestion);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();playSuggestion()}});
  enginePanel.append(row);
 }
}
// Hovering a variant previews that variant's move instead of the default best move.
enginePanel.addEventListener('pointerover',e=>{
 const row=e.target.closest('.engine-line-clickable');
 if(!row||!enginePanel.contains(row)||!engineSwitch.checked)return;
 const move=row.dataset.engineUci;
 if(move&&move!==previewEngineMove){previewEngineMove=move;drawArrows()}
});
enginePanel.addEventListener('pointerout',e=>{
 const oldRow=e.target.closest('.engine-line-clickable');
 if(!oldRow)return;
 const next=e.relatedTarget;
 if(next&&oldRow.contains(next))return;
 const nextRow=next&&enginePanel.contains(next)?next.closest('.engine-line-clickable'):null;
 if(!nextRow&&previewEngineMove){previewEngineMove=null;drawArrows()}
});
enginePanel.addEventListener('pointerleave',()=>{
 if(previewEngineMove){previewEngineMove=null;drawArrows()}
});
countSelect.addEventListener('change',()=>{
 multiPV=Number(countSelect.value);
 if(engineReady&&engineSwitch.checked)requestAnalysis();
});

function requestAnalysis(){
 if(!engine||!engineReady||!engineSwitch.checked)return;
 engineFen=history[cursor];
 analysisEpoch++;
 engineLines.clear();bestEngineMove=null;previewEngineMove=null;
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
 engine=null;engineReady=false;engineLines.clear();bestEngineMove=null;previewEngineMove=null;renderEngineLines();updateEvalBar();drawArrows();
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
function playBoardMove(from,to){
 try{
  const position=new Chess(history[cursor]);
  const legal=position.moves({square:from,verbose:true}).some(m=>m.to===to);
  if(!legal)return false;
  const moved=position.move({from,to,promotion:'q'});
  if(!moved)return false;
  history=history.slice(0,cursor+1);history.push(position.fen());sanMoves=sanMoves.slice(0,cursor);sanMoves.push(moved.san);cursor++;
  selected=null;arrows=[];blueSquares.clear();reviewResults=[];render();requestAnalysis();
  return true;
 }catch{return false}
}
const boardControls=attachChessBoardControls({
 board,
 getPosition:()=>new Chess(history[cursor]),
 getSelected:()=>selected,
 setSelected:value=>{selected=value},
 playMove:playBoardMove,
 repaint:()=>render(),
 getArrows:()=>arrows,
 getHighlights:()=>blueSquares
});

function drawArrows(){
 const old=board.querySelector('svg.arrows');if(old)old.remove();
 const ns='http://www.w3.org/2000/svg';
 const make=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el};
 const svg=make('svg',{viewBox:'0 0 800 800',class:'arrows','aria-hidden':'true'});
 svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
 const point=s=>[(s.charCodeAt(0)-97)*100+50,(8-Number(s[1]))*100+50];
 const arrow=(a,b,color,opacity)=>appendChessArrow(svg,a,b,color,opacity);
 for(const sq of blueSquares){const [x,y]=point(sq);svg.append(make('rect',{x:x-50,y:y-50,width:100,height:100,fill:'#328aff','fill-opacity':.32}))}
 for(const [a,b] of arrows)arrow(a,b,'#0a9cff',.78);
 const shownEngineMove=engineSwitch.checked&&engineReady?(previewEngineMove||(arrowToggle.checked?bestEngineMove:null)):null;
 if(shownEngineMove)arrow(shownEngineMove.slice(0,2),shownEngineMove.slice(2,4),'#23e65d',.7);
 board.append(svg);
}
function ensureBoardCells(){
 if(boardCells.size)return;
 board.replaceChildren();board.style.position='relative';
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const sq=String.fromCharCode(97+f)+(8-r),b=document.createElement('button');
  b.type='button';b.className=(r+f)%2?'dark':'light';b.draggable=false;
  b.dataset.square=sq;
  boardCells.set(sq,b);board.append(b);
 }
}
// Emphasize only noteworthy moves, not every 'Good' or 'Excellent' move.
const reviewMoveDecorations={
 Brilliant:{glyph:'!!',color:'#22c6b6'},Great:{glyph:'!',color:'#70a9d4'},
 Book:{glyph:'▣',color:'#c49a77'},Best:{glyph:'★',color:'#7ab95b'},
 Inaccuracy:{glyph:'?!',color:'#e3bd32'},Mistake:{glyph:'?',color:'#f39b58'},
 Miss:{glyph:'×',color:'#ef7676'},Blunder:{glyph:'??',color:'#ec514e'}
};
function reviewCurrentMove(){
 if(!cursor||!reviewResults[cursor-1])return null;
 const classification=reviewResults[cursor-1];
 const visual=reviewMoveDecorations[classification.label];
 if(!visual)return null;
 try{
  const pos=new Chess(history[cursor-1]),move=pos.move(sanMoves[cursor-1]);
  return move?{square:move.to,label:classification.label,...visual}:null;
 }catch{return null}
}
function render(){
 ensureBoardCells();
 const pos=new Chess(history[cursor]),possible=selected?pos.moves({square:selected,verbose:true}):[];
 const highlight=reviewCurrentMove();
 for(const [sq,b] of boardCells){
  const p=pos.get(sq),key=p?p.color+p.type:'';
  if(b.dataset.piece!==key){
   b.dataset.piece=key;b.replaceChildren();
   if(p){const img=document.createElement('img');img.className='chess-piece';img.src='https://lichess1.org/assets/piece/cburnett/'+p.color+p.type.toUpperCase()+'.svg';img.alt=p.color+' '+p.type;img.draggable=false;img.onerror=()=>{img.remove();b.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};b.append(img)}
  }else b.querySelectorAll('.legal-move-dot,.legal-capture-ring,.review-move-badge').forEach(x=>x.remove());
  b.setAttribute('aria-label',sq+(p?' '+p.color+' '+p.type:''));
  b.classList.toggle('selected-square',selected===sq);
  b.classList.toggle('review-move-highlight',!!highlight&&highlight.square===sq);
  if(highlight&&highlight.square===sq){
   b.style.setProperty('--review-square-color',highlight.color);
   const badge=document.createElement('span');badge.className='review-move-badge';
   badge.textContent=highlight.glyph;badge.title=highlight.label;
   badge.style.background=highlight.color;
   badge.setAttribute('aria-label',highlight.label+' move');
   b.append(badge);
  }else b.style.removeProperty('--review-square-color');
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
  button.textContent=sanMoves[i];
  const category=reviewResults[i];
  const decoration=category&&reviewMoveDecorations[category.label];
  if(decoration){
   button.classList.add('notation-highlight-'+category.label.toLowerCase());
   const glyph=document.createElement('span');
   glyph.className='notation-review-glyph';
   glyph.textContent=decoration.glyph;
   glyph.style.background=decoration.color;
   glyph.setAttribute('aria-hidden','true');
   button.append(glyph);
  }
  button.title=category?category.label+' move':'Go to move';
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
// Import now lives inside Game Review. One action both imports and starts review.
let importedPlayers={white:'White',black:'Black'};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
 mode=b.dataset.mode;
 document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));
 $('import-value').placeholder=mode==='pgn'?'Paste PGN here':mode==='fen'?'Paste FEN here':'Paste a Lichess or Chess.com game link';
});
async function importGame(){
 const value=$('import-value').value.trim(),status=$('import-status');
 if(!value)return history.length>1;
 try{
  let pgn=value;
  if(mode==='url'){
   const url=new URL(value);
   const host=url.hostname.toLowerCase();
   if(host==='lichess.org'||host==='www.lichess.org'){
    const id=url.pathname.split('/').filter(Boolean)[0];
    if(!/^[a-zA-Z0-9]{8,12}$/.test(id||''))throw Error('Invalid Lichess game link.');
    const response=await fetch('https://lichess.org/game/export/'+encodeURIComponent(id)+'?clocks=false&evals=false',{headers:{Accept:'application/x-chess-pgn'}});
    if(!response.ok)throw Error('Lichess game could not be fetched ('+response.status+').');
    pgn=await response.text();
   }else if(host==='chess.com'||host==='www.chess.com'){
    const id=url.pathname.match(/\/game\/(?:live|daily)\/(\d+)/)?.[1];
    if(!id)throw Error('Use a Chess.com live or daily game link, or paste the PGN.');
    // Chess.com does not publish a guaranteed per-game PGN endpoint.
    // Try its public game callback; failures report a useful PGN fallback.
    let response;
    try{response=await fetch('https://www.chess.com/callback/live/games/'+id,{headers:{Accept:'application/json'}})}catch{}
    if(!response?.ok)throw Error('This Chess.com link cannot be imported directly here. Copy the game PGN from Chess.com and paste it instead.');
    const data=await response.json();
    pgn=data?.pgn||data?.game?.pgn||data?.game?.headers?.pgn;
    if(typeof pgn!=='string')throw Error('Chess.com did not return a PGN. Paste the PGN instead.');
   }else throw Error('Supported game links: Lichess and Chess.com.');
  }
  const next=new Chess();
  if(mode==='fen')next.load(pgn);else next.loadPgn(pgn);
  const headers=mode==='fen'?{}:next.header();
  importedPlayers={white:headers.White||'White',black:headers.Black||'Black'};
  const startFen=mode==='fen'?next.fen():headers.FEN;
  const replay=new Chess(startFen||undefined),states=[replay.fen()];
  const moves=mode==='fen'?[]:next.history();
  for(const san of moves){replay.move(san);states.push(replay.fen())}
  history=states;sanMoves=moves;reviewResults=[];cursor=0;selected=null;arrows=[];blueSquares.clear();
  status.textContent=mode==='fen'?'Position imported. Make moves to review a game.':'';
  render();requestAnalysis();
  renderReviewPlaceholder();
  return true;
 }catch(e){status.textContent='Import failed: '+e.message;return false}
}

const reviewPanel=document.createElement('section');
reviewPanel.id='game-review';reviewPanel.className='game-review';
reviewPanel.innerHTML='<h2>Game Review</h2><h3 class="review-import-heading">Import a position or game</h3><div id="review-import-slot"></div><div class="review-actions"><button id="review-start" type="button" hidden>Review Game</button><button id="review-cancel" type="button" disabled hidden>Cancel</button></div><div id="review-status" role="status"></div><div id="review-summary"></div>';
boardLayout.closest('.tool-card').insertAdjacentElement('afterend',reviewPanel);
const importCard=$('import-value').closest('.tool-card');
const importSlot=$('review-import-slot');
importSlot.append(importCard.querySelector('.tab-row'),$('import-value'),$('import-status'));
importCard.remove();
const importBox=$('import-value');
function syncReviewAction(){
 $('review-start').hidden=!(importBox.value.trim()||history.length>1);
}
importBox.addEventListener('input',syncReviewAction);
function renderReviewPlaceholder(){
 const panel=$('review-side-stats');
 if(panel&&!reviewResults.length){
  panel.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Game statistics';
  const note=document.createElement('p');note.className='review-placeholder';
  note.textContent='Import a game and choose Review Game to see accuracy, move classifications and the evaluation graph.';
  panel.append(heading,note);
 }
 syncReviewAction();
}
renderReviewPlaceholder();
let reviewWorker=null,reviewCancelled=false;
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
// Compact, screenshot-inspired review scorecard in the EloScanner palette.
// Experimental EloScanner performance estimate. Uses move quality, consistency,
// tactical complexity and sample size, never the player's account rating.
// Not a statistically calibrated Elo or a Chess.com Game Rating.
function estimateGamePerformance(categories,accuracyBySide){
 return [0,1].map(side=>{
  const moves=categories.filter((_,i)=>i%2===side);
  if(moves.length<8||accuracyBySide[side]==null)return null;
  const n=moves.length;
  const accuracy=accuracyBySide[side];
  const avgLoss=moves.reduce((sum,m)=>sum+m.loss,0)/n;
  const excellent=moves.filter(m=>['Brilliant','Great','Best','Excellent'].includes(m.label)).length/n;
  const serious=moves.filter(m=>['Mistake','Miss','Blunder'].includes(m.label)).length/n;
  const challenging=moves.filter(m=>m.complexity>=.38).length/n;
  const variation=moves.reduce((sum,m)=>sum+(m.loss-avgLoss)**2,0)/n;
  const stability=1-Math.min(1,Math.sqrt(variation)/18);
  const raw=620+16.5*(accuracy-55)+365*excellent-450*serious+
   125*challenging+110*stability;
  // Short games contain much less evidence; shrink towards an uncertain center.
  const confidence=Math.min(1,Math.sqrt(n/30));
  const estimate=1300+(raw-1300)*confidence;
  return Math.round(Math.max(400,Math.min(2800,estimate))/25)*25;
 });
}
function renderReviewScorecard(categories,evaluations,accuracyBySide){
 const panel=$('review-side-stats');
 if(!panel)return;
 panel.replaceChildren();
 const heading=document.createElement('h3');heading.textContent='Game Review';panel.append(heading);
 const chart=document.createElement('div');chart.className='review-graph';chart.setAttribute('aria-label','White evaluation graph across the game');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 320 78');svg.setAttribute('preserveAspectRatio','none');
 const make=(tag,attrs={})=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el};
 const graphY=cp=>39-31*Math.tanh(cp/280);
 const points=evaluations.map((ev,i)=>[320*i/Math.max(1,evaluations.length-1),graphY(ev.white)]);
 const graphLine=points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
 const area=make('path',{d:graphLine+' L320 78 L0 78 Z',fill:'#eff6f8','fill-opacity':'.96'});
 const mid=make('path',{d:'M0 39 H320',stroke:'#97abb8','stroke-width':'.8'});
 const line=make('path',{d:graphLine,stroke:'#f7fbfe','stroke-width':'2',fill:'none','stroke-linejoin':'round'});
 svg.append(area,mid,line);
 const colors={Brilliant:'#24c9b5',Great:'#7fadd6',Book:'#caad8a',Best:'#79c85b',Excellent:'#90ca67',Good:'#9abb83',Inaccuracy:'#e5c338',Mistake:'#ef9b50',Miss:'#ef7272',Blunder:'#ee5656'};
 categories.forEach((c,i)=>{
  const p=points[i+1];if(!p)return;
  svg.append(make('circle',{cx:p[0],cy:p[1],r:'3.2',fill:colors[c.label]||'#d1d9e1'}));
 });
 chart.append(svg);panel.append(chart);
 const headers=document.createElement('div');headers.className='review-players';
 const title=document.createElement('span');title.textContent='Players';headers.append(title);
 for(const side of ['white','black']){
  const cell=document.createElement('div');cell.className='review-player';
  const badge=document.createElement('span');badge.className='review-player-avatar '+side;badge.textContent=(importedPlayers[side]||side).slice(0,1).toUpperCase();
  const name=document.createElement('span');name.className='review-player-name';name.textContent=importedPlayers[side]||side;
  cell.append(badge,name);headers.append(cell);
 }
 panel.append(headers);
 const addMetric=(label,values,extraClass='')=>{
  const row=document.createElement('div');row.className='review-metric '+extraClass;
  const name=document.createElement('span');name.textContent=label;row.append(name);
  for(let i=0;i<2;i++){const value=document.createElement('strong');value.textContent=String(values[i]);row.append(value)}
  panel.append(row);
 };
 addMetric('Accuracy',accuracyBySide.map(x=>x==null?'—':x.toFixed(1)+'%'),'review-accuracy');
 const groups=[
  ['Brilliant','!!'],['Great','!'],['Book','▣'],['Best','★'],['Excellent','◆'],
  ['Good','✓'],['Inaccuracy','?!'],['Mistake','?'],['Miss','×'],['Blunder','??']
 ];
 const bySide=[{},{}];
 categories.forEach((c,i)=>{const side=i%2;bySide[side][c.label]=(bySide[side][c.label]||0)+1});
 const head=document.createElement('div');head.className='review-breakdown-head';head.textContent='Move classifications';panel.append(head);
 for(const [name,symbol] of groups){
  const row=document.createElement('div');row.className='review-classification';
  const label=document.createElement('span');label.textContent=name;
  const left=document.createElement('strong');left.textContent=bySide[0][name]||0;
  const marker=document.createElement('span');marker.className='review-class-icon review-class-'+name.toLowerCase();
  marker.textContent=symbol;
  const right=document.createElement('strong');right.textContent=bySide[1][name]||0;
  row.append(label,left,marker,right);panel.append(row);
 }
 const note=document.createElement('p');note.className='review-scoring-note';
 note.textContent='Accuracy and classifications are EloScanner estimates; Book uses our limited opening list. Not official Chess.com scores.';
 panel.append(note);
 const performances=estimateGamePerformance(categories,accuracyBySide);
 addMetric('Game Rating',performances.map(x=>x===null?'—':x),'review-rating');
 const caption=document.createElement('p');caption.className='review-rating-note';
 caption.textContent='Experimental EloScanner performance estimate (400–2800), based on move accuracy, serious errors, difficult decisions and consistency—not your account Elo. Uncalibrated; short games are less reliable.';
 panel.append(caption);
}
function stopReview(){
 reviewCancelled=true;
 if(reviewWorker){reviewWorker.terminate();reviewWorker=null}
 reviewBusy=false;$('review-start').disabled=false;$('review-cancel').disabled=true;
}
$('review-cancel').onclick=()=>{stopReview();$('review-status').textContent='Review cancelled.'};
$('review-start').onclick=async()=>{
 if(reviewBusy)return;
 if(importBox.value.trim()&&!await importGame())return;
 if(history.length<2){$('review-status').textContent='Import a PGN with moves or play some moves to review. A FEN alone has no move history.';return}
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
   status.textContent='Analyzing position '+(i+1)+' of '+snapshot.length+' (local Stockfish, '+'0.5 second'+')…';
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
   worker.postMessage('position fen '+snapshot[i]);worker.postMessage('go movetime 500');
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
   // Mark Book only when the move follows a named line in EloScanner's
   // limited built-in opening list; not merely because it is an early move.
   const prefix=moves.slice(0,i+1).join(' ');
   const book=OPENINGS.some(([line])=>line===prefix||line.startsWith(prefix+' '));
   const second=evaluations[i].second;const before=new Chess(snapshot[i]);const alternatives=before.moves().length;const played=before.move(moves[i]);const captured=played?.captured?({p:100,n:320,b:330,r:500,q:900}[played.captured]||0):0;const sacrifice=played?reviewOfferedMaterial(before,played,captured):0;const brilliant=best&&!book&&sacrifice>=250&&actualWin>=50&&alternatives>1&&(second===null||reviewWin(second*mover)<90);const great=best&&!book&&!brilliant&&second!==null&&reviewWin(evaluations[i].white*mover)-reviewWin(second*mover)>=8;const category=reviewCategory(loss,book,best,brilliant,great,bestWin,actualWin);
   categories.push({...category,loss:Number(loss.toFixed(2)),accuracy:reviewMoveAccuracy(loss),complexity:Math.min(1,Math.max(0,(alternatives-1)/24))*(bestWin>20&&bestWin<80?1:.55),move:moves[i]});counts[category.label]=(counts[category.label]||0)+1;
  }
  reviewResults=categories;
  status.textContent='';
  // All metrics are displayed once, in the left Game Review scorecard.
  const sideStats=[0,1].map(side=>reviewAccuracy(
   categories,evaluations.map(x=>reviewWin(x.white)),side));
  renderReviewScorecard(categories,evaluations,sideStats);
  render();
 }catch(e){if(!reviewCancelled)status.textContent='Review failed: '+e.message}
 finally{if(reviewWorker===worker)stopReview()}
};

render();
