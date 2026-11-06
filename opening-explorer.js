import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {fetchOpeningStats} from './opening-stats-client.js?v=5';
const $=id=>document.getElementById(id),game=new Chess(),line=[],board=$('opening-board');
let catalog=[],currentResults=[],chosen=null,fetchIndex=0,controller=null;
let selectedSquare=null,dragFrom=null,redoMoves=[];
const glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
const format=n=>Intl.NumberFormat('en-US',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n);
function describeOpening(name){
 const n=String(name||'').toLowerCase();
 if(n.includes('sicilian'))return 'The Sicilian is an asymmetric response to 1.e4. Black challenges the centre with ...c5, often creating active counterplay on the queenside. White frequently develops quickly and looks for central or kingside initiative. The exact plans depend on the variation.';
 if(n.includes('caro-kann'))return 'Black supports ...d5 with ...c6, aiming for a solid pawn structure and sound development. White can choose space, central exchanges or sharper attacking setups. Watch the central pawn tension.';
 if(n.includes('queen\'s gambit')||n.includes('queens gambit'))return 'White uses 1.d4 and 2.c4 to challenge Black’s central d5 pawn. Typical themes include central tension, development of the light-squared bishop and pressure on the queenside.';
 if(n.includes('italian'))return 'White develops the bishop to c4, targets the sensitive f7 square and aims for fast development. Both sides need to pay attention to central breaks with d4 or ...d5.';
 if(n.includes('ruy lopez')||n.includes('spanish'))return 'White puts pressure on the knight defending e5, often leading to a strategic fight for the centre. Typical themes include pawn breaks, piece manoeuvres and kingside pressure.';
 if(n.includes('french'))return 'Black challenges White’s e4 pawn with ...e6 and ...d5. The pawn chains often lead to plans based on attacking their base, fighting for key squares and finding play for Black’s light-squared bishop.';
 if(n.includes('king\'s indian'))return 'Black permits White a broad pawn centre and looks for dynamic counterplay. Common themes are central pawn breaks and opposing-side attacking plans.';
 if(n.includes('english'))return 'White begins with 1.c4, often controlling d5 from the flank. The opening can transpose into many other systems, so move order and central structure matter.';
 if(n.includes('scandinavian'))return 'Black immediately challenges e4 with ...d5. The centre opens early and both sides must balance development, queen activity and pawn structure.';
 if(n.includes('london'))return 'White usually develops the dark-squared bishop to f4 and builds a compact setup. The key questions are when to play c4 or e4 and how to respond to Black’s central breaks.';
 return 'Follow the moves on the board and compare the most frequent continuations below. The move statistics show what players have chosen, not which move is objectively best. Use Stockfish analysis for tactical evaluation.';
}
function setTheory(name){
 const out=$('opening-theory-text');if(out)out.textContent=describeOpening(name);
}
function draw(){
 board.replaceChildren();
 const matrix=game.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const sq=document.createElement('div');sq.className='opening-square'+((r+f)%2?' dark':'');
  const square=String.fromCharCode(97+f)+(8-r);sq.dataset.square=square;
  sq.setAttribute('role','button');sq.tabIndex=0;sq.setAttribute('aria-label','Square '+square+(piece?' '+piece.color+' '+piece.type:''));
  if(square===selectedSquare)sq.classList.add('selected');
  sq.addEventListener('click',()=>selectOrMove(square));
  sq.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectOrMove(square)}});
  if(piece&&piece.color===game.turn()){sq.draggable=true;sq.addEventListener('dragstart',e=>{dragFrom=square;e.dataTransfer.setData('text/plain',square);e.dataTransfer.effectAllowed='move'})}
  sq.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move'});
  sq.addEventListener('drop',e=>{e.preventDefault();const from=dragFrom||e.dataTransfer.getData('text/plain');dragFrom=null;if(from)playBoardMove(from,square)});
  sq.addEventListener('dragend',()=>{dragFrom=null});
  const piece=matrix[r][f];
  if(piece){const img=document.createElement('img');img.src='/vendor/pieces/cburnett/'+piece.color+piece.type.toUpperCase()+'.svg';img.alt=piece.color+' '+piece.type;img.onerror=()=>{img.remove();sq.textContent=glyph[piece.color==='w'?piece.type.toUpperCase():piece.type]};sq.append(img)}
  board.append(sq);
 }
 $('opening-back').disabled=line.length===0;
 $('opening-move-counter').textContent='Move '+Math.ceil(line.length/2);
 $('board-opening-name').textContent=line.length?'Position after '+line[line.length-1]:'Starting position';
 $('opening-path').textContent=line.length?line.map((m,i)=>(i%2===0?(Math.floor(i/2)+1)+'. ':'')+m).join(' '):'Starting position';
 const path=game.history().join(' ');
 const match=[...catalog].filter(x=>x.sanLine&&path.startsWith(x.sanLine)&&(!path[x.sanLine.length]||path[x.sanLine.length]===' ')).sort((a,b)=>b.sanLine.length-a.sanLine.length)[0];
 $('opening-name').textContent=chosen?.sanLine===path?chosen.name:(match?.name||'Starting position');
 setTheory(chosen?.name||match?.name||'');
 fetchStats();
}
function reset(){game.reset();line.length=0;chosen=null;selectedSquare=null;redoMoves=[];draw()}
function forward(san){try{const result=game.move(san);if(!result)throw Error('Illegal move');line.push(result.san);chosen=null;selectedSquare=null;redoMoves=[];draw()}catch(e){$('opening-stat').textContent='Could not play move: '+e.message}}
function back(){const undone=game.undo();if(undone){redoMoves.push(undone.san);line.pop();chosen=null;selectedSquare=null;draw()}}
function redo(){const san=redoMoves.pop();if(!san)return;try{const result=game.move(san);if(result){line.push(result.san);chosen=null;selectedSquare=null;draw()}}catch{redoMoves=[]}}
function playBoardMove(from,to){
 try{const result=game.move({from,to,promotion:'q'});if(!result)return false;line.push(result.san);chosen=null;selectedSquare=null;redoMoves=[];draw();return true}
 catch{return false}
}
function selectOrMove(square){
 const piece=game.get(square);
 if(selectedSquare&&selectedSquare!==square&&playBoardMove(selectedSquare,square))return;
 selectedSquare=piece&&piece.color===game.turn()?(selectedSquare===square?null:square):null;
 board.querySelectorAll('.opening-square').forEach(el=>el.classList.toggle('selected',el.dataset.square===selectedSquare));
}
document.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
 const el=e.target;if(el?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
 if(e.key==='ArrowLeft'){e.preventDefault();back()}
 else if(e.key==='ArrowRight'){e.preventDefault();if(redoMoves.length)redo();else{const next=currentResults[0];if(next)forward(next.san)}}
});
$('opening-reset').onclick=reset;$('opening-back').onclick=back;
$('opening-next').onclick=()=>{if(redoMoves.length)redo();else{const next=currentResults[0];if(next)forward(next.san)}};
function renderMoves(data){
 const root=$('opening-moves');root.replaceChildren();currentResults=data.moves||[];
 const total=(data.white||0)+(data.draws||0)+(data.black||0);
 $('opening-stat').textContent=total?format(total)+' games · White '+(100*data.white/total).toFixed(1)+'% · Draw '+(100*data.draws/total).toFixed(1)+'% · Black '+(100*data.black/total).toFixed(1)+'%':'No games for this position in the selected Lichess explorer pool.';
 if(data.opening?.name&&!chosen){$('opening-name').textContent=data.opening.name;setTheory(data.opening.name)}
 for(const move of currentResults){
  const count=move.white+move.draws+move.black,b=document.createElement('button');b.type='button';b.className='opening-move';
  const san=document.createElement('strong');san.textContent=move.san;
  const n=document.createElement('span');n.className='count';n.textContent=format(count)+' games';
  const bar=document.createElement('span');bar.className='opening-bar';
  for(const [cls,num,short] of [['w',move.white,'W'],['d',move.draws,'D'],['b',move.black,'B']]){const part=document.createElement('span');part.className=cls;const pct=count?100*num/count:0;part.style.width=pct+'%';part.title=short+' '+pct.toFixed(1)+'%';if(pct>=11)part.textContent=Math.round(pct)+'%';bar.append(part)}
  bar.setAttribute('aria-label',count?'White '+Math.round(100*move.white/count)+'%, draws '+Math.round(100*move.draws/count)+'%, black '+Math.round(100*move.black/count)+'%':'No results');
  b.append(san,n,bar);b.onclick=()=>forward(move.san);root.append(b);
 }
 $('opening-next').disabled=!currentResults.length;
}
async function fetchStats(){
 const token=++fetchIndex;controller?.abort();controller=new AbortController();
 $('opening-stat').textContent='Loading database statistics…';$('opening-moves').replaceChildren();
 try{
  const data=await fetchOpeningStats(game.fen(),{signal:controller.signal});
  if(token===fetchIndex)renderMoves(data);
 }catch(e){if(token===fetchIndex&&e.name!=='AbortError')$('opening-stat').textContent=e.message}
}
function parseLine(pgn){
 const stripped=String(pgn||'').replace(/\d+\.(?:\.\.)?/g,' ').replace(/\{[^}]*\}/g,' ').replace(/\s+/g,' ').trim();
 return stripped?stripped.split(' ').filter(x=>!/^\d+\.*$/.test(x)):[]}
