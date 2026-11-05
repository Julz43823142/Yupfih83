import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
const $=id=>document.getElementById(id),board=$('board'),glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let game=new Chess(),history=[game.fen()],cursor=0,mode='pgn',selected=null,arrowFrom=null,arrows=[];
let engine=null,engineReady=false,engineTimer=null,engineFen='',drag=null,rightStart=null;
let engineFallback=false,engineWorkerUrl=null;
let sanMoves=[]; const squareNodes=new Map();
const engineInfo=$('engine-info'),engineSwitch=$('engine');
const ENGINE_JS='/engine/stockfish-19-lite-single.js';
const CDN_BASE='/vendor/stockfish/';
function requestAnalysis(){
 if(!engine||!engineReady||!engineSwitch.checked)return;
 engineFen=history[cursor];
 engine.postMessage('stop');
 engine.postMessage('position fen '+engineFen);
 engine.postMessage('go depth 14');
 engineInfo.textContent='Stockfish 19 Lite · calculating…';
}
function cleanupEngine(){
 clearTimeout(engineTimer);engineTimer=null;
 if(engine){try{engine.postMessage('quit')}catch{}engine.terminate()}
 engine=null;engineReady=false;
 if(engineWorkerUrl){URL.revokeObjectURL(engineWorkerUrl);engineWorkerUrl=null}
}
function engineFailed(message){
 cleanupEngine();
 if(!engineFallback){
  engineFallback=true;
  engineInfo.textContent='Trying Stockfish CDN fallback…';
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
   for(const line of String(e.data).split('\\n')){
    if(line.includes('uciok'))engine.postMessage('isready');
    if(line.includes('readyok')){
     engineReady=true;
     clearTimeout(engineTimer);engineTimer=null;
     requestAnalysis();
    }
    if(engineSwitch.checked&&engineReady&&line.startsWith('info ')&&line.includes(' score ')&&line.includes(' pv ')){
     const depth=line.match(/\\bdepth (\\d+)/),score=line.match(/\\bscore (cp|mate) (-?\\d+)/),pv=line.match(/\\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
     if(score&&pv){
      const value=score[1]==='mate'?'Mate '+score[2]:(Number(score[2])/100).toFixed(2);
      engineInfo.textContent='Stockfish 19 Lite · depth '+(depth?.[1]||'?')+' · '+value+' (side to move) · best move '+pv[1];
     }
    }
   }
  };
  engine.onerror=e=>{e.preventDefault?.();engineFailed('engine worker failed to load')};
  engine.postMessage('uci');
  engineTimer=setTimeout(()=>{if(!engineReady&&engineSwitch.checked)engineFailed('engine did not respond in time')},20000);
 }catch(e){engineFailed(e.message||'Worker unavailable')}
}
function startEngine(){
 engineFallback=false;
 engineInfo.textContent='Loading Stockfish 19 Lite…';
 launchEngine(false);
}
function stopEngine(){cleanupEngine()}
engineSwitch.addEventListener('change',()=>{
 if(engineSwitch.checked)startEngine();
 else{stopEngine();engineInfo.textContent='Engine disabled.'}
});
function deselectDraggedSource(source){source.classList.add('drag-source');}
function squareAt(x,y){const rect=board.getBoundingClientRect();const file=Math.floor((x-rect.left)/rect.width*8),rank=Math.floor((y-rect.top)/rect.height*8);return file>=0&&file<8&&rank>=0&&rank<8?String.fromCharCode(97+file)+(8-rank):null}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('pointerdown',e=>{const sq=squareAt(e.clientX,e.clientY);if(!sq)return;if(e.button===2){rightStart=sq;e.preventDefault();return}if(e.button!==0)return;if(arrows.length){arrows=[];drawArrows()}const pos=new Chess(history[cursor]),piece=pos.get(sq);if(!piece||piece.color!==pos.turn())return;const source=e.target.closest('button');if(!source)return;drag={from:sq,startX:e.clientX,startY:e.clientY,active:false,source,ghost:null};e.preventDefault()});
board.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.active=true;const img=drag.source.querySelector('img');drag.ghost=img?img.cloneNode(true):document.createElement('span');if(!img)drag.ghost.textContent=drag.source.textContent;drag.ghost.className='dragging-chess-piece';deselectDraggedSource(drag.source);document.body.append(drag.ghost)}if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}});
window.addEventListener('pointerup',e=>{if(e.button===2&&rightStart){const to=squareAt(e.clientX,e.clientY);if(to&&to!==rightStart){const key=rightStart+to,idx=arrows.findIndex(a=>a.join('')===key);if(idx>=0)arrows.splice(idx,1);else arrows.push([rightStart,to]);drawArrows()}rightStart=null;return}if(!drag)return;const d=drag;drag=null;d.ghost?.remove();d.source.classList.remove('drag-source');const to=squareAt(e.clientX,e.clientY);if(!to)return;selected=d.from;const target=[...board.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith(to));target?.click()});

