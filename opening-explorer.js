import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
const $=id=>document.getElementById(id),game=new Chess(),line=[],board=$('opening-board');
let catalog=[],currentResults=[],chosen=null,fetchIndex=0,controller=null;
const glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
const format=n=>Intl.NumberFormat('en-US',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n);
function draw(){
 board.replaceChildren();
 const matrix=game.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const sq=document.createElement('div');sq.className='opening-square'+((r+f)%2?' dark':'');
  const piece=matrix[r][f];
  if(piece){const img=document.createElement('img');img.src='https://lichess1.org/assets/piece/cburnett/'+piece.color+piece.type.toUpperCase()+'.svg';img.alt=piece.color+' '+piece.type;img.onerror=()=>{img.remove();sq.textContent=glyph[piece.color==='w'?piece.type.toUpperCase():piece.type]};sq.append(img)}
  board.append(sq);
 }
 $('opening-back').disabled=line.length===0;
 $('opening-path').textContent=line.length?line.map((m,i)=>(i%2===0?(Math.floor(i/2)+1)+'. ':'')+m).join(' '):'Starting position';
 const path=game.history().join(' ');
 const match=[...catalog].filter(x=>x.sanLine&&path.startsWith(x.sanLine)&&(!path[x.sanLine.length]||path[x.sanLine.length]===' ')).sort((a,b)=>b.sanLine.length-a.sanLine.length)[0];
 $('opening-name').textContent=chosen?.sanLine===path?chosen.name:(match?.name||'Opening Explorer');
 fetchStats();
}
function reset(){game.reset();line.length=0;chosen=null;draw()}
function forward(san){try{const result=game.move(san);if(!result)throw Error('Illegal move');line.push(result.san);chosen=null;draw()}catch(e){$('opening-stat').textContent='Could not play move: '+e.message}}
function back(){if(game.undo()){line.pop();chosen=null;draw()}}
$('opening-reset').onclick=reset;$('opening-back').onclick=back;
$('opening-next').onclick=()=>{const next=currentResults[0];if(next)forward(next.san)};
function renderMoves(data){
 const root=$('opening-moves');root.replaceChildren();currentResults=data.moves||[];
 const total=(data.white||0)+(data.draws||0)+(data.black||0);
 $('opening-stat').textContent=total?format(total)+' games · White '+(100*data.white/total).toFixed(1)+'% · Draw '+(100*data.draws/total).toFixed(1)+'% · Black '+(100*data.black/total).toFixed(1)+'%':'No games for this position in the selected Lichess explorer pool.';
 if(data.opening?.name&&!chosen)$('opening-name').textContent=data.opening.name;
 for(const move of currentResults){
  const count=move.white+move.draws+move.black,b=document.createElement('button');b.type='button';b.className='opening-move';
  const san=document.createElement('strong');san.textContent=move.san;
  const n=document.createElement('span');n.className='count';n.textContent=format(count)+' games';
  const bar=document.createElement('span');bar.className='opening-bar';
  for(const [cls,num] of [['w',move.white],['d',move.draws],['b',move.black]]){const part=document.createElement('span');part.className=cls;part.style.width=(count?100*num/count:0)+'%';bar.append(part)}
  const p=document.createElement('small');p.textContent=count?'White '+(100*move.white/count).toFixed(0)+'% · Draw '+(100*move.draws/count).toFixed(0)+'% · Black '+(100*move.black/count).toFixed(0)+'%':'—';
  b.append(san,n,bar,p);b.onclick=()=>forward(move.san);root.append(b);
 }
 $('opening-next').disabled=!currentResults.length;
}
async function fetchStats(){
 const token=++fetchIndex;controller?.abort();controller=new AbortController();
 $('opening-stat').textContent='Loading Lichess opening statistics…';$('opening-moves').replaceChildren();
 try{
  const r=await fetch('/api/opening-explorer?fen='+encodeURIComponent(game.fen()),{signal:controller.signal});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Database unavailable');
  if(token===fetchIndex)renderMoves(data);
 }catch(e){if(token===fetchIndex&&e.name!=='AbortError')$('opening-stat').textContent=e.message}
}
function parseLine(pgn){
 const stripped=String(pgn||'').replace(/\d+\.(?:\.\.)?/g,' ').replace(/\{[^}]*\}/g,' ').replace(/\s+/g,' ').trim();
 return stripped?stripped.split(' ').filter(x=>!/^\d+\.*$/.test(x)):[]}
function choose(entry){
 reset();for(const san of entry.moves){try{game.move(san);line.push(san)}catch{break}}
 chosen=entry;draw();$('opening-name').textContent=entry.name+' ('+entry.eco+')';$('opening-results').replaceChildren();
 $('opening-query').value=entry.name;
}
function search(){
 const q=$('opening-query').value.trim().toLowerCase(),root=$('opening-results');root.replaceChildren();
 if(!q)return;
 const results=catalog.filter(o=>o.name.toLowerCase().includes(q)||o.eco.toLowerCase()===q).slice(0,55);
 if(!results.length){const p=document.createElement('p');p.className='opening-status';p.textContent=catalog.length?'No opening names found. Try another spelling.':'Opening catalogue temporarily unavailable.';root.append(p);return}
 for(const entry of results){const b=document.createElement('button');b.type='button';b.className='opening-choice';b.textContent=entry.name;
  const small=document.createElement('small');small.textContent=entry.eco+' · '+entry.pgn;b.append(small);b.onclick=()=>choose(entry);root.append(b)}
 $('catalog-status').textContent=results.length+' matches shown'+(results.length===55?' (refine your search)':'');
}
$('opening-search').addEventListener('submit',e=>{e.preventDefault();search()});
$('opening-query').addEventListener('input',()=>{clearTimeout(window.eloOpeningSearchDelay);window.eloOpeningSearchDelay=setTimeout(search,180)});
async function loadCatalog(){
 try{
  const r=await fetch('/api/opening-catalog');if(!r.ok)throw Error('Catalogue unavailable');
  const rows=await r.json();
  catalog=rows.map(o=>({...o,moves:parseLine(o.pgn)})).filter(o=>o.moves.length);
  for(const item of catalog)item.sanLine=item.moves.join(' ');
  $('catalog-status').textContent=catalog.length.toLocaleString('en-US')+' named openings and variations available.';
  search();draw();
 }catch(e){$('catalog-status').textContent='Opening-name search is temporarily unavailable; live move statistics still work.'}
}
const initial=new URLSearchParams(location.search).get('moves');
if(initial&&initial.length<700){
 for(const token of initial.trim().split(/\s+/).slice(0,60)){
  try{const m=game.move(token);if(!m)break;line.push(m.san)}catch{break}
 }
}
draw();loadCatalog();
