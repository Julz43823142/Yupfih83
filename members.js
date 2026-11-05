(async()=>{
 const status=document.getElementById('members-status'),list=document.getElementById('members-list');
 try{
  const [memberRes,presenceRes]=await Promise.all([fetch('/api/members',{cache:'no-store'}),fetch('/api/social/directory',{cache:'no-store'})]);
  if(!memberRes.ok)throw Error('Member list temporarily unavailable.');
  const data=await memberRes.json(),directory=presenceRes.ok?(await presenceRes.json()).members||[]:[];
  const online=new Map(directory.map(m=>[m.username.toLowerCase(),!!m.online]));
  status.textContent=data.total+' registered member'+(data.total===1?'':'s')+(data.total>data.members.length?' · showing newest '+data.members.length:'');
  if(!data.members.length){list.textContent='No registered members yet.';return}
  for(const member of data.members){
   const row=document.createElement('div');row.className='member-row';
   const a=document.createElement('a');a.className='member-item';a.href='/profile/'+encodeURIComponent(member.username);
   const avatar=document.createElement('span');avatar.className='member-avatar';avatar.textContent=member.username.slice(0,2).toUpperCase();
   const info=document.createElement('span');const title=document.createElement('strong');title.textContent=member.username;
   const date=document.createElement('small'),joined=new Date(member.joinedAt);date.textContent='Joined '+(Number.isNaN(joined.getTime())?'date unknown':joined.toLocaleDateString());
   const activity=document.createElement('small');const active=online.get(member.username.toLowerCase());
   activity.textContent=active?'● Online':'○ Offline';activity.style.color=active?'#4fe0a0':'#aab7c0';
   info.append(title,date,activity);a.append(avatar,info);
   const challenge=document.createElement('a');challenge.className='member-challenge';challenge.textContent='Challenge';challenge.href='/online.html?challenge='+encodeURIComponent(member.username);
   row.append(a,challenge);list.append(row);
  }
 }catch(e){status.textContent=e.message||'Member list temporarily unavailable.'}
})();