function drawArrows(){let svg=board.querySelector('svg.arrows');if(svg)svg.remove();svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 800');svg.setAttribute('class','arrows');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';const defs=document.createElementNS(svg.namespaceURI,'defs');defs.innerHTML='<marker id="arrowhead" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5Z" fill="#4de2ff"/></marker>';svg.append(defs);for(const [a,b] of arrows){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',(a.charCodeAt(0)-97)*100+50);line.setAttribute('y1',(8-Number(a[1]))*100+50);line.setAttribute('x2',(b.charCodeAt(0)-97)*100+50);line.setAttribute('y2',(8-Number(b[1]))*100+50);line.setAttribute('stroke','#4de2ff');line.setAttribute('stroke-opacity','.82');line.setAttribute('stroke-width','13');line.setAttribute('marker-end','url(#arrowhead)');svg.append(line)}board.append(svg)}
function ensureSquares(){
 if(squareNodes.size)return;
 board.replaceChildren();board.style.position='relative';
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const sq=String.fromCharCode(97+f)+(8-r),b=document.createElement('button');
  b.type='button';b.className=(r+f)%2?'dark':'light';b.draggable=false;
  b.dataset.square=sq;b.setAttribute('aria-label',sq);
  b.onclick=()=>onSquareClick(sq);squareNodes.set(sq,b);board.append(b);
 }
}
function onSquareClick(sq){
 const pos=new Chess(history[cursor]),p=pos.get(sq);
 if(!selected){if(p&&p.color===pos.turn()){selected=sq;render()}return}
 try{
  const move=pos.move({from:selected,to:sq,promotion:'q'});
  if(!move)throw Error('Illegal move');
  history=history.slice(0,cursor+1);sanMoves=sanMoves.slice(0,cursor);
  history.push(pos.fen());sanMoves.push(move.san);cursor++;selected=null;arrows=[];
  render();requestAnalysis();
 }catch{selected=null;render()}
}
function render(){
 ensureSquares();
 const pos=new Chess(history[cursor]);
 for(const [sq,b] of squareNodes){
  const p=pos.get(sq),pieceKey=p?p.color+p.type:'';
  if(b.dataset.piece!==pieceKey){
   b.replaceChildren();b.dataset.piece=pieceKey;
   if(p){const piece=document.createElement('img');piece.className='chess-piece';piece.src='/vendor/pieces/cburnett/'+p.color+p.type.toUpperCase()+'.svg';piece.alt=p.color+' '+p.type;piece.draggable=false;piece.onerror=()=>{piece.remove();b.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};b.append(piece)}
  }
  b.setAttribute('aria-label',sq+(p?' '+p.color+' '+p.type:''));
  b.style.outline=selected===sq?'3px solid #facc15':'';
 }
 $('turn').textContent=(pos.turn()==='w'?'White':'Black')+' to move · '+cursor+'/'+(history.length-1);
 drawArrows();$('back').disabled=cursor===0;$('forward').disabled=cursor===history.length-1;
 renderNotation();
}
function renderNotation(){
 let panel=$('live-notation');
 if(!panel){
  panel=document.createElement('section');panel.id='live-notation';
  panel.style.cssText='background:#10283e;border:1px solid #315570;border-radius:12px;padding:16px;min-width:230px;max-height:560px;overflow:auto;color:#e8f6ff';
  const heading=document.createElement('h3');heading.textContent='Moves';heading.style.margin='0 0 12px';
  const opening=document.createElement('div');opening.id='opening-name';opening.style.cssText='color:#6ce2f5;margin-bottom:12px;font-weight:600';
  const moves=document.createElement('div');moves.id='notation-moves';moves.style.cssText='display:grid;grid-template-columns:35px 1fr 1fr;gap:6px;align-items:center';
  panel.append(heading,opening,moves);
  const host=board.parentElement;host.style.display='flex';host.style.flexWrap='wrap';host.style.gap='20px';host.style.alignItems='flex-start';host.append(panel);
 }
 const opening=$('opening-name'),moves=$('notation-moves');
 const prefix=sanMoves.slice(0,cursor).join(' ');
 opening.textContent=/^e4 c5(?: |$)/.test(prefix)?'Sicilian Defense':/^e4 e5 Nf3 Nc6 Bb5(?: |$)/.test(prefix)?'Ruy Lopez':/^e4 e5 Nf3 Nc6 Bc4(?: |$)/.test(prefix)?'Italian Game':/^d4 d5 c4(?: |$)/.test(prefix)?"Queen's Gambit":/^e4 e6(?: |$)/.test(prefix)?'French Defense':/^e4 c6(?: |$)/.test(prefix)?'Caro-Kann Defense':/^e3(?: |$)/.test(prefix)?"Van't Kruijs Opening":/^d4 Nf6 c4 g6(?: |$)/.test(prefix)?"King's Indian Defense":'Opening not identified';
 moves.replaceChildren();
 for(let i=0;i<sanMoves.length;i++){
  if(i%2===0){const num=document.createElement('span');num.textContent=(Math.floor(i/2)+1)+'.';moves.append(num)}
  const btn=document.createElement('button');btn.type='button';btn.textContent=sanMoves[i];btn.style.cssText='padding:5px 8px;border:0;border-radius:5px;cursor:pointer;background:'+(cursor===i+1?'#236e91':'transparent')+';color:#f0f9ff;text-align:left';
  btn.onclick=()=>{cursor=i+1;selected=null;render();requestAnalysis()};moves.append(btn);
  if(i===sanMoves.length-1&&i%2===0)moves.append(document.createElement('span'));
 }
}
document.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;
 if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 e.preventDefault();const button=e.key==='ArrowLeft'?$('back'):$('forward');if(!button.disabled)button.click();
});
$('back').onclick=()=>{if(cursor){cursor--;selected=null;render();requestAnalysis()}};$('forward').onclick=()=>{if(cursor<history.length-1){cursor++;selected=null;render();requestAnalysis()}};$('reset').onclick=()=>{history=[new Chess().fen()];sanMoves=[];cursor=0;selected=null;arrows=[];render();requestAnalysis()};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('import-value').placeholder=mode==='pgn'?'Paste PGN here':mode==='fen'?'Paste FEN here':'Paste Chess.com game URL'});
$('load').onclick=async()=>{const value=$('import-value').value.trim();const status=$('import-status');try{let text=value;if(mode==='url'){const url=new URL(value);if(url.hostname!=='www.chess.com'&&url.hostname!=='chess.com')throw Error('Only Chess.com game URLs are supported.');throw Error('Direct game-link import is not supported yet. Paste PGN instead.')}const next=new Chess();if(mode==='fen')next.load(text);else next.loadPgn(text);const replay=new Chess(mode==='fen'?next.fen():undefined);const states=[replay.fen()];if(mode==='pgn')for(const m of next.history()){replay.move(m);states.push(replay.fen())}history=states;sanMoves=mode==='pgn'?next.history():[];cursor=0;selected=null;arrows=[];status.textContent='Loaded '+(states.length-1)+' moves.';render();requestAnalysis()}catch(e){status.textContent='Could not load: '+e.message}};

async function loadOnlineGame(gameId){
 const status=$('import-status');
 try{
  const response=await fetch('/api/social/game?id='+encodeURIComponent(gameId),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.moves))throw Error(data.error||'Game unavailable');
  const replay=new Chess(),states=[replay.fen()];
  for(const san of data.moves){replay.move(san);states.push(replay.fen())}
  history=states;sanMoves=data.moves.slice();cursor=states.length-1;selected=null;arrows=[];
  document.title=(data.white||'White')+' vs '+(data.black||'Black')+' | Analysis | EloScanner';
  render();requestAnalysis();
  if(status)status.textContent='Online game · '+(data.white||'White')+' vs '+(data.black||'Black')+' · '+data.result;
 }catch(error){if(status)status.textContent=error.message||'Could not load online game'}
}
const onlineGameId=new URL(location.href).searchParams.get('online');
if(onlineGameId&&/^[a-f0-9]{32}$/.test(onlineGameId))loadOnlineGame(onlineGameId);

render();