function choose(entry){
 reset();for(const san of entry.moves){try{game.move(san);line.push(san)}catch{break}}
 redoMoves=[];selectedSquare=null;chosen=entry;draw();$('opening-name').textContent=entry.name+' ('+entry.eco+')';setTheory(entry.name);$('opening-results').replaceChildren();
 $('opening-query').value=entry.name;
}
function search(){
 const typed=$('opening-query').value.trim().toLowerCase();
 const q=/^sicili(?:ë|e|an|aans?)/.test(typed)?'sicilian':typed;
 const root=$('opening-results');root.replaceChildren();
 if(!q)return;
 const results=catalog.filter(o=>o.name.toLowerCase().includes(q)||o.eco.toLowerCase()===q).slice(0,55);
 if(!results.length){const p=document.createElement('p');p.className='opening-status';p.textContent=catalog.length?'No opening names found. Try another spelling.':'Opening catalogue temporarily unavailable.';root.append(p);return}
 for(const entry of results){const b=document.createElement('button');b.type='button';b.className='opening-choice';b.textContent=entry.name;
  const small=document.createElement('small');small.textContent=entry.eco+' · '+entry.pgn;b.append(small);b.onclick=()=>choose(entry);root.append(b)}
 $('catalog-status').textContent=results.length+' matches shown'+(results.length===55?' (refine your search)':'');
}
$('opening-search').addEventListener('submit',e=>{e.preventDefault();search()});
document.querySelectorAll('[data-opening]').forEach(button=>button.addEventListener('click',()=>{
 $('opening-query').value=button.dataset.opening;search();$('opening-query').focus();
}));
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
