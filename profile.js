(async () => {
  const el = id => document.getElementById(id);
  const segments = location.pathname.split('/').filter(Boolean);
  const name = decodeURIComponent(segments[1] || '');
  const section = (segments[2] || '').toLowerCase().replace(/[-_ ]/g, '');
  const status = el('profile-status');
  if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) { status.textContent = 'Profile not found.'; return; }
  const sections = {
    friends: 'Friends', friendlist: 'Friends',
    chessrating: 'Chess rating', puzzlerating: 'Puzzle rating',
    personalrecords: 'Personal records', gamehistory: 'Game history'
  };
  if (section && !sections[section]) { status.textContent = 'Page not found.'; return; }
  try {
    const response = await fetch('/api/profile/' + encodeURIComponent(name), { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Profile not found.' : 'Profile temporarily unavailable.');
    const data = await response.json();
    // Existing accounts were stored lowercase. Use a readable capitalized display name.
    const display = data.username[0].toUpperCase() + data.username.slice(1);
    const base = '/profile/' + encodeURIComponent(data.username);
    el('profile-name').textContent = display;
    document.title = (section ? sections[section] + ' · ' : '') + display + ' · EloScanner';
    el('profile-avatar').textContent = display.slice(0, 2).toUpperCase();
    const date = new Date(data.joinedAt);
    el('profile-joined').textContent = 'Joined ' + (Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    const paths = {
      'profile-friends': 'friend-list', 'chess-rating-link': 'chess-rating',
      'puzzle-rating-link': 'puzzle-rating', 'records-link': 'personal-records',
      'history-link': 'game-history', 'records-panel-link': 'personal-records'
    };
    for (const [id, slug] of Object.entries(paths)) el(id).href = base + '/' + slug;
    el('profile-content').hidden = false;
    status.textContent = '';
    if (section) {
      el('profile-content').querySelector('.profile-stats').hidden = true;
      el('profile-content').querySelector('.profile-grid').hidden = true;
      const detail = el('profile-detail');
      detail.hidden = false;
      const title = document.createElement('h2');
      title.textContent = sections[section];
      const back = document.createElement('a');
      back.href = base;
      back.className = 'profile-heading-link';
      back.textContent = '← Back to profile';
      detail.append(back, title);
      if (section === 'gamehistory') {
        const intro = document.createElement('p');
        intro.textContent = 'Games will show players, colors, result, time control, both ratings, move count and a link to the game when saved games become available.';
        detail.append(intro);
        const empty = document.createElement('div');
        empty.className = 'profile-empty';
        empty.textContent = 'No saved games yet';
        detail.append(empty);
        const pagination = document.createElement('p');
        pagination.className = 'profile-pagination';
        pagination.textContent = '0 games · 25 games per page';
        detail.append(pagination);
      } else {
        const empty = document.createElement('div');
        empty.className = 'profile-empty';
        empty.textContent = section === 'friendlist' || section === 'friends' ? 'No friends available yet' : section === 'personalrecords' ? 'No linked records yet' : 'No ratings recorded yet';
        detail.append(empty);
      }
    }
    try {
      const session = await (window.eloAccountSession || fetch('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : null));
      if (session?.user?.username?.toLowerCase() === data.username.toLowerCase()) el('profile-edit').hidden = false;
    } catch {}
  } catch (error) { status.textContent = error.message || 'Unable to load profile.'; }
})();
(async()=>{try{const segments=location.pathname.split('/').filter(Boolean),username=decodeURIComponent(segments[1]||'');if(!/^[A-Za-z0-9_]{3,24}$/.test(username))return;const r=await fetch('/api/social/directory',{cache:'no-store'}),d=await r.json();const member=d.members?.find(m=>m.username.toLowerCase()===username.toLowerCase());if(member){const dot=document.createElement('span');dot.textContent=member.online?' ● Online':' ○ Offline';dot.style.color=member.online?'#4fe0a0':'#aab7c0';document.getElementById('profile-name').after(dot)}const hero=document.querySelector('.profile-hero');const controls=document.createElement('div');controls.className='online-profile-actions';const challenge=document.createElement('a');challenge.href='/online.html?challenge='+encodeURIComponent(username);challenge.textContent='Challenge';controls.append(challenge);const add=document.createElement('button');add.textContent='Add Friend';add.onclick=async()=>{try{const res=await fetch('/api/social/add',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});const j=await res.json();add.textContent=res.ok?'Friend added':j.error||'Unavailable'}catch{add.textContent='Unavailable'}};controls.append(add);hero.append(controls)}catch{}})();
