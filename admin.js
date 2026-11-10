(() => {
  const el = id => document.getElementById(id);
  const status = el('admin-status'), panel = el('admin-panel');
  let page = 0, total = 0, search = '';
  const setStatus = message => { status.textContent = message; };
  const clear = node => node.replaceChildren();
  const render = data => {
    total = data.total;
    el('admin-total').textContent = String(total);
    const list = el('admin-list'); clear(list);
    if (!data.users.length) {
      const empty = document.createElement('p'); empty.textContent = 'No members found.'; list.append(empty);
    }
    for (const user of data.users) {
      const row = document.createElement('div'); row.className = 'admin-member';
      const identity = document.createElement('div'); identity.className = 'admin-identity';
      const link = document.createElement('a'); link.href = '/profile/' + encodeURIComponent(user.username); link.textContent = user.username; identity.append(link);
      const joined = document.createElement('small');
      const date = new Date(user.joinedAt);
      joined.textContent = 'Joined ' + (Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleDateString());
      identity.append(joined);
      const role = document.createElement('span'); role.className = user.role === 'admin' ? 'admin-role admin-role-admin' : 'admin-role'; role.textContent = user.role === 'admin' ? 'Admin' : 'Member';
      row.append(identity, role); list.append(row);
    }
    el('admin-page').textContent = 'Page ' + (page + 1) + ' of ' + Math.max(1, Math.ceil(total / data.pageSize));
    el('admin-prev').disabled = page === 0;
    el('admin-next').disabled = (page + 1) * data.pageSize >= total;
  };
  async function load() {
    setStatus('Loading members…');
    el('admin-prev').disabled = el('admin-next').disabled = true;
    try {
      const params = new URLSearchParams({ page: String(page), search });
      const response = await fetch('/api/admin/users?' + params, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Please log in again.' : response.status === 403 ? 'Administrator access required.' : 'Could not load the member directory.');
      render(await response.json()); setStatus('');
    } catch (error) { setStatus(error.message); }
  }
  async function init() {
    try {
      const response = await fetch('/api/admin/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Please log in to access this page.' : 'Administrator access could not be verified.');
      const data = await response.json();
      if (data.role !== 'admin') { setStatus('Administrator access required.'); return; }
      panel.hidden = false; await Promise.all([load(), loadScores()]);
    } catch (error) { setStatus(error.message); }
  }
  el('admin-search-form').addEventListener('submit', event => {
    event.preventDefault(); search = el('admin-search').value.trim(); page = 0; load();
  });
  el('admin-prev').addEventListener('click', () => { if (page > 0) { page--; load(); } });
  el('admin-next').addEventListener('click', () => { if ((page + 1) * 25 < total) { page++; load(); } });

  // Score actions use server-issued IDs, never nickname-based deletion.
  let scorePage = 0, scoreTotal = 0, scoreBoard = 'puzzle', scoreSearch = '';
  const scoreStatus = el('admin-scores-status');
  const scoreMessage = value => { scoreStatus.textContent = value; };
  async function loadScores() {
    scoreMessage('Loading scores…');
    el('admin-scores-prev').disabled = el('admin-scores-next').disabled = true;
    try {
      const params = new URLSearchParams({ board: scoreBoard, search: scoreSearch, page: String(scorePage) });
      const response = await fetch('/api/admin/leaderboard?' + params, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests. Try again shortly.' : 'Could not load leaderboard scores.');
      const data = await response.json(); scoreTotal = data.total;
      const list = el('admin-scores-list'); list.replaceChildren();
      if (!data.entries.length) {
        const empty = document.createElement('p'); empty.textContent = 'No scores found.'; list.append(empty);
      }
      for (const entry of data.entries) {
        const row = document.createElement('div'); row.className = 'admin-member';
        const identity = document.createElement('div'); identity.className = 'admin-identity';
        const name = document.createElement('strong'); name.textContent = entry.nickname; identity.append(name);
        const meta = document.createElement('small');
        meta.textContent = String(entry.score) + ' points · ' + (entry.sourceType === 'account' ? 'Account' : 'Nickname only') +
          (entry.mode ? ' · ' + entry.mode : '') + ' · ' + (new Date(entry.createdAt).toLocaleDateString());
        identity.append(meta);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'admin-remove-score'; remove.textContent = 'Remove score';
        remove.addEventListener('click', async () => {
          if (!confirm('Remove the score of ' + entry.nickname + ' (' + entry.score + ' points) from ' + scoreBoard + '? This removes this score from all public rankings.')) return;
          remove.disabled = true;
          try {
            const response = await fetch('/api/admin/leaderboard', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ board: scoreBoard, id: entry.id, confirm: 'REMOVE' })
            });
            if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests. Try again shortly.' : 'Could not remove the score.');
            scoreMessage('Score removed from public rankings.');
            await loadScores();
          } catch (error) { scoreMessage(error.message); remove.disabled = false; }
        });
        row.append(identity, remove); list.append(row);
      }
      el('admin-scores-page').textContent = 'Page ' + (scorePage + 1) + ' of ' + Math.max(1, Math.ceil(scoreTotal / 25));
      el('admin-scores-prev').disabled = scorePage === 0;
      el('admin-scores-next').disabled = (scorePage + 1) * 25 >= scoreTotal;
      scoreMessage('');
    } catch (error) { scoreMessage(error.message); }
  }
  el('admin-leaderboard-form').addEventListener('submit', event => {
    event.preventDefault(); scorePage = 0; scoreBoard = el('admin-board').value; scoreSearch = el('admin-score-search').value.trim(); loadScores();
  });
  el('admin-scores-prev').addEventListener('click', () => { if (scorePage > 0) { scorePage--; loadScores(); } });
  el('admin-scores-next').addEventListener('click', () => { if ((scorePage + 1) * 25 < scoreTotal) { scorePage++; loadScores(); } });
  init();
})();
