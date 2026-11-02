import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
const $=id=>document.getElementById(id), opponent=$('opponent'), board=$('board');
const glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let games=[],path=[],color='b',loading=false,selectedSquare=null,manualArrows=[],blueSquares=new Set(),candidateMoves=[];
function setupDateWheels(){for(const group of document.querySelectorAll('.date-wheels')){const id=group.dataset.date;const today=new Date();const parts=[{name:'Day',values:Array.from({length:31},(_,i)=>i+1),initial:id==='from'?1:today.getDate()},{name:'Month',values:Array.from({length:12},(_,i)=>i+1),initial:id==='from'?1:today.getMonth()+1},{name:'Year',values:Array.from({length:20},(_,i)=>today.getFullYear()-19+i),initial:id==='from'?today.getFullYear()-2:today.getFullYear()}];const selects=parts.map(part=>{const label=document.createElement('label');label.className='wheel-column';const name=document.createElement('small');name.textContent=part.name;const sel=document.createElement('select');sel.setAttribute('aria-label',id+' '+part.name);for(const n of part.values){const opt=document.createElement('option');opt.value=n;opt.textContent=String(n).padStart(2,'0');sel.append(opt)}sel.value=part.initial;label.append(name,sel);group.append(label);return sel});function update(){const [d,m,y]=selects.map(s=>Number(s.value));const dt=new Date(Date.UTC(y,m-1,d));$(''+id).value=dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0')+'-'+String(dt.getUTCDate()).padStart(2,'0')}selects.forEach(s=>s.addEventListener('change',update));update()}}setupDateWheels();
function status(t){$('fetch-status').textContent=t}
function renderBoard(){const game=new Chess();for(const m of path)game.move(m);board.replaceChildren();const squares=game.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){const cell=document.createElement('button');cell.type='button';cell.className=(r+f)%2?'dark':'light';const p=squares[r][f];cell.textContent='';if(p){const piece=document.createElement('img');piece.className='chess-piece';piece.src='https://lichess1.org/assets/piece/cburnett/'+p.color+p.type.toUpperCase()+'.svg';piece.alt=p.color+' '+p.type;piece.onerror=()=>{piece.remove();cell.textContent=glyph[p.color==='w'?p.type.toUpperCase():p.type]};cell.append(piece)}cell.setAttribute('aria-label',String.fromCharCode(97+f)+(8-r)+(p?' '+p.color+' '+p.type:''));cell.dataset.square=String.fromCharCode(97+f)+(8-r);cell.onclick=()=>clickSquare(cell.dataset.square);board.append(cell)}$('position-label').textContent=path.length?path.join(' '):'Starting position';$('prep-notation').textContent=path.length?path.map((m,i)=>(i%2===0?Math.floor(i/2)+1+'. ':'')+m).join(' '):'Starting position';}
function clickSquare(sq){const game=new Chess();for(const m of path)game.move(m);const piece=game.get(sq);if(selectedSquare){const found=game.moves({square:selectedSquare,verbose:true}).find(m=>m.to===sq);if(found){path.push(found.san);selectedSquare=null;manualArrows=[];render();return}}selectedSquare=piece&&piece.color===game.turn()?sq:null;render()}
function drawCandidateArrows(options){
 const old=board.querySelector('svg.prep-arrows');old?.remove();
 candidateMoves=options;
 const pos=new Chess();for(const m of path)pos.move(m);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('class','prep-arrows');svg.setAttribute('viewBox','0 0 800 800');
 svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
 const defs=document.createElementNS(svg.namespaceURI,'defs');
 defs.innerHTML='<marker id="prep-arrowhead" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5Z" fill="#30b978"/></marker>';svg.append(defs);
 options.slice(0,3).forEach((option,i)=>{
  try{
   const next=new Chess(pos.fen()),m=next.move(option.move);
   if(!m)return;
   const coord=sq=>[(sq.charCodeAt(0)-97)*100+50,(8-Number(sq[1]))*100+50];
   const [x1,y1]=coord(m.from),[x2,y2]=coord(m.to);
   const line=document.createElementNS(svg.namespaceURI,'line');
   for(const [k,v] of Object.entries({x1,y1,x2,y2}))line.setAttribute(k,v);
   line.setAttribute('stroke',i===0?'#30b978':'#a0adb8');line.setAttribute('stroke-opacity',String([.9,.48,.26][i]));
   line.setAttribute('stroke-width','12');
   line.setAttribute('marker-end','url(#prep-arrowhead)');svg.append(line);
  }catch{}
 });
 const pt=sq=>[(sq.charCodeAt(0)-97)*100+50,(8-Number(sq[1]))*100+50];for(const sq of blueSquares){const [x,y]=pt(sq),rect=document.createElementNS(svg.namespaceURI,'rect');for(const [k,v] of Object.entries({x:x-50,y:y-50,width:100,height:100,fill:'#328aff','fill-opacity':'.32'}))rect.setAttribute(k,v);svg.append(rect)}for(const [from,to] of manualArrows){const [x1,y1]=pt(from),[x2,y2]=pt(to),line=document.createElementNS(svg.namespaceURI,'line');for(const [k,v] of Object.entries({x1,y1,x2,y2,stroke:'#328aff','stroke-opacity':'.65','stroke-width':10}))line.setAttribute(k,v);svg.append(line)}if(selectedSquare){const [x,y]=pt(selectedSquare),rect=document.createElementNS(svg.namespaceURI,'rect');for(const [k,v] of Object.entries({x:x-50,y:y-50,width:100,height:100,fill:'#f4c64c','fill-opacity':'.28'}))rect.setAttribute(k,v);svg.append(rect)}board.style.position='relative';board.append(svg);
}
let rightSquare=null,prepWorker=null,prepBest=null,prepLines=new Map();
function prepSquareAt(e){const rect=board.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/rect.width*8),y=Math.floor((e.clientY-rect.top)/rect.height*8);return x>=0&&x<8&&y>=0&&y<8?String.fromCharCode(97+x)+(8-y):null}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('pointerdown',e=>{if(e.button===2){rightSquare=prepSquareAt(e);e.preventDefault()}});
board.addEventListener('pointerup',e=>{if(e.button!==2||!rightSquare)return;const to=prepSquareAt(e),from=rightSquare;rightSquare=null;if(!to)return;if(to===from){if(blueSquares.has(to))blueSquares.delete(to);else blueSquares.add(to)}else{const idx=manualArrows.findIndex(a=>a[0]===from&&a[1]===to);if(idx>=0)manualArrows.splice(idx,1);else manualArrows.push([from,to])}drawCandidateArrows(candidateMoves)});
const engineSwitch=$('prep-engine'),engineLines=$('prep-engine-lines'),engineCount=$('prep-engine-count'),engineDepth=$('prep-depth');
function stopPrepEngine(){if(prepWorker){prepWorker.terminate();prepWorker=null}prepLines.clear();engineLines.replaceChildren();$('prep-eval-fill').style.height='50%';$('prep-eval-label').textContent='0.00'}
function analyzePrep(){stopPrepEngine();if(!engineSwitch.checked)return;const pos=new Chess();for(const m of path)pos.move(m);const worker=new Worker('/vendor/stockfish/stockfish-19-lite-single.js');prepWorker=worker;let initialized=false;worker.onmessage=e=>{if(prepWorker!==worker)return;for(const line of String(e.data).split(/\r?\n/)){if(line==='uciok'){worker.postMessage('setoption name MultiPV value '+engineCount.value);worker.postMessage('isready')}else if(line==='readyok'&&!initialized){initialized=true;worker.postMessage('position fen '+pos.fen());worker.postMessage('go depth '+engineDepth.value)}else if(line.startsWith('info ')&&line.includes(' score ')&&line.includes(' pv ')){const n=Number(line.match(/\bmultipv (\d+)/)?.[1]||1),score=line.match(/\bscore (cp|mate) (-?\d+)/),pv=line.match(/\bpv (.+)$/);if(!score||!pv)return;const cp=score[1]==='mate'?(Number(score[2])>0?1000:-1000):Number(score[2]);const white=cp*(pos.turn()==='w'?1:-1);prepLines.set(n,{white,pv:pv[1]});engineLines.replaceChildren();for(let i=1;i<=Number(engineCount.value);i++){const item=prepLines.get(i),row=document.createElement('div');row.className='prep-engine-line';row.textContent=item?i+'. '+(item.white/100).toFixed(2)+'  '+item.pv:'Analyzing…';engineLines.append(row)}const best=prepLines.get(1);if(best){$('prep-eval-fill').style.height=Math.max(4,Math.min(96,50+best.white/20))+'%';$('prep-eval-label').textContent=(best.white/100).toFixed(2)}}}};worker.postMessage('uci')}
engineSwitch.onchange=analyzePrep;engineCount.onchange=analyzePrep;engineDepth.onchange=analyzePrep;
function parsePgn(text){const game=new Chess();try{game.loadPgn(text);return game.history()}catch{return null}}
function outcome(pgn,user){const m=pgn.match(/\[White\s+"([^"]+)"\]/i),n=pgn.match(/\[Black\s+"([^"]+)"\]/i),result=pgn.match(/\[Result\s+"([^"]+)"\]/);const white=m?.[1]?.toLowerCase()===user,black=n?.[1]?.toLowerCase()===user;if(!(white||black))return null;const res=result?.[1];return res==='1/2-1/2'?'draw':res==='1-0'?(white?'win':'loss'):res==='0-1'?(black?'win':'loss'):'unknown'}
function filtered(){return games.filter(g=>path.every((m,i)=>g.moves[i]===m))}
function render(){
 renderBoard();const subset=filtered(),counts=new Map();
 for(const g of subset){const move=g.moves[path.length];if(!move)continue;const x=counts.get(move)||{move,total:0,win:0,draw:0,loss:0,last:0};x.total++;if(['win','draw','loss'].includes(g.outcome))x[g.outcome]++;x.last=Math.max(x.last,g.end);counts.set(move,x)}
 $('game-count').textContent=subset.length+' matching games';
 const options=[...counts.values()].sort((a,b)=>b.total-a.total);
 drawCandidateArrows(options);analyzePrep();
 const list=$('moves');list.replaceChildren();
 for(const x of options.slice(0,30)){
  const row=document.createElement('div');row.className='move-option';
  const btn=document.createElement('button');btn.textContent=x.move+' · '+x.total+' games ('+(100*x.total/subset.length).toFixed(1)+'%)';
  btn.onclick=()=>{path.push(x.move);render()};row.append(btn);
  const known=x.win+x.draw+x.loss;
  const bar=document.createElement('div');bar.setAttribute('aria-label','Opponent results: '+x.win+' wins, '+x.draw+' draws, '+x.loss+' losses');
  bar.style.cssText='display:flex;height:28px;width:100%;overflow:hidden;border-radius:5px;background:#52677b';
  for(const [count,shade] of [[x.win,'#27865d'],[x.draw,'#aab4bd'],[x.loss,'#c44d55']]){
   if(!count||!known)continue;
   const part=document.createElement('span');part.style.cssText='width:'+(100*count/known)+'%;background:'+shade+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px';
   if(count/known>=.17)part.textContent=(100*count/known).toFixed(0)+'%';
   bar.append(part);
  }
  row.append(bar);list.append(row);
 }
 if(!counts.size)list.textContent='No further moves in this sample.';
 const candidate=options.filter(x=>x.total>=5).sort((a,b)=>b.loss/b.total-a.loss/a.total)[0];
 $('weakness').textContent=candidate?'Potential weakness: '+[...path,candidate.move].join(' ')+' · '+candidate.total+' games · '+(100*candidate.loss/candidate.total).toFixed(0)+'% opponent losses. Small samples can be misleading.':'Not enough games for a reliable comparison.';
 $('recommendations').textContent=candidate?'Consider exploring '+[...path,candidate.move].join(' ')+'. Opponent lost '+candidate.loss+' of '+candidate.total+' games after this move. Verify that this line is suitable for your side before choosing it.':'No statistically supported recommendation at this position.';
 $('head-to-head').textContent='Opponent games loaded: '+games.length+'. Head-to-head comparison is not yet available.';
}
$('back').onclick=()=>{path.pop();render()};$('reset').onclick=()=>{path=[];render()};
$('fetch').onclick=async()=>{if(loading)return;const user=opponent.value.trim();if(!/^[a-zA-Z0-9_-]{2,25}$/.test(user)){status('Enter a valid Chess.com username.');return}const types=new Set([...document.querySelectorAll('input[name=tc]:checked')].map(x=>x.value));if(!types.size){status('Select at least one time control.');return}const from=$('from').value,to=$('to').value;if($('period').value==='custom'&&from&&to&&from>to){status('Start date must be before end date.');return}color=$('my-color').value==='white'?'b':'w';loading=true;$('fetch').disabled=true;games=[];path=[];try{status('Loading archive list…');const base='https://api.chess.com/pub/player/'+encodeURIComponent(user.toLowerCase());const res=await fetch(base+'/games/archives');if(!res.ok)throw Error('Could not load archives ('+res.status+').');const archives=(await res.json()).archives||[];let scanned=0;for(const url of archives.slice().reverse()){const month=url.match(/(\d{4})\/(\d{2})$/);if(month&&$('period').value==='custom'){const ym=month[1]+'-'+month[2];if(from&&ym<from.slice(0,7))continue;if(to&&ym>to.slice(0,7))continue}status('Reading month '+(++scanned)+' of '+archives.length+' · '+games.length+' games');const response=await fetch(url);if(!response.ok)continue;const payload=await response.json();for(const g of payload.games||[]){if(!types.has(g.time_class)||g.rules&&g.rules!=='chess')continue;if(g[color==='w'?'white':'black']?.username?.toLowerCase()!==user.toLowerCase())continue;const d=new Date((g.end_time||0)*1000).toISOString().slice(0,10);if($('period').value==='custom'&&((from&&d<from)||(to&&d>to)))continue;const moves=parsePgn(g.pgn||'');if(!moves)continue;games.push({moves,outcome:outcome(g.pgn||'',user.toLowerCase()),end:g.end_time||0})}if(games.length>=5000)break}status('Loaded '+games.length+' games. Results are from the opponent’s perspective.');render()}catch(e){status(e.message+' Check your connection or Chess.com API access.')}finally{loading=false;$('fetch').disabled=false}};
render();
