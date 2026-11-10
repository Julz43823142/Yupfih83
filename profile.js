(async()=>{
 const el=id=>document.getElementById(id),parts=location.pathname.split('/').filter(Boolean);
 let name;try{name=decodeURIComponent(parts[1]||'')}catch{name=''}
 const section=(parts[2]||'').toLowerCase().replace(/[-_ ]/g,'');
 const status=el('profile-status');
 if(!/^[A-Za-z0-9_]{3,24}$/.test(name)){status.textContent='Profile not found.';return}
 const sections={friends:'Friends',friendlist:'Friends',chessrating:'Chess rating',puzzlerating:'Puzzle rating',personalrecords:'Personal records',gamehistory:'Game history'};
 if(section&&!sections[section]){status.textContent='Page not found.';return}
 const get=async path=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error(r.status===404?'Profile not found.':'Temporarily unavailable.');return r.json()};
 const social=async(route,data)=>{const r=await fetch('/api/social/'+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j};
 const addText=(parent,text,tag='p')=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n};
 const addLink=(parent,text,url)=>{const a=document.createElement('a');a.textContent=text;a.href=url;parent.append(a);return a};

 const recordsCatalog=[['knight-maze','Knight Maze','minigames'],['endgame-survivor','Endgame Survivor','minigames'],['guess-the-elo','Guess the Elo','minigames'],['chess-memory','Chess Memory','minigames'],['missing-piece','Missing Piece','minigames'],['safe-square-rush','Safe Square Rush','minigames'],['falling-board','Falling Board','minigames'],['queen-chase','Queen Chase','minigames'],['chess-block-party','Chess Block Party','minigames'],['pawn-dash','Pawn Dash','minigames'],['sprint','Puzzle Sprint','puzzles'],['survival','Puzzle Survival','puzzles']];
 const populateRecords=async(target,username)=>{
  const data=await get('/api/profile-records/'+encodeURIComponent(username)),records=new Map((data.records||[]).map(x=>[x.mode,x]));
  const list=document.createElement('div');list.className='profile-record-list';
  for(const [mode,label,category] of recordsCatalog){
   const r=records.get(mode),row=document.createElement('div');row.className='profile-record-row';
   const link=addLink(row,label,'/puzzle-top100.html?category='+category+'&mode='+mode);link.className='profile-record-name';
   const value=document.createElement('span');value.className='profile-record-score';value.textContent=r?r.score.toLocaleString()+' points · #'+r.rank:'No linked score';
   row.append(value);list.append(row);
  }
  target.append(list);
  const count=records.size,card=el('records-link');card.querySelector('strong').textContent=String(count);card.querySelector('small').textContent='Linked personal bests';
  if(!count)addText(target,'Only scores submitted while signed in are linked to your account.').className='profile-record-note';
 };
 const populateGames=(target,data)=>{
  if(!data.games?.length){addText(target,'No saved online games yet.','div');return}
  for(const item of data.games){const row=document.createElement('p');row.className='profile-game-row';addLink(row,(item.white||'White')+' vs '+(item.black||'Black'),'/analysis.html?online='+encodeURIComponent(item.id));row.append(document.createTextNode(' · '+(item.result||'—')+' · 3+0 Unrated · '+item.moves+' moves'));target.append(row)}
 };
 try{
  const data=await get('/api/profile/'+encodeURIComponent(name));
  const display=data.username[0].toUpperCase()+data.username.slice(1),base='/profile/'+encodeURIComponent(data.username);
  document.title=(section?sections[section]+' · ':'')+display+' · EloScanner';
  el('profile-name').textContent=display;el('profile-avatar').textContent=display.slice(0,2).toUpperCase();
  if(data.role==='admin'){const badge=document.createElement('span');badge.className='profile-admin-badge';badge.textContent='Admin';el('profile-name').after(badge)}
  const date=new Date(data.joinedAt);el('profile-joined').textContent='Joined '+(Number.isNaN(date.getTime())?'date unavailable':date.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}));
  for(const [id,slug] of Object.entries({'profile-friends':'friend-list','chess-rating-link':'chess-rating','puzzle-rating-link':'puzzle-rating','records-link':'personal-records','history-link':'game-history','records-panel-link':'personal-records'}))el(id).href=base+'/'+slug;
  el('profile-content').hidden=false;status.textContent='';
  try{const presence=await get('/api/social/status?username='+encodeURIComponent(data.username));const span=document.createElement('span');span.textContent=presence.online?' ● Online':' ○ Offline';span.style.color=presence.online?'#4fe0a0':'#aab7c0';el('profile-name').after(span)}catch{}
  const session=await (window.eloAccountSession||get('/api/auth/get-session').catch(()=>null));
  const me=session?.user?.username?.toLowerCase()===data.username.toLowerCase();
  if(me){
   el('profile-edit').hidden=false;
   if(data.role==='admin'){
    const dashboard=document.createElement('a');dashboard.href='/admin.html';dashboard.className='profile-edit';dashboard.textContent='Admin dashboard';
    el('profile-edit').after(dashboard);
   }
  }
  else{
   const actions=document.createElement('div');actions.className='online-profile-actions';
   addLink(actions,'Challenge to 3+0','/online.html?challenge='+encodeURIComponent(data.username));
   const add=document.createElement('button');add.type='button';add.textContent='Add Friend';
   add.onclick=async()=>{add.disabled=true;try{const result=await social('add',{username:data.username});add.textContent=result.already?'Already friends':'Friend request sent'}catch(e){add.textContent=e.message;add.disabled=false}};
   actions.append(add);el('profile-content').querySelector('.profile-hero').append(actions);
  }
  let friendCount=0;
  try{const friends=await get('/api/social/public-friends?username='+encodeURIComponent(data.username));friendCount=friends.friends?.length||0;el('profile-friends').textContent='Friends: '+friendCount+' →'}catch{}
  if(section){
   el('profile-content').querySelector('.profile-stats').hidden=true;el('profile-content').querySelector('.profile-grid').hidden=true;
   const detail=el('profile-detail');detail.hidden=false;addLink(detail,'← Back to profile',base).className='profile-heading-link';addText(detail,sections[section],'h2');
   if(section==='gamehistory'){
    const page=Number(new URL(location.href).searchParams.get('page')||0)||0;
    addText(detail,'Completed online games · 3+0 Unrated · retained for up to 30 days.');
    const history=await get('/api/social/history?username='+encodeURIComponent(data.username)+'&page='+page);
    populateGames(detail,history);addText(detail,history.total+' games · page '+(page+1)+' · 25 per page');
    const nav=document.createElement('p');nav.className='profile-pagination';
    if(page>0)addLink(nav,'← Previous',base+'/game-history?page='+(page-1));
    if((page+1)*25<history.total){if(page>0)nav.append(' · ');addLink(nav,'Next →',base+'/game-history?page='+(page+1))}
    detail.append(nav);
   }else if(section==='friends'||section==='friendlist'){
    const friends=await get('/api/social/public-friends?username='+encodeURIComponent(data.username));
    if(!friends.friends?.length)addText(detail,'No friends yet.');else for(const item of friends.friends){const p=document.createElement('p');addLink(p,item.username,'/profile/'+encodeURIComponent(item.username));p.append(item.online?' · Online':' · Offline');detail.append(p)}
   }else if(section==='chessrating')addText(detail,'3+0 online games are currently unrated. No Elo rating is assigned.');
   else if(section==='personalrecords')await populateRecords(detail,data.username);else addText(detail,'No rating recorded yet.');
  }else{
   try{const history=await get('/api/social/history?username='+encodeURIComponent(data.username)+'&page=0');const panel=el('profile-content').querySelector('.profile-grid .profile-panel .profile-empty');if(panel){panel.replaceChildren();populateGames(panel,{games:(history.games||[]).slice(0,3)});if(history.total>3)addLink(panel,'View all '+history.total+' games',base+'/game-history')}}catch{}
   try{const panel=el('profile-content').querySelector('.profile-grid .profile-panel:last-child .profile-empty');if(panel){panel.replaceChildren();await populateRecords(panel,data.username)}}catch(error){const panel=el('profile-content').querySelector('.profile-grid .profile-panel:last-child .profile-empty');if(panel)panel.textContent='Records temporarily unavailable.'}
  }
 }catch(error){status.textContent=error.message||'Profile temporarily unavailable.'}
})();
