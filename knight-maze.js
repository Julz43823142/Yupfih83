(()=>{'use strict';
const $=id=>document.getElementById(id),board=$('maze-board');
const jumps=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const neighbors=i=>{const x=i%8,y=Math.floor(i/8);return jumps.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&a<8&&b>=0&&b<8).map(([a,b])=>b*8+a)};
let run=null,busy=false,timer=null,showAll=false,submitted=false,finished=false;
const status=t=>$('maze-status').textContent=t;
const remaining=()=>run?Math.max(0,Math.ceil((run.endsAt-Date.now())/1000)):180;
function updateClock(){
 const seconds=remaining();$('maze-time').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 if(run&&!finished&&seconds===0)endRun(true);
}
function render(){
 board.replaceChildren();
 const blocked=new Set(run?.blocked||[]),reachable=run&&!finished?new Set(neighbors(run.position).filter(i=>!blocked.has(i))):new Set();
 for(let i=0;i<64;i++){
  const cell=document.createElement('button');cell.type='button';
  cell.className='maze-cell '+((Math.floor(i/8)+i%8)%2?'dark':'light')+(blocked.has(i)?' blocked':'')+(reachable.has(i)?' reachable':'');
  const square=String.fromCharCode(97+i%8)+(8-Math.floor(i/8));
  cell.setAttribute('aria-label',square+(blocked.has(i)?', blocked':run?.position===i?', knight':run?.goal===i?', star':''));
  cell.disabled=!reachable.has(i)||busy;
  if(run?.position===i){const piece=document.createElement('span');piece.className='maze-piece';piece.textContent='♞';piece.setAttribute('aria-hidden','true');cell.append(piece)}
  else if(run?.goal===i){const star=document.createElement('span');star.className='maze-star';star.textContent='★';star.setAttribute('aria-hidden','true');cell.append(star)}
  cell.addEventListener('click',()=>move(i));
  board.append(cell);
 }
 $('maze-score').textContent=run?.score||0;$('maze-level').textContent=run?.level||1;
 updateClock();
}
async function api(body){
 const res=await fetch('/api/knight-maze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed.');return data;
}
async function start(){
 if(busy)return;busy=true;$('maze-start').disabled=true;
 try{
  const data=await api({action:'start'});run=data.run;finished=false;submitted=false;
  $('maze-submit-panel').hidden=true;$('maze-start').hidden=true;$('maze-finish').hidden=false;
  status('Find the star using knight moves.');render();
  clearInterval(timer);timer=setInterval(updateClock,200);
 }catch(e){status(e.message)}
 finally{busy=false;$('maze-start').disabled=false;render()}
}
async function move(to){
 if(busy||!run||finished||remaining()===0)return;
 if(!neighbors(run.position).includes(to)||run.blocked.includes(to))return;
 busy=true;render();
 try{
  const data=await api({action:'move',id:run.id,to});
  run=data.run;
  if(data.expired){endRun(true);return}
  status(data.solved?'Star collected! New maze unlocked.':'Keep going. Reach the star!');
 }catch(e){status(e.message);if(/already processed/i.test(e.message))endRun(false)}
 finally{busy=false;render()}
}
async function endRun(expired){
 if(!run||finished)return;finished=true;clearInterval(timer);
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
 const nickname=$('maze-nickname').value.trim();$('maze-submit').disabled=true;$('maze-submit-status').textContent='Submitting…';
 try{
  const data=await api({action:'submit',id:run.id,nickname});submitted=true;
  $('maze-submit-status').textContent='Score submitted successfully!';
  if(!showAll)renderRanking(data.entries);
  else await loadRanking();
 }catch(e){$('maze-submit-status').textContent=e.message;$('maze-submit').disabled=false}
}
function renderRanking(entries){
 const list=$('maze-ranking');list.replaceChildren();
 if(!entries.length){const li=document.createElement('li');li.className='maze-empty';li.textContent='No scores yet. Be the first!';list.append(li);return}
 for(const entry of entries){const li=document.createElement('li'),name=document.createElement('span'),score=document.createElement('strong');name.className='maze-rank-name';name.textContent=entry.nickname;score.className='maze-rank-score';score.textContent=entry.score;li.append(name,score);list.append(li)}
}
async function loadRanking(){
 try{const res=await fetch('/api/knight-maze?limit='+(showAll?'100':'10'),{cache:'no-store'}),data=await res.json();if(!res.ok)throw Error(data.error||'Leaderboard unavailable');renderRanking(data.entries||[])}
 catch(e){const list=$('maze-ranking');list.replaceChildren();const li=document.createElement('li');li.className='maze-empty';li.textContent=e.message;list.append(li)}
}
$('maze-start').addEventListener('click',start);
$('maze-finish').addEventListener('click',()=>endRun(false));
$('maze-submit').addEventListener('click',submit);
$('maze-nickname').addEventListener('keydown',e=>{if(e.key==='Enter')submit()});
$('maze-show-all').addEventListener('click',()=>{showAll=!showAll;$('maze-show-all').textContent=showAll?'Show Top 10':'View Top 100';$('maze-show-all').setAttribute('aria-expanded',String(showAll));loadRanking()});
render();loadRanking();
})();