(() => {
  const header = document.querySelector('header.navbar');
  if (!header || header.querySelector('.account-nav')) return;
  if (location.pathname === '/' || location.pathname === '/index.html') header.querySelectorAll('.mobile-chess-menu').forEach(node => node.remove());
  const nav = document.createElement('nav'); nav.className = 'account-nav'; nav.setAttribute('aria-label', 'Account');
  header.append(nav);
  function render(user) {
    nav.replaceChildren();
    const links = user ? [[user.username, '/account.html']] : [['Log in', '/account.html'], ['Sign up', '/account.html?view=signup']];
    for (const [label, href] of links) { const a = document.createElement('a'); a.textContent = label; a.href = href; if (user) a.className = 'account-nav-user'; nav.append(a); }
  }
  render(null);
  // One shared request per page, no polling, no session token in browser storage.
  window.eloAccountSession = fetch('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => ({ available: response.ok, ...(response.ok ? await response.json() : { user: null }) }))
    .catch(() => ({ available: false, user: null }));
  window.eloAccountSession.then(result => render(result.user));
  window.addEventListener('elo-account-changed', event => render(event.detail?.user));
})();
