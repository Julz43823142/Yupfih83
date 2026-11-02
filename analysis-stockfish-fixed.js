import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
const $=id=>document.getElementById(id),board=$('board'),glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let game=new Chess(),history=[game.fen()],cursor=0,mode='pgn',selected=null,arrowFrom=null,arrows=[];
let engine=null,engineReady=false,engineTimer=null,engineFen='',drag=null,rightStart=null;
let engineFallback=false,engineWorkerUrl=null;
const engineInfo=$('engine-info'),engineSwitch=$('engine');
const ENGINE_JS='/vendor/stockfish/stockfish-19-lite-single.js';
const CDN_BASE='https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/';
function requestAnalysis(){
 if(!engine||!engineReady||!engineSwitch.checked)return;
 engineFen=history[cursor];
 engine.postMessage('stop');
 engine.postMessage('position fen '+engineFen);
 engine.postMessage('go depth 14');
 engineInfo.textContent=(engineFallback?'Stockfish 19 Lite (CDN)':'Stockfish 19 Lite')+' · calculating…';
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
     const depth=line.match(/\bdepth (\d+)/),score=line.match(/\bscore (cp|mate) (-?\d+)/),pv=line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
     if(score&&pv){
      const value=score[1]==='mate'?'Mate '+score[2]:(Number(score[2])/100).toFixed(2);
      engineInfo.textContent=(engineFallback?'Stockfish 19 Lite (CDN)':'Stockfish 19 Lite')+' · depth '+(depth?.[1]||'?')+' · '+value+' (side to move) · best move '+pv[1];
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
function stopEngine(){cleanupEngine()}
engineSwitch.addEventListener('change',()=>{
 if(engineSwitch.checked)startEngine();
 else{stopEngine();engineInfo.textContent='Engine disabled.'}
});
function deselectDraggedSource(source){source.classList.add('drag-source');}
function squareAt(x,y){const rect=board.getBoundingClientRect();const file=Math.floor((x-rect.left)/rect.width*8),rank=Math.floor((y-rect.top)/rect.height*8);return file>=0&&file<8&&rank>=0&&rank<8?String.fromCharCode(97+file)+(8-rank):null}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('pointerdown',e=>{const sq=squareAt(e.clientX,e.clientY);if(!sq)return;if(e.button===2){rightStart=sq;e.preventDefault();return}if(e.button!==0)return;const pos=new Chess(history[cursor]),piece=pos.get(sq);if(!piece||piece.color!==pos.turn())return;const source=e.target.closest('button');if(!source)return;drag={from:sq,startX:e.clientX,startY:e.clientY,active:false,source,ghost:null};e.preventDefault()});
board.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.active=true;const img=drag.source.querySelector('img');drag.ghost=img?img.cloneNode(true):document.createElement('span');if(!img)drag.ghost.textContent=drag.source.textContent;drag.ghost.className='dragging-chess-piece';deselectDraggedSource(drag.source);document.body.append(drag.ghost)}if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}});
window.addEventListener('pointerup',e=>{if(e.button===2&&rightStart){const to=squareAt(e.clientX,e.clientY);if(to&&to!==rightStart){const key=rightStart+to,idx=arrows.findIndex(a=>a.join('')===key);if(idx>=0)arrows.splice(idx,1);else arrows.push([rightStart,to]);drawArrows()}rightStart=null;return}if(!drag)return;const d=drag;drag=null;d.ghost?.remove();d.source.classList.remove('drag-source');const to=squareAt(e.clientX,e.clientY);if(!to)return;selected=d.from;const target=[...board.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith(to));target?.click()});

function drawArrows(){let svg=board.querySelector('svg.arrows');if(svg)svg.remove();svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 800');svg.setAttribute('class','arrows');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';const defs=document.createElementNS(svg.namespaceURI,'defs');defs.innerHTML='<marker id="arrowhead" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5Z" fill="#4de2ff"/></marker>';svg.append(defs);for(const [a,b] of arrows){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',(a.charCodeAt(0)-97)*100+50);line.setAttribute('y1',(8-Number(a[1]))*100+50);line.setAttribute('x2',(b.charCodeAt(0)-97)*100+50);line.setAttribute('y2',(8-Number(b[1]))*100+50);line.setAttribute('stroke','#4de2ff');line.setAttribute('stroke-opacity','.82');line.setAttribute('stroke-width','13');line.setAttribute('marker-end','url(#arrowhead)');svg.append(line)}board.append(svg)}
function render(){const pos=new Chess(history[cursor]);board.replaceChildren();board.style.position='relative';for(let r=0;r<8;r++)for(let f=0;f<8;f++){const sq=String.fromCharCode(97+f)+(8-r),p=pos.get(sq),b=document.createElement('button');b.type='button';b.className=(r+f)%2?'dark':'light';b.textContent='';if(p){const piece=document.createElement('img');piece.className='chess-piece';piece.src='https://lichess1.org/assets/piece/cburnett/'+p.color+p.type.toUpperCase()+'.svg';piece.alt=p.color+' '+p.type;piece.draggable=false;piece.onerror=()=>{piece.remove();b.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};b.append(piece)}b.setAttribute('aria-label',sq+(p?' '+p.color+' '+p.type:''));if(selected===sq)b.style.outline='3px solid #facc15';b.draggable=false;b.onclick=()=>{if(!selected){if(p&&p.color===pos.turn()){selected=sq;render()}return}try{pos.move({from:selected,to:sq,promotion:'q'});history=history.slice(0,cursor+1);history.push(pos.fen());cursor++;selected=null;arrows=[];render();requestAnalysis()}catch{selected=null;render()}};board.append(b)}$('turn').textContent=(pos.turn()==='w'?'White':'Black')+' to move · '+cursor+'/'+(history.length-1);drawArrows();$('back').disabled=cursor===0;$('forward').disabled=cursor===history.length-1}
$('back').onclick=()=>{if(cursor){cursor--;selected=null;render();requestAnalysis()}};$('forward').onclick=()=>{if(cursor<history.length-1){cursor++;selected=null;render();requestAnalysis()}};$('reset').onclick=()=>{history=[new Chess().fen()];cursor=0;selected=null;render();requestAnalysis()};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('import-value').placeholder=mode==='pgn'?'Paste PGN here':mode==='fen'?'Paste FEN here':'Paste Chess.com game URL'});
$('load').onclick=async()=>{const value=$('import-value').value.trim();const status=$('import-status');try{let text=value;if(mode==='url'){const url=new URL(value);if(url.hostname!=='www.chess.com'&&url.hostname!=='chess.com')throw Error('Only Chess.com game URLs are supported.');throw Error('Direct game-link import is not supported yet. Paste PGN instead.')}const next=new Chess();if(mode==='fen')next.load(text);else next.loadPgn(text);const replay=new Chess(mode==='fen'?next.fen():undefined);const states=[replay.fen()];if(mode==='pgn')for(const m of next.history()){replay.move(m);states.push(replay.fen())}history=states;cursor=0;selected=null;status.textContent='Loaded '+(states.length-1)+' moves.';render();requestAnalysis()}catch(e){status.textContent='Could not load: '+e.message}};

render();
