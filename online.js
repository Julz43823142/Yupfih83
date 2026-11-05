import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
const $=id=>document.getElementById(id),api='/api/online/',squares=new Map();
let id='',secret='',side='w',state=null,selected=null,game=new Chess(),busy=false;
const fmt=n=>{n=Math.max(0,Math.ceil(n/1000));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const name=()=>{const value=$('online-name').value.trim()||'Anonymous';if(!/^[a-zA-Z0-9_ ]{1,24}$/.test(value)||/^(admin|moderator|eloscanner|staff)$/i.test(value))throw Error('Please choose an appropriate nickname.');return value};
async function post(route,body){const r=await fetch(api+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function persist(){sessionStorage.setItem('elo-online-game',JSON.stringify({id,secret}))}
function enter(){ $('online-setup').hidden=true;$('online-game').hidden=false;persist();poll()}
function setupError(e){$('online-setup-status').textContent=e.message||String(e)}
$('online-random').onclick=async()=>{try{const r=await post('create',{kind:'random',name:name()});id=r.id;secret=r.secret;enter()}catch(e){setupError(e)}};
$('online-invite').onclick=async()=>{try{const r=await post('create',{kind:'invite',name:name()});id=r.id;secret=r.secret;enter();$('online-share').hidden=false;$('online-link').value=location.origin+'/online.html?invite='+id}catch(e){setupError(e)}};
$('online-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('online-link').value);$('online-copy').textContent='Copied!'}catch{$('online-link').select()}};
$('online-resign').onclick=async()=>{if(!confirm('Resign this game?'))return;try{await post('resign',{id,secret});poll()}catch(e){$('online-status').textContent=e.message}};
for(let r=0;r<8;r++)for(let c=0;c<8;c++){const sq=String.fromCharCode(97+c)+(8-r),b=document.createElement('button');b.type='button';b.className=(r+c)%2?'dark':'light';b.dataset.sq=sq;b.setAttribute('aria-label',sq);b.onclick=()=>choose(sq);squares.set(sq,b);$('online-board').append(b)}
function render(){if(!state)return;game=new Chess(state.fen);$('online-board').dataset.side=side;
 for(const [sq,b] of squares){const pc=game.get(sq),idx=(8-Number(sq[1]))*8+sq.charCodeAt(0)-97;b.style.order=side==='w'?idx:63-idx;b.replaceChildren();b.classList.toggle('selected',selected===sq);b.classList.toggle('legal',!!selected&&game.turn()===side&&game.moves({square:selected,verbose:true}).some(m=>m.to===sq));if(pc){const img=document.createElement('img');img.src='/vendor/pieces/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';img.alt=pc.color+' '+pc.type;b.append(img)}}
 $('online-top-name').textContent=(side==='w'?state.black:state.white)||'Waiting for opponent…';$('online-bottom-name').textContent=(side==='w'?state.white:state.black)||'You';
 $('online-moves').textContent=state.moves.map((m,i)=>(i%2===0?Math.floor(i/2)+1+'. ':'')+m).join(' ');
 $('online-resign').hidden=state.status!=='active';
 $('online-status').textContent=state.status==='waiting'?'Waiting for another player…':state.status==='finished'?'Game over · '+(state.result||'Finished'):game.turn()===side?'Your move':'Opponent to move';
 clocks();
}
function clocks(){if(!state)return;const elapsed=state.status==='active'?Math.max(0,Date.now()-state.lastMoveAt):0;const w=Math.max(0,state.whiteMs-(state.turn==='w'?elapsed:0)),b=Math.max(0,state.blackMs-(state.turn==='b'?elapsed:0));$('online-top-clock').textContent=fmt(side==='w'?b:w);$('online-bottom-clock').textContent=fmt(side==='w'?w:b)}
async function choose(sq){if(busy||!state||state.status!=='active'||state.turn!==side)return;const pc=game.get(sq);if(selected){const from=selected;selected=null;const legal=game.moves({square:from,verbose:true}).filter(m=>m.to===sq);if(legal.length){let promotion='q';if(legal.some(m=>m.promotion)){const p=prompt('Promote to q, r, b or n','q');if(p===null){render();return}promotion=['q','r','b','n'].includes(p.toLowerCase())?p.toLowerCase():'q'}busy=true;try{await post('move',{id,secret,from,to:sq,promotion});await poll()}catch(e){$('online-status').textContent=e.message}finally{busy=false}return}}
 if(pc?.color===side)selected=sq;render()}
async function poll(){if(!id||!secret)return;try{const r=await fetch(api+'state?id='+encodeURIComponent(id)+'&secret='+encodeURIComponent(secret),{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Game unavailable');state=j;side=j.side;render()}catch(e){$('online-status').textContent=e.message}}
const invitation=new URL(location.href).searchParams.get('invite');if(invitation&&/^[a-f0-9]{32}$/.test(invitation)){ $('online-setup').querySelector('h2').textContent='Join a Friend · 3+0 Unrated';$('online-random').hidden=true;$('online-invite').textContent='Join game';$('online-invite').onclick=async()=>{try{const r=await post('join',{id:invitation,name:name()});id=r.id;secret=r.secret;enter()}catch(e){setupError(e)}}}
else{if(new URL(location.href).searchParams.has('friend')){$('online-setup').querySelector('h2').textContent='Play a Friend · 3+0 Unrated';$('online-random').hidden=true;}try{const previous=JSON.parse(sessionStorage.getItem('elo-online-game')||'null');if(previous&&/^[a-f0-9]{32}$/.test(previous.id)&&/^[a-f0-9]{32}$/.test(previous.secret)){id=previous.id;secret=previous.secret;enter()}}catch{}}
setInterval(()=>{if(id)poll()},1500);setInterval(clocks,250);
