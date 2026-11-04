import {fetchOpeningStats} from './opening-stats-client.js?v=4';
// EloScanner analysis database switch; actual move statistics from Lichess.
export function createOpeningIntegration({Chess,getState,onMove}){
 const label=document.createElement('label');label.className='elo-db-toggle';label.title='Toggle game database';
 const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('role','switch');checkbox.setAttribute('aria-label','Database');
 const caption=document.createElement('span');caption.textContent='Database';label.append(checkbox,caption);
 const panel=document.createElement('section');panel.id='elo-db-panel';panel.className='elo-db-panel';panel.hidden=true;panel.setAttribute('aria-live','polite');
 const title=document.createElement('div');title.className='elo-db-title';title.textContent='Database';
 const info=document.createElement('p');info.className='elo-db-info';info.textContent='Loading opening statistics…';
 const moves=document.createElement('div');moves.className='elo-db-moves';
 panel.append(title,info,moves);
 let requestIndex=0,controller=null,lastFen='';
 const notation=document.getElementById('notation-moves');
 const heading=document.getElementById('opening-name');
 const header=document.querySelector('#live-notation .analysis-engine-header');
 const stockfishLabel=header?.querySelector('.switch-label');
 if(stockfishLabel)stockfishLabel.insertAdjacentElement('afterend',label);
 else header?.append(label);
 notation?.insertAdjacentElement('afterend',panel);
 const format=n=>Intl.NumberFormat('en-US',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n);
 function toggle(){
  panel.hidden=!checkbox.checked;if(notation)notation.hidden=checkbox.checked;
  lastFen='';update();
 }
 checkbox.addEventListener('change',toggle);
 function update(){
  const {fen,san}=getState();
  const name=heading?.textContent||'';
  if(heading){
   const a=document.createElement('a');a.href='/opening-explorer.html?moves='+encodeURIComponent(san.join(' '));
   a.className='elo-opening-link';a.textContent=name;a.title='Explore this opening and its variations';
   heading.replaceChildren(a);
  }
  if(!checkbox.checked)return;
  if(fen===lastFen)return;
  lastFen=fen;const token=++requestIndex;
  controller?.abort();controller=new AbortController();
  info.textContent='Loading database statistics…';moves.replaceChildren();
  fetchOpeningStats(fen,{signal:controller.signal})
   .then(data=>{
    if(token!==requestIndex||!checkbox.checked)return;
    const sum=(data.white||0)+(data.draws||0)+(data.black||0);
    info.textContent=sum?format(sum)+' games in this position · W '+(100*data.white/sum).toFixed(1)+'% · D '+(100*data.draws/sum).toFixed(1)+'% · B '+(100*data.black/sum).toFixed(1)+'%':'No games found for this position in the selected Lichess explorer pool.';
    if(data.opening?.name){const b=document.createElement('a');b.className='elo-db-opening';b.textContent=data.opening.name;b.href='/opening-explorer.html?moves='+encodeURIComponent(san.join(' '));moves.append(b)}
    for(const move of data.moves||[]){
     const total=move.white+move.draws+move.black;
     const b=document.createElement('button');b.type='button';b.className='elo-db-row';
     const notation=document.createElement('strong');notation.textContent=move.san;
     const count=document.createElement('span');count.textContent=format(total)+' games';
     const bar=document.createElement('span');bar.className='elo-db-bar';
     for(const [cls,n] of [['white',move.white],['draws',move.draws],['black',move.black]]){const seg=document.createElement('i');seg.className=cls;seg.style.width=(total?100*n/total:0)+'%';bar.append(seg)}
     const pct=document.createElement('small');pct.textContent=total?'W '+(100*move.white/total).toFixed(0)+'% · D '+(100*move.draws/total).toFixed(0)+'% · B '+(100*move.black/total).toFixed(0)+'%':'—';
     b.append(notation,count,bar,pct);b.onclick=()=>onMove(move.san);
     moves.append(b);
    }
   }).catch(e=>{if(token===requestIndex&&e.name!=='AbortError')info.textContent=e.message});
 }
 return {update};
}
