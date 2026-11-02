/* Additional public-game insights for the existing homepage report. */
(()=>{
const form=document.getElementById('searchForm'),input=document.getElementById('username'),target=document.getElementById('insights-embedded');
if(!form||!input||!target)return;
const draws=new Set(['agreed','repetition','stalemate','insufficient','50move','timevsinsufficient']);
let generation=0;
const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
function classify(g,user){
 if(g.rules!=='chess')return null;
 const w=g.white?.username?.toLowerCase()===user,b=g.black?.username?.toLowerCase()===user;
 if(!w&&!b)return null;
 const own=w?g.white:g.black,opp=w?g.black:g.white;
 const result=own.result==='win'?'win':draws.has(own.result)?'draw':opp.result==='win'?'loss':null;
 if(!result)return null;
 return {result,color:w?'White':'Black',tc:g.time_class||'other',date:g.end_time||0,rating:Number(own.rating)||null};
}
function summary(items){
 const wins=items.filter(g=>g.result==='win').length,draw=items.filter(g=>g.result==='draw').length,loss=items.length-wins-draw;
 return items.length+' games · '+wins+' wins · '+draw+' draws · '+loss+' losses'+(items.length?' · '+(100*(wins+draw/2)/items.length).toFixed(1)+'% score':'');
}
function render(user,games,months,failed){
 target.replaceChildren();
 const top=node('p','insights-intro','Public Chess.com game statistics for @'+user+' · latest '+months+' archive months'+(failed?' · '+failed+' months unavailable':'')+'.');
 target.append(top);
 if(!games.length){target.append(node('p','insights-intro','No standard chess games were found in the available archives.'));return}
 const grid=node('div','homepage-insights-grid');target.append(grid);
 const sections=[
 ['Overall performance',[['All games',games]]],
 ['Time controls',['bullet','blitz','rapid','daily'].map(tc=>[tc[0].toUpperCase()+tc.slice(1),games.filter(g=>g.tc===tc)])],
 ['Playing color',[['White',games.filter(g=>g.color==='White')],['Black',games.filter(g=>g.color==='Black')]]],
 ['Recent form',[['Last 10',games.slice(0,10)],['Last 20',games.slice(0,20)],['Last 50',games.slice(0,50)]]]
 ];
 for(const [heading,rows] of sections){
  const card=node('article','homepage-insight-card');card.append(node('h3','',heading));
  for(const [label,items] of rows){const row=node('p','');row.append(node('strong','',label+': '),document.createTextNode(summary(items)));card.append(row)}
  grid.append(card);
 }
 target.append(node('p','insights-intro','Results describe recorded public games; they are not engine accuracy measurements or Fair Play evidence.'));
}
async function load(user){
 const current=++generation;
 target.replaceChildren(node('p','insights-intro','Loading additional Chess Insights for @'+user+'…'));
 try{
  const res=await fetch('https://api.chess.com/pub/player/'+encodeURIComponent(user)+'/games/archives');
  if(!res.ok)throw Error('Chess.com returned '+res.status);
  const urls=((await res.json()).archives||[]).slice(-24);
  const games=[];let failed=0;
  // Limit concurrent requests to avoid excessive traffic and keep the main report responsive.
  for(let i=0;i<urls.length;i+=4){
   const batch=await Promise.all(urls.slice(i,i+4).map(async url=>{
    try{const r=await fetch(url);if(!r.ok)throw Error(String(r.status));return (await r.json()).games||[]}
    catch{return null}
   }));
   if(current!==generation)return;
   for(const items of batch){if(!items){failed++;continue}for(const g of items){const item=classify(g,user);if(item)games.push(item)}}
  }
  if(current!==generation)return;
  games.sort((a,b)=>b.date-a.date);render(user,games,urls.length,failed);
 }catch(e){if(current===generation)target.replaceChildren(node('p','insights-intro','Additional insights unavailable: '+e.message+'. The main player review is unaffected.'))}
}
form.addEventListener('submit',()=>{const user=input.value.trim().toLowerCase();if(/^[a-z0-9_-]{3,25}$/.test(user))load(user)});
document.querySelectorAll('.sample-button').forEach(button=>button.addEventListener('click',()=>{const user=(button.dataset.username||'').toLowerCase();if(user)load(user)}));
const saved=new URLSearchParams(location.search).get('review');
if(saved&&/^[a-z0-9_-]{3,25}$/i.test(saved))load(saved.toLowerCase());
})();
