import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
const $=id=>document.getElementById(id),board=$('board'),glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let game=new Chess(),history=[game.fen()],cursor=0,mode='pgn',selected=null,arrowFrom=null,arrows=[];
let engine=null,engineReady=false,engineTimer=null,engineFen='',drag=null,rightStart=null;
let engineFallback=false,engineWorkerUrl=null;
let multiPV=3,engineLines=new Map(),bestEngineMove=null,analysisEpoch=0,unlimitedDepth=false;
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
evalTrack.append(evalWhite);evalWrap.append(evalText,evalTrack);
board.insertAdjacentElement('beforebegin',evalWrap);
function updateEvalBar(){
 const item=engineLines.get(1);
 if(!engineSwitch.checked||!engineReady||!item){
  evalWrap.classList.add('eval-inactive');evalWhite.style.width='50%';evalText.textContent='—';
  evalWrap.setAttribute('aria-valuenow','0');evalWrap.setAttribute('aria-valuetext','Analysis disabled or calculating');return;
 }
 evalWrap.classList.remove('eval-inactive');
 const sign=engineFen.split(' ')[1]==='b'?-1:1;
 const cp=item.type==='mate'?(Number(item.value)>0?10000:-10000)*sign:Number(item.value)*sign;
 const pawns=cp/100;
 const whitePercent=Math.max(3,Math.min(97,50+50*(2/Math.PI)*Math.atan(pawns/2.2)));
 evalWhite.style.width=whitePercent+'%';
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
depthLabel.textContent='Depth 14–18';
const depthPlus=document.createElement('button');
depthPlus.type='button';depthPlus.className='engine-depth-plus';
depthPlus.textContent='+';depthPlus.title='Continue analysing without a depth limit';
depthPlus.setAttribute('aria-label','Enable unlimited depth');
depthControl.append(depthLabel,depthPlus);
engineSettings.insertAdjacentElement('afterend',depthControl);
depthPlus.addEventListener('click',()=>{
 unlimitedDepth=!unlimitedDepth;
 depthLabel.textContent=unlimitedDepth?'Depth unlimited':'Depth 14–18';
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
function renderEngineLines(){
 enginePanel.replaceChildren();
 if(!engineSwitch.checked||!engineReady)return;
 for(let i=1;i<=multiPV;i++){
  const item=engineLines.get(i);
  if(!item)continue;
  const row=document.createElement('div');row.className='engine-line';
  const rank=document.createElement('span');rank.className='engine-line-rank';rank.textContent='#'+i;
  const move=document.createElement('strong');move.textContent=sanMove(item.uci);
  const score=document.createElement('span');score.className='engine-line-score';score.textContent=scoreLabel(item.type,item.value);
  const depth=document.createElement('span');depth.className='engine-line-depth';depth.textContent='Depth '+item.depth;
  row.append(rank,move,score,depth);
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
 renderEngineLines();updateEvalBar();drawArrows();
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
     const pv=line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/),rank=line.match(/\bmultipv (\d+)/);
     const n=rank?Number(rank[1]):1;
     if(score&&pv&&n>=1&&n<=multiPV&&Number(depth?.[1]||0)>=14){
      const d=Number(depth?.[1]||0),previous=engineLines.get(n);
      if(!previous||d>=previous.depth){
       engineLines.set(n,{uci:pv[1],type:score[1],value:score[2],depth:d});
       if(n===1){
        bestEngineMove=pv[1];
        engineInfo.textContent=(engineFallback?'Stockfish 19 Lite (CDN)':'Stockfish 19 Lite')+' · depth '+d+' · best '+sanMove(pv[1]);
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
function deselectDraggedSource(source){source.classList.add('drag-source');}
function squareAt(x,y){const rect=board.getBoundingClientRect();const file=Math.floor((x-rect.left)/rect.width*8),rank=Math.floor((y-rect.top)/rect.height*8);return file>=0&&file<8&&rank>=0&&rank<8?String.fromCharCode(97+file)+(8-rank):null}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('pointerdown',e=>{const sq=squareAt(e.clientX,e.clientY);if(!sq)return;if(e.button===2){rightStart=sq;e.preventDefault();return}if(e.button!==0)return;const pos=new Chess(history[cursor]),piece=pos.get(sq);if(!piece||piece.color!==pos.turn())return;const source=e.target.closest('button');if(!source)return;drag={from:sq,startX:e.clientX,startY:e.clientY,active:false,source,ghost:null};e.preventDefault()});
board.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.active=true;const img=drag.source.querySelector('img');drag.ghost=img?img.cloneNode(true):document.createElement('span');if(!img)drag.ghost.textContent=drag.source.textContent;drag.ghost.className='dragging-chess-piece';deselectDraggedSource(drag.source);document.body.append(drag.ghost)}if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}});
window.addEventListener('pointerup',e=>{if(e.button===2&&rightStart){const to=squareAt(e.clientX,e.clientY);if(to&&to!==rightStart){const key=rightStart+to,idx=arrows.findIndex(a=>a.join('')===key);if(idx>=0)arrows.splice(idx,1);else arrows.push([rightStart,to]);drawArrows()}rightStart=null;return}if(!drag)return;const d=drag;drag=null;d.ghost?.remove();d.source.classList.remove('drag-source');const to=squareAt(e.clientX,e.clientY);if(!to)return;selected=d.from;const target=[...board.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith(to));target?.click()});

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
  const ux=dx/d,uy=dy/d,px=-uy,py=ux;
  const tip=[x2-ux*15,y2-uy*15],base=[x2-ux*54,y2-uy*54],tail=[x1+ux*15,y1+uy*15];
  const coords=[[tail[0]+px*8,tail[1]+py*8],[base[0]+px*8,base[1]+py*8],[base[0]+px*23,base[1]+py*23],tip,[base[0]-px*23,base[1]-py*23],[base[0]-px*8,base[1]-py*8],[tail[0]-px*8,tail[1]-py*8]];
  const points=coords.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
  svg.append(make('polygon',{points,fill:'#152231','fill-opacity':'.45',stroke:'#152231','stroke-opacity':'.3','stroke-width':8,'stroke-linejoin':'round',transform:'translate(2 3)'}));
  svg.append(make('polygon',{points,fill:color,'fill-opacity':opacity,stroke:'#fff1a3','stroke-opacity':'.65','stroke-width':2,'stroke-linejoin':'round'}));
  svg.append(make('circle',{cx:tail[0],cy:tail[1],r:10,fill:color,'fill-opacity':'.65'}));
 }
 for(const [a,b] of arrows)arrow(a,b,'#4de2ff',.73);
 if(bestEngineMove&&engineSwitch.checked&&engineReady)arrow(bestEngineMove.slice(0,2),bestEngineMove.slice(2,4),'#ffd23f',.94);
 board.append(svg);
}
function render(){const pos=new Chess(history[cursor]);board.replaceChildren();board.style.position='relative';for(let r=0;r<8;r++)for(let f=0;f<8;f++){const sq=String.fromCharCode(97+f)+(8-r),p=pos.get(sq),b=document.createElement('button');b.type='button';b.className=(r+f)%2?'dark':'light';b.textContent='';if(p){const piece=document.createElement('img');piece.className='chess-piece';piece.src='https://lichess1.org/assets/piece/cburnett/'+p.color+p.type.toUpperCase()+'.svg';piece.alt=p.color+' '+p.type;piece.draggable=false;piece.onerror=()=>{piece.remove();b.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};b.append(piece)}b.setAttribute('aria-label',sq+(p?' '+p.color+' '+p.type:''));if(selected===sq)b.style.outline='3px solid #facc15';b.draggable=false;b.onclick=()=>{if(!selected){if(p&&p.color===pos.turn()){selected=sq;render()}return}try{pos.move({from:selected,to:sq,promotion:'q'});history=history.slice(0,cursor+1);history.push(pos.fen());cursor++;selected=null;arrows=[];render();requestAnalysis()}catch{selected=null;render()}};board.append(b)}$('turn').textContent=(pos.turn()==='w'?'White':'Black')+' to move · '+cursor+'/'+(history.length-1);drawArrows();$('back').disabled=cursor===0;$('forward').disabled=cursor===history.length-1}
$('back').onclick=()=>{if(cursor){cursor--;selected=null;render();requestAnalysis()}};$('forward').onclick=()=>{if(cursor<history.length-1){cursor++;selected=null;render();requestAnalysis()}};$('reset').onclick=()=>{history=[new Chess().fen()];cursor=0;selected=null;render();requestAnalysis()};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('import-value').placeholder=mode==='pgn'?'Paste PGN here':mode==='fen'?'Paste FEN here':'Paste Chess.com game URL'});
$('load').onclick=async()=>{const value=$('import-value').value.trim();const status=$('import-status');try{let text=value;if(mode==='url'){const url=new URL(value);if(url.hostname!=='www.chess.com'&&url.hostname!=='chess.com')throw Error('Only Chess.com game URLs are supported.');throw Error('Direct game-link import is not supported yet. Paste PGN instead.')}const next=new Chess();if(mode==='fen')next.load(text);else next.loadPgn(text);const replay=new Chess(mode==='fen'?next.fen():undefined);const states=[replay.fen()];if(mode==='pgn')for(const m of next.history()){replay.move(m);states.push(replay.fen())}history=states;cursor=0;selected=null;status.textContent='Loaded '+(states.length-1)+' moves.';render();requestAnalysis()}catch(e){status.textContent='Could not load: '+e.message}};

render();
