import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
const $=id=>document.getElementById(id),api='/api/online/',squares=new Map();
let id='',secret='',side='w',state=null,selected=null,selectedMoves=[],game=new Chess(),busy=false,serverOffset=0;
let liveSocket=null,liveConnected=false,liveRetryAt=0,previewBoard=null;
let liveFailures=0,lastSocketMessageAt=0,pingNonce=0,pingStartedAt=0,networkRttMs=null,networkRttAt=0,liveRetryTimer=null;
const fmt=n=>{n=Math.max(0,Math.ceil(n/1000));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const name=()=>{const value=$('online-name').value.trim()||'Anonymous';if(!/^[a-zA-Z0-9_ ]{1,24}$/.test(value)||/^(admin|moderator|eloscanner|staff)$/i.test(value))throw Error('Please choose an appropriate nickname.');return value};
async function post(route,body){const r=await fetch(api+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function persist(){sessionStorage.setItem('elo-online-game',JSON.stringify({id,secret}))}
function enter(){ $('online-setup').hidden=true;$('online-game').hidden=false;persist();history.replaceState(null,'','/online.html');connectLive();poll()}
function setupError(e){$('online-setup-status').textContent=e.message||String(e)}
$('online-random').onclick=async()=>{try{const r=await post('create',{kind:'random',name:name()});id=r.id;secret=r.secret;enter()}catch(e){setupError(e)}};
$('online-invite').onclick=async()=>{try{const r=await post('create',{kind:'invite',name:name()});id=r.id;secret=r.secret;enter();$('online-share').hidden=false;$('online-link').value=location.origin+'/online.html?invite='+id}catch(e){setupError(e)}};
$('online-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('online-link').value);$('online-copy').textContent='Copied!'}catch{$('online-link').select()}};
$('online-resign').onclick=async()=>{if(!confirm('Resign this game?'))return;try{await post('resign',{id,secret});poll()}catch(e){$('online-status').textContent=e.message}};
for(let r=0;r<8;r++)for(let c=0;c<8;c++){const sq=String.fromCharCode(97+c)+(8-r),b=document.createElement('button');b.type='button';b.className=(r+c)%2?'dark':'light';b.dataset.sq=sq;b.setAttribute('aria-label',sq);b.onclick=()=>choose(sq);squares.set(sq,b);$('online-board').append(b)}
// Cache piece identity by square. During a normal move only the source and
// destination need DOM updates, not all 64 images and their layout state.
const painted=new Map();
let paintedSide=null,lastHighlights=new Set(),boardFen=null,paintedSelected=null;
function paintSquare(sq){
 const button=squares.get(sq),pc=game.get(sq),piece=pc?pc.color+pc.type:'';
 if(painted.get(sq)===piece)return;
 painted.set(sq,piece);
 button.replaceChildren();
 if(pc){
  const image=document.createElement('img');
  image.src='/vendor/pieces/cburnett/'+pc.color+pc.type.toUpperCase()+'.svg';
  image.alt=pc.color+' '+pc.type;
  button.append(image);
 }
}
function paintSelection(){
 if(paintedSelected&&paintedSelected!==selected)squares.get(paintedSelected).classList.remove('selected');
 if(selected)squares.get(selected).classList.add('selected');
 paintedSelected=selected;
 const legal=new Set(selectedMoves.map(m=>m.to));
 for(const sq of lastHighlights)if(!legal.has(sq))squares.get(sq).classList.remove('legal');
 for(const sq of legal)if(!lastHighlights.has(sq))squares.get(sq).classList.add('legal');
 lastHighlights=legal;
}
function previewMove(from,to,move){
 // Paint only altered squares; castling and en passant affect additional squares.
 const changed=new Set([from,to]);
 if(move.flags.includes('e'))changed.add(to[0]+from[1]);
 if(move.flags.includes('k')){changed.add('h'+from[1]);changed.add('f'+from[1])}
 if(move.flags.includes('q')){changed.add('a'+from[1]);changed.add('d'+from[1])}
 for(const sq of changed)paintSquare(sq);
 for(const sq of lastHighlights)squares.get(sq).classList.remove('legal');
 lastHighlights.clear();
 squares.get(from).classList.remove('selected');paintedSelected=null;
 $('online-status').textContent='Sending move…';
}
function render(){if(!state)return;
 if(previewBoard)game=previewBoard;
 else if(boardFen!==state.fen){game=new Chess(state.fen);boardFen=state.fen}
 const rotated=paintedSide!==side;
 if(rotated){$('online-board').dataset.side=side;paintedSide=side}
 const legal=new Set(selected&&game.turn()===side?selectedMoves.map(m=>m.to):[]);
 for(const [sq,b] of squares){
  if(rotated){const idx=(8-Number(sq[1]))*8+sq.charCodeAt(0)-97;b.style.order=side==='w'?idx:63-idx}
  paintSquare(sq);
  b.classList.toggle('selected',selected===sq);
  b.classList.toggle('legal',legal.has(sq));
 }
 lastHighlights=legal;paintedSelected=selected;
 $('online-top-name').textContent=(side==='w'?state.black:state.white)||'Waiting for opponent…';$('online-bottom-name').textContent=(side==='w'?state.white:state.black)||'You';
 $('online-moves').textContent=state.moves.map((m,i)=>(i%2===0?Math.floor(i/2)+1+'. ':'')+m).join(' ');
 $('online-resign').hidden=state.status!=='active';
 $('online-status').textContent=previewBoard?'Sending move…':state.status==='waiting'?'Waiting for another player…':state.status==='finished'?'Game over · '+(state.result||'Finished'):game.turn()===side?'Your move':'Opponent to move';
 clocks();
}
function clocks(){if(!state)return;const elapsed=state.status==='active'?Math.max(0,Date.now()+serverOffset-state.lastMoveAt):0;const w=Math.max(0,state.whiteMs-(state.turn==='w'?elapsed:0)),b=Math.max(0,state.blackMs-(state.turn==='b'?elapsed:0));const top=fmt(side==='w'?b:w),bottom=fmt(side==='w'?w:b);if($('online-top-clock').textContent!==top)$('online-top-clock').textContent=top;if($('online-bottom-clock').textContent!==bottom)$('online-bottom-clock').textContent=bottom}
async function choose(sq){if(busy||!state||state.status!=='active'||state.turn!==side)return;const pc=game.get(sq);if(selected){const from=selected;selected=null;const legal=selectedMoves.filter(m=>m.to===sq);selectedMoves=[];if(legal.length){let promotion='q';if(legal.some(m=>m.promotion)){const p=prompt('Promote to q, r, b or n','q');if(p===null){render();return}promotion=['q','r','b','n'].includes(p.toLowerCase())?p.toLowerCase():'q'}// Optimistic *display only*: the server remains authoritative.
  // Do not advance clocks, game state, results, or permit another move
  // until the server confirms this position.
  busy=true;
  try{
   const move=game.move({from,to:sq,promotion});
   // Invalidate the confirmed-position cache until server acknowledgement.
   // Rejections must reconstruct the original board, not reuse a preview.
   boardFen=null;
   previewBoard=game;
   previewMove(from,sq,move);
   const rttFresh=liveConnected&&performance.now()-networkRttAt<30000;
   const committed=await post('move',{id,secret,from,to:sq,promotion,...(rttFresh?{networkRttMs:Math.round(networkRttMs)}:{})});
   previewBoard=null;
   // Server acknowledgement reuses the speculative position if it matches.
   // A mismatched authoritative FEN is still rebuilt and wins.
   if(committed.id===id&&committed.fen){
    if(game.fen()===committed.fen)boardFen=committed.fen;
    state=committed;side=committed.side;serverOffset=committed.serverTime-Date.now();render()
   }else await poll();
  }catch(e){
   previewBoard=null;render();$('online-status').textContent=e.message
  }finally{busy=false}
  return}}
 if(pc?.color===side){selected=sq;selectedMoves=game.moves({square:sq,verbose:true})}paintSelection()}
// Repeated state polls must not reconstruct the chess board or touch 64
// squares when nothing relevant changed. Server timestamps still resync clocks.
function acceptState(next){
 if(!next||next.id!==id||!Array.isArray(next.moves)||typeof next.fen!=='string')return;
 if(state?.id===next.id&&((Array.isArray(state.moves)&&next.moves.length<state.moves.length)||(state.status==='finished'&&next.status!=='finished')||(state.status==='active'&&next.status==='waiting')))return;
 if(busy&&previewBoard){
  // Don't let an in-flight stale poll erase the local pending move.
  if(next.fen===state?.fen)return;
 }
 const previous=state;
 const changed=!previous||previous.id!==next.id||previous.fen!==next.fen||previous.status!==next.status||previous.result!==next.result||previous.white!==next.white||previous.black!==next.black||previous.whiteMs!==next.whiteMs||previous.blackMs!==next.blackMs||previous.lastMoveAt!==next.lastMoveAt||previous.moves.length!==next.moves.length;
 if(previous?.fen!==next.fen){selected=null;selectedMoves=[]}
 state=next;serverOffset=next.serverTime-Date.now();
 if(changed)render();else clocks();
}
let polling=false;async function poll(){if(!id||!secret||polling)return;polling=true;try{const j=await post('state',{id,secret});side=j.side;acceptState(j)}catch(e){$('online-status').textContent=e.message}finally{polling=false}}
const urlParams=new URL(location.href).searchParams;
const invitation=urlParams.get('invite');const reviewId=urlParams.get('review');if(reviewId&&/^[a-f0-9]{32}$/.test(reviewId)){initializeReplay(reviewId)}
else if(invitation&&/^[a-f0-9]{32}$/.test(invitation)){ $('online-setup').querySelector('h2').textContent='Join a Friend · 3+0 Unrated';$('online-random').hidden=true;$('online-invite').textContent='Join game';$('online-invite').onclick=async()=>{try{const r=await post('join',{id:invitation,name:name()});id=r.id;secret=r.secret;enter()}catch(e){setupError(e)}}}
else{if(new URL(location.href).searchParams.has('friend')){$('online-setup').querySelector('h2').textContent='Play a Friend · 3+0 Unrated';$('online-random').hidden=true;}try{const previous=JSON.parse(sessionStorage.getItem('elo-online-game')||'null');if(!urlParams.has('friend')&&!urlParams.has('challenge')&&!urlParams.has('review')&&previous&&/^[a-f0-9]{32}$/.test(previous.id)&&/^[a-f0-9]{32}$/.test(previous.secret)){id=previous.id;secret=previous.secret;enter()}}catch{}}
// A websocket is read-only. Every move still goes through the authorized HTTPS
// endpoint; the room only publishes server-confirmed board states.
function scheduleLiveRetry(){
 liveFailures=Math.min(liveFailures+1,5);
 const delay=Math.min(15000,1000*2**(liveFailures-1));
 liveRetryAt=Date.now()+delay;
 if(liveRetryTimer!==null)clearTimeout(liveRetryTimer);
 liveRetryTimer=setTimeout(()=>{
  liveRetryTimer=null;
  if(document.visibilityState==='visible')connectLive();
 },delay+25);
}
function connectLive(){
 if(!id||!secret||liveSocket||Date.now()<liveRetryAt)return;
 const origin=new URL(location.href);
 origin.protocol=origin.protocol==='https:'?'wss:':'ws:';
 origin.pathname='/api/online/live';
 origin.search='?id='+encodeURIComponent(id);
 try{
  const socket=new WebSocket(origin.href,['elo-chess-v1','elo-seat-'+secret]);
  liveSocket=socket;
  socket.onopen=()=>{
   liveConnected=true;liveFailures=0;liveRetryAt=0;
   if(liveRetryTimer!==null){clearTimeout(liveRetryTimer);liveRetryTimer=null}
   lastSocketMessageAt=performance.now();networkRttMs=null;networkRttAt=0;pingStartedAt=0;
   sendSocketPing();poll();
  };
  socket.onmessage=event=>{
   if(typeof event.data!=='string'||event.data.length>8192)return;
   try{
    const packet=JSON.parse(event.data);
    if(packet.type==='pong'&&packet.nonce===pingNonce&&pingStartedAt){
     const now=performance.now(),sample=now-pingStartedAt;
     if(sample>=0&&sample<=2000){
      networkRttMs=networkRttMs===null?sample:networkRttMs*0.65+sample*0.35;
      networkRttAt=now;
     }
     lastSocketMessageAt=now;pingStartedAt=0;return;
    }
    const next=packet.game;
    if(packet.type!=='state'||!next||next.id!==id||!Array.isArray(next.moves)||typeof next.fen!=='string')return;
    lastSocketMessageAt=performance.now();
    acceptState({...next,side});
   }catch{}
  };
  socket.onerror=()=>{};
  socket.onclose=()=>{
   if(liveSocket===socket){
    liveSocket=null;liveConnected=false;networkRttMs=null;networkRttAt=0;
    scheduleLiveRetry();
    poll();
   }
  };
 }catch{scheduleLiveRetry()}
}
function sendSocketPing(){
 if(!liveSocket||liveSocket.readyState!==WebSocket.OPEN||pingStartedAt)return;
 pingNonce=(pingNonce+1)%2147483647;
 pingStartedAt=performance.now();
 try{liveSocket.send(JSON.stringify({type:'ping',nonce:pingNonce}))}catch{pingStartedAt=0}
}
// Detect silent half-open sockets; a reconnect starts with a fresh
// authoritative state read. Hidden tabs resume checking on visibility.
setInterval(()=>{
 if(!id||!liveSocket||liveSocket.readyState!==WebSocket.OPEN)return;
 const now=performance.now();
 if(document.visibilityState==='hidden')return;
 if(now-lastSocketMessageAt>30000){
  liveSocket.close(4000,'Heartbeat timeout');return;
 }
 if(pingStartedAt&&now-pingStartedAt>12000){
  liveSocket.close(4000,'Ping timeout');return;
 }
 sendSocketPing();
},8000);
// Poll more frequently only during an active game. Keep the D1 request budget
// below the per-IP rate limit even when two players share the same connection.
async function pollLoop(){
 if(id&&document.visibilityState==='visible'){connectLive();await poll()}
 const delay=document.visibilityState==='hidden'?5000:!id?1500:liveConnected?10000:state?.status==='active'?900:state?.status==='waiting'?1500:5000;
 setTimeout(pollLoop,delay);
}
setTimeout(pollLoop,900);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&id){
  // Background tabs may lose their socket without receiving a close event.
  if(liveSocket&&liveSocket.readyState===WebSocket.OPEN&&performance.now()-lastSocketMessageAt>30000)
   liveSocket.close(4000,'Resume reconnect');
  connectLive();poll();
 }
});
setInterval(clocks,250);

async function socialPost(route,data){const r=await fetch('/api/social/'+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(v.error||'Request failed');return v}
async function socialRefresh(){try{
 const [friends,inbox]=await Promise.all([fetch('/api/social/friends',{cache:'no-store'}).then(r=>r.json()),fetch('/api/social/inbox',{cache:'no-store'}).then(r=>r.json())]);
 if(friends.authenticated){$('online-account').textContent='Your friends';}
 const list=$('online-friends');list.replaceChildren();
 for(const f of friends.friends||[]){const p=document.createElement('p'),a=document.createElement('a');a.href='/profile/'+encodeURIComponent(f.username);a.textContent=(f.online?'● ':'○ ')+f.username;p.append(a,' ');const b=document.createElement('button');b.textContent='Challenge';b.onclick=()=>challenge(f.username);p.append(b);list.append(p)}
 const box=$('online-inbox');box.replaceChildren();for(const req of friends.requests||[]){const p=document.createElement('p');p.textContent='Friend request from '+req.fromUser+' ';for(const action of ['accept','decline']){const button=document.createElement('button');button.textContent=action==='accept'?'Accept':'Decline';button.onclick=async()=>{try{await socialPost('friend-respond',{id:req.id,action});socialRefresh()}catch(e){$('online-account').textContent=e.message}};p.append(button)}box.append(p)}
 for(const v of inbox.challenges||[]){const p=document.createElement('p'),a=document.createElement('a');a.href='/online.html?invite='+encodeURIComponent(v.gameId);a.textContent='Accept challenge from '+v.fromUser;p.append(a);box.append(p)}
}catch{}}
async function challenge(username){try{const game=await post('create',{kind:'invite',name:name(),targetUsername:username});await socialPost('challenge',{username,gameId:game.id,gameSecret:game.secret});id=game.id;secret=game.secret;enter();$('online-status').textContent='Challenge sent to '+username}catch(e){setupError(e)}}
const direct=new URL(location.href).searchParams.get('challenge');if(direct&&/^[A-Za-z0-9_]{3,24}$/.test(direct)){$('online-random').hidden=true;$('online-invite').textContent='Challenge '+direct;$('online-invite').onclick=()=>challenge(direct)}
socialRefresh();setInterval(socialRefresh,30000);

async function initializeReplay(gameId){
 $('online-setup').hidden=true;$('online-social').hidden=true;$('online-game').hidden=false;$('online-resign').hidden=true;
 const msg=$('online-status');msg.textContent='Loading completed game…';
 try{
  const response=await fetch('/api/social/game?id='+encodeURIComponent(gameId),{cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Replay unavailable');
  const moves=data.moves,control=document.createElement('div');control.className='online-actions';
  const back=document.createElement('button');back.type='button';back.textContent='← Previous';
  const next=document.createElement('button');next.type='button';next.textContent='Next →';
  control.append(back,next);msg.after(control);let index=moves.length;
  const frame=()=>{const board=new Chess();for(let n=0;n<index;n++)board.move(moves[n]);state={status:'finished',side:'w',white:data.white,black:data.black,fen:board.fen(),moves:moves.slice(0,index),turn:board.turn(),whiteMs:180000,blackMs:180000,result:data.result,lastMoveAt:0};side='w';selected=null;render();msg.textContent='Replay · '+index+' of '+moves.length+' half-moves · '+data.result;back.disabled=index===0;next.disabled=index===moves.length};
  back.onclick=()=>{index=Math.max(0,index-1);frame()};next.onclick=()=>{index=Math.min(moves.length,index+1);frame()};frame();
 }catch(error){msg.textContent=error.message||'Replay unavailable'}
}
