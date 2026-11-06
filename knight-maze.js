(()=>{'use strict';
const $=id=>document.getElementById(id),board=$('maze-board');
const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const neighbors=i=>{const x=i%8,y=Math.floor(i/8);return jumps.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&a<8&&b>=0&&b<8).map(([a,b])=>b*8+a)};
let run=null,busy=false,timer=null,showAll=false,submitted=false,finished=false;
let drag=null, right=null, selected=false;
let mazeAccount=null;
const accountName=()=>mazeAccount?.username||null;
function syncScoreIdentity(){const name=accountName(),input=$('maze-nickname'),label=$('maze-nickname-label');if(!input||!label)return;label.textContent=name?'Account: '+name:'Leaderboard nickname';input.hidden=!!name;input.disabled=!!name;if(name)input.value=name;}
// This script loads before account-nav.js; fetch the session directly.
const mazeIdentityReady=fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store'})
 .then(async response=>{if(!response.ok)throw Error('Account status unavailable');const data=await response.json();mazeAccount=data.user||null;syncScoreIdentity();return true})
 .catch(()=>{mazeAccount=null;syncScoreIdentity();return false});
window.addEventListener('elo-account-changed',e=>{mazeAccount=e.detail?.user||null;syncScoreIdentity()});
const arrows=[],highlights=new Set();
let moveQueue=[],sendingMoves=false,serverRun=null,runEpoch=0,levelPending=false,moveRetry=0;
let upcoming=null,confirmedUpcoming=null,previewBuffer=[],confirmedBuffer=[];
const status=t=>$('maze-status').textContent=t;
const remaining=()=>run?Math.max(0,Math.ceil((run.endsAt-Date.now())/1000)):180;
function updateClock(){
 const seconds=remaining();$('maze-time').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 if(run&&!finished&&seconds===0)endRun(true);
}
// Create the 64 squares and one reusable knight image only once.
// A settled move merely changes existing cells, so no event targets or piece
// images are destroyed while the player is dragging the knight.
const cells=[];
const piece=document.createElement('img');
piece.className='maze-piece';piece.src='/vendor/pieces/cburnett/wN.svg';
piece.alt='White knight';piece.draggable=false;
piece.onerror=()=>{piece.replaceWith(document.createTextNode('♘'))};
function render(){
 board.classList.toggle('maze-not-started',!run);
 if(!cells.length){
  for(let i=0;i<64;i++){
   const cell=document.createElement('button');
   cell.type='button';cell.dataset.index=String(i);
   cell.addEventListener('click',e=>{if(i!==run?.position)move(i)});
   cells.push(cell);board.append(cell);
  }
 }
 const blocked=new Set(run?.blocked||[]);
 const reachable=run&&!finished?new Set(neighbors(run.position).filter(i=>!blocked.has(i))):new Set();
 for(let i=0;i<64;i++){
  const cell=cells[i],isKnight=run?.position===i,isGoal=run?.goal===i;
  const square=String.fromCharCode(97+i%8)+(8-Math.floor(i/8));
  cell.className='maze-cell '+((Math.floor(i/8)+i%8)%2?'dark':'light')+
   (blocked.has(i)?' blocked':'')+(reachable.has(i)?' reachable':'')+
   (isKnight&&!finished?' knight-source':'')+
   (selected&&isKnight?' selected-square':'');
  cell.setAttribute('aria-label',square+(blocked.has(i)?', blocked':isKnight?', knight':isGoal?', star':''));
  if(isKnight){
   if(piece.parentNode!==cell)cell.replaceChildren(piece);
  }else if(isGoal){
   if(!cell.firstElementChild?.classList.contains('maze-star')){
    const star=document.createElement('span');star.className='maze-star';star.textContent='★';
    star.setAttribute('aria-hidden','true');cell.replaceChildren(star);
   }
  }else if(cell.firstChild)cell.replaceChildren();
 }
 $('maze-score').textContent=run?.score||0;
 $('maze-level').textContent=run?.level||1;
 drawAnnotations();
 updateClock();
}
async function api(body){
 const res=await fetch('/api/knight-maze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed.');return data;
}
async function start(){
 if(busy)return;busy=true;runEpoch++;moveQueue=[];sendingMoves=false;serverRun=null;upcoming=null;confirmedUpcoming=null;previewBuffer=[];confirmedBuffer=[];levelPending=false;moveRetry=0;releaseDrag();clearAnnotations();selected=false;$('maze-start').disabled=true;
 try{
  const data=await api({action:'start'});run=data.run;serverRun=data.run;upcoming=data.run.preview||null;previewBuffer=data.run.lookahead||[];confirmedUpcoming=upcoming;confirmedBuffer=[...previewBuffer];finished=false;submitted=false;
  $('maze-submit-panel').hidden=true;$('maze-start').hidden=true;$('maze-finish').hidden=false;
  status('Find the star using knight moves.');render();
  clearInterval(timer);timer=setInterval(updateClock,200);
 }catch(e){status(e.message)}
 finally{busy=false;$('maze-start').disabled=false;render()}
}
// Show each ordinary move immediately. Send moves to the server in order
// without locking the pointer controls between requests.
function move(to){
 if(busy||levelPending||!run||finished||remaining()===0)return;
 if(!neighbors(run.position).includes(to)||run.blocked.includes(to))return;
 selected=false;clearAnnotations();
 const from=run.position,solved=to===run.goal,level=run.level;
 moveQueue.push({from,to,level,solved});
 if(solved&&upcoming){
  // The server already supplied this exact level before the star was reached.
  // Switch NOW; the network confirmation is processed independently in order.
  const next=upcoming;upcoming=previewBuffer.shift()||null;
  run={...run,level:level+1,score:run.score+1,
   position:next.position,goal:next.goal,blocked:next.blocked};
  status('Star collected! New maze unlocked.');
 }else if(solved){
  // Backward compatibility for a run started before the preview API existed.
  levelPending=true;
  run={...run,position:to};
  status('Star reached! Loading next maze…');
 }else{
  run={...run,position:to};
  status('Keep going. Reach the star!');
 }
 render();
 void flushMoves();
}
async function flushMoves(){
 if(sendingMoves||!moveQueue.length||!serverRun)return;
 sendingMoves=true;
 const epoch=runEpoch;
 try{
  while(moveQueue.length&&epoch===runEpoch){
   const next=moveQueue[0];
   const data=await api({action:'move',id:serverRun.id,to:next.to});
   if(epoch!==runEpoch)return;
   serverRun=data.run;
   moveQueue.shift();moveRetry=0;
   if(data.expired){
    moveQueue=[];levelPending=false;upcoming=null;
    releaseDrag();run=serverRun;
    // Wait for the sender flag to clear before ending the run.
    queueMicrotask(()=>endRun(true));
    return;
   }
   if(data.solved){
    confirmedUpcoming=data.run.preview||null;confirmedBuffer=data.run.lookahead||[];
    // If the local board already showed this level, never jump backward to
    // its initial square: the player may have made further moves.
    if(run.level<data.run.level){
     releaseDrag();run=data.run;levelPending=false;
     upcoming=confirmedUpcoming;previewBuffer=[...confirmedBuffer];
     status('Star collected! New maze unlocked.');
     render();
    }else if(run.level===data.run.level){
     upcoming=confirmedUpcoming;previewBuffer=[...confirmedBuffer];
     const waitingAtGoal=levelPending&&moveQueue.some(item=>item.level===run.level&&item.solved);
     if(waitingAtGoal&&upcoming){
      const nextMaze=upcoming;upcoming=previewBuffer.shift()||null;levelPending=false;
      run={...run,level:run.level+1,score:run.score+1,
       position:nextMaze.position,goal:nextMaze.goal,blocked:nextMaze.blocked};
      status('Star collected! New maze unlocked.');render();
     }else if(!waitingAtGoal)levelPending=false;
    }
   }else if(!moveQueue.length&&run.level===data.run.level&&run.position!==data.run.position){
    // Only resynchronize a truly divergent position, not a normal ack.
    // Avoid destroying the current drag gesture on an unchanged board.
    releaseDrag();run={...data.run};render();
   }
  }
 }catch(e){
  if(epoch!==runEpoch)return;
  if(/Failed to fetch|NetworkError|Load failed|temporarily|503|502/i.test(e.message)&&moveRetry<3){
   moveRetry++;
   status('Connection interrupted. Retrying your move…');
   await new Promise(resolve=>setTimeout(resolve,350*moveRetry));
  }else{
   moveQueue=[];levelPending=false;moveRetry=0;
   releaseDrag();run=serverRun;upcoming=confirmedUpcoming;previewBuffer=[...confirmedBuffer];
   status(e.message+' Position resynchronized.');render();
  }
 }finally{
  if(epoch===runEpoch){
   sendingMoves=false;
   if(moveQueue.length)void flushMoves();
  }
 }
}
async function endRun(expired){
 if(!run||finished)return;
 if(sendingMoves||moveQueue.length){status('Saving your last move…');setTimeout(()=>endRun(expired),180);return}
 finished=true;clearInterval(timer);
 $('maze-finish').hidden=true;$('maze-start').hidden=false;$('maze-start').textContent='Play Again';
 status(expired?"Time's up! Your run is complete.":'Run finished.');
 if(!expired){try{await api({action:'finish',id:run.id})}catch(e){status('Run ended. '+e.message)}}
 $('maze-final-score').textContent='You collected '+run.score+' star'+(run.score===1?'':'s')+'.';
 $('maze-submit-panel').hidden=false;
 $('maze-submit').disabled=run.score<1;
 if(run.score<1)$('maze-submit-status').textContent='Collect at least one star to enter the leaderboard.';
 render();
}
async function submit(){
 if(!run||!finished||submitted)return;
 $('maze-submit').disabled=true;$('maze-submit-status').textContent='Checking account…';
 await mazeIdentityReady;
 const nickname=accountName()||$('maze-nickname').value.trim();$('maze-submit-status').textContent='Submitting…';
 try{
  const data=await api({action:'submit',id:run.id,nickname,sourceType:accountName()?'account':'nickname'});submitted=true;
  $('maze-submit-status').textContent='Score submitted successfully!';
  if(!showAll)renderRanking(data.entries);
  else await loadRanking();
 }catch(e){$('maze-submit-status').textContent=e.message;$('maze-submit').disabled=false}
}
function renderRanking(entries){
 const list=$('maze-ranking');list.replaceChildren();
 if(!entries.length){const li=document.createElement('li');li.className='maze-empty';li.textContent='No scores yet. Be the first!';list.append(li);return}
 for(const entry of entries){const li=document.createElement('li'),name=document.createElement('span'),score=document.createElement('strong');name.className='maze-rank-name '+(entry.sourceType==='account'?'rank-account':'rank-nickname');name.textContent=entry.nickname;score.className='maze-rank-score';score.textContent=entry.score;li.append(name,score);list.append(li)}
}
async function loadRanking(){
 try{const res=await fetch('/api/knight-maze?limit='+(showAll?'100':'10'),{cache:'no-store'}),data=await res.json();if(!res.ok)throw Error(data.error||'Leaderboard unavailable');renderRanking(data.entries||[])}
 catch(e){const list=$('maze-ranking');list.replaceChildren();const li=document.createElement('li');li.className='maze-empty';li.textContent=e.message;list.append(li)}
}
$('maze-start').addEventListener('click',start);
$('maze-finish').addEventListener('click',()=>endRun(false));
$('maze-submit').addEventListener('click',submit);
$('maze-nickname').addEventListener('keydown',e=>{if(e.key==='Enter')submit()});

// Analysis-style pointer controls: click, drag, cancel, right-drag annotations.
const svgNS='http://www.w3.org/2000/svg';
function squareAt(x,y){
 const rect=board.getBoundingClientRect();
 if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return -1;
 return Math.floor((y-rect.top)*8/rect.height)*8+Math.floor((x-rect.left)*8/rect.width);
}
function releaseDrag(){
 if(!drag)return;
 drag.ghost?.remove();
 if(drag.source?.isConnected)drag.source.style.visibility='';
 const d=drag;drag=null;
 try{if(board.hasPointerCapture(d.id))board.releasePointerCapture(d.id)}catch{}
}
function cancelDrag(){releaseDrag();selected=false;render()}
function clearAnnotations(){arrows.length=0;highlights.clear()}
function drawAnnotations(){
 const old=board.querySelector('.maze-annotations');old?.remove();
 if(!highlights.size&&!arrows.length)return;
 const svg=document.createElementNS(svgNS,'svg');
 svg.setAttribute('viewBox','0 0 800 800');
 svg.setAttribute('class','maze-annotations');
 svg.setAttribute('aria-hidden','true');
 const center=i=>({x:(i%8+.5)*100,y:(Math.floor(i/8)+.5)*100});
 for(const i of highlights){
  const {x,y}=center(i),rect=document.createElementNS(svgNS,'rect');
  rect.setAttribute('x',x-48);rect.setAttribute('y',y-48);rect.setAttribute('width',96);rect.setAttribute('height',96);
  rect.setAttribute('fill','none');rect.setAttribute('stroke','#0a9cff');rect.setAttribute('stroke-width','9');svg.append(rect);
 }
 for(const [from,to,color] of arrows){
  const a=center(from),b=center(to),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(!len)continue;
  const x=b.x-dx/len*31,y=b.y-dy/len*31;
  const line=document.createElementNS(svgNS,'line');
  line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',x);line.setAttribute('y2',y);
  line.setAttribute('stroke',color==='rainbow'?'#f0a93a':color);line.setAttribute('stroke-width','13');line.setAttribute('stroke-linecap','round');line.setAttribute('opacity','.83');svg.append(line);
  const angle=Math.atan2(dy,dx),length=26,spread=.55;
  const poly=document.createElementNS(svgNS,'polygon');
  poly.setAttribute('points',[x+Math.cos(angle)*length+','+(y+Math.sin(angle)*length),x-Math.cos(angle-spread)*length+','+(y-Math.sin(angle-spread)*length),x-Math.cos(angle+spread)*length+','+(y-Math.sin(angle+spread)*length)].join(' '));
  poly.setAttribute('fill',color==='rainbow'?'#f0a93a':color);poly.setAttribute('opacity','.85');svg.append(poly);
 }
 board.append(svg);
}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('dragstart',e=>e.preventDefault());
board.addEventListener('mousedown',e=>{if(e.button===2&&drag){e.preventDefault();cancelDrag()}});
board.addEventListener('pointerdown',e=>{
 const square=squareAt(e.clientX,e.clientY);
 if(e.button===2){
  e.preventDefault();
  if(drag){cancelDrag();return}
  if(square>=0){right={id:e.pointerId,from:square};try{board.setPointerCapture(e.pointerId)}catch{}}
  return;
 }
 if(e.button!==0||square<0||!run||finished||busy||remaining()===0)return;
 e.preventDefault();releaseDrag();right=null;
 if(square===run.position){
  drag={id:e.pointerId,from:square,x:e.clientX,y:e.clientY,dragging:false,source:null,ghost:null};
  selected=true;render();
  drag.source=board.querySelector('.knight-source .maze-piece');
  try{board.setPointerCapture(e.pointerId)}catch{}
 }else if(neighbors(run.position).includes(square)&&!run.blocked.includes(square)){
  selected=false;move(square);
 }else{selected=false;render()}
});
board.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.id)return;
 if(e.buttons&2){cancelDrag();return}
 if(!drag.dragging&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8){
  drag.dragging=true;
  if(drag.source){
   const ghost=drag.source.cloneNode(true),size=board.getBoundingClientRect().width/8;
   ghost.className='maze-drag-ghost';ghost.style.width=size+'px';ghost.style.height=size+'px';
   ghost.style.transform='translate3d(-50%,-50%,0)';ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
   document.body.append(ghost);drag.ghost=ghost;drag.source.style.visibility='hidden';
  }
 }
 if(drag.dragging){
  e.preventDefault();
  if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}
 }
});
board.addEventListener('pointerup',e=>{
 if(e.button===2){
  if(drag){cancelDrag();return}
  if(!right)return;
  const from=right.from,to=squareAt(e.clientX,e.clientY);right=null;try{if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId)}catch{}
  if(to<0)return;
  if(from===to){if(highlights.has(to))highlights.delete(to);else highlights.add(to)}
  else{
   const idx=arrows.findIndex(a=>a[0]===from&&a[1]===to);
   if(idx>=0)arrows.splice(idx,1);
   else arrows.push([from,to,e.altKey?'rainbow':e.shiftKey?'#a855f7':e.ctrlKey?'#760018':'#0a9cff']);
  }
  drawAnnotations();return;
 }
 if(e.button!==0||!drag||drag.id!==e.pointerId)return;
 const wasDragging=drag.dragging,to=squareAt(e.clientX,e.clientY);
 releaseDrag();selected=false;
 if(wasDragging&&to>=0&&to!==run?.position)move(to);
 else render();
});
board.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)cancelDrag();if(right?.id===e.pointerId)right=null});
syncScoreIdentity();render();loadRanking();
})();