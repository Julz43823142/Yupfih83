(async()=>{
 const status=document.getElementById('members-status'),list=document.getElementById('members-list');
 try{
  const [memberRes,presenceRes]=await Promise.all([fetch('/api/members',{cache:'no-store'}),fetch('/api/social/directory',{cache:'no-store'})]);
  if(!memberRes.ok)throw Error('Member list temporarily unavailable.');
  const data=await memberRes.json(),directory=presenceRes.ok?(await presenceRes.json()).members||[]:[];
  const presence=new Map(directory.map(m=>[m.username.toLowerCase(),m]));
  // Relative durations work in every timezone; local timestamps are available on hover.
  const relative=new Intl.RelativeTimeFormat(navigator.language||'en',{numeric:'always'});
  function lastSeen(value){
   if(value===null||value===undefined)return null;
   const timestamp=Number(value);
   if(!Number.isFinite(timestamp)||timestamp<=0)return null;
   const elapsed=Math.max(0,Math.floor((Date.now()-timestamp)/1000));
   const minutes=Math.floor(elapsed/60),hours=Math.floor(elapsed/3600),days=Math.floor(elapsed/86400);
   if(elapsed<60)return 'just now';
   if(minutes<60)return relative.format(-minutes,'minute');
   if(hours<24)return relative.format(-hours,'hour');
   if(days<7)return relative.format(-days,'day');
   if(days<30)return relative.format(-Math.floor(days/7),'week');
   if(days<365)return relative.format(-Math.floor(days/30),'month');
   return relative.format(-Math.floor(days/365),'year');
  }
  status.textContent=data.total+' registered member'+(data.total===1?'':'s')+(data.total>data.members.length?' · showing newest '+data.members.length:'');
  if(!data.members.length){list.textContent='No registered members yet.';return}
  for(const member of data.members){
   const row=document.createElement('div');row.className='member-row';
   const a=document.createElement('a');a.className='member-item';a.href='/profile/'+encodeURIComponent(member.username);
   const avatar=document.createElement('span');avatar.className='member-avatar';avatar.textContent=member.image?'':member.username.slice(0,2).toUpperCase();if(member.image){avatar.style.backgroundImage='url("'+member.image+'")';avatar.classList.add('has-photo');}
   const info=document.createElement('span');const title=document.createElement('strong');title.textContent=member.username;
   const date=document.createElement('small'),joined=new Date(member.joinedAt);date.textContent='Joined '+(Number.isNaN(joined.getTime())?'date unknown':joined.toLocaleDateString());
   const activity=document.createElement('small');
   const memberPresence=presence.get(member.username.toLowerCase());
   const active=!!memberPresence?.online;
   const seen=lastSeen(memberPresence?.lastSeen);
   activity.textContent=active?'● Online':'○ Offline · Last Seen '+(seen||'unknown');
   activity.style.color=active?'#4fe0a0':'#aab7c0';
   if(!active&&seen){
    const date=new Date(Number(memberPresence.lastSeen));
    activity.title='Last online: '+date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
   }
   info.append(title,date,activity);a.append(avatar,info);
   const challenge=document.createElement('a');challenge.className='member-challenge';challenge.textContent='Challenge';challenge.href='/online.html?challenge='+encodeURIComponent(member.username);
   row.append(a,challenge);list.append(row);
  }
 }catch(e){status.textContent=e.message||'Member list temporarily unavailable.'}
})();
