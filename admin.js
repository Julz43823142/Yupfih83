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
      panel.hidden = false; await load();
    } catch (error) { setStatus(error.message); }
  }
  el('admin-search-form').addEventListener('submit', event => {
    event.preventDefault(); search = el('admin-search').value.trim(); page = 0; load();
  });
  el('admin-prev').addEventListener('click', () => { if (page > 0) { page--; load(); } });
  el('admin-next').addEventListener('click', () => { if ((page + 1) * 25 < total) { page++; load(); } });
  init();
})();
