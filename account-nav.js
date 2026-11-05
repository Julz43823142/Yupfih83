(() => {
  const header = document.querySelector('header.navbar');
  if (!header || header.querySelector('.account-nav')) return;
  // Preserve the homepage mobile menu: account links are rendered inside it.
  const nav = document.createElement('nav'); nav.className = 'account-nav'; nav.setAttribute('aria-label', 'Account');
  header.append(nav);
  const displayName = user => user.username ? user.username[0].toUpperCase() + user.username.slice(1) : '';
  function render(user) {
    nav.replaceChildren();
    const links = user ? [[displayName(user), '/profile/' + encodeURIComponent(user.username)]] : [['Log in', '/account.html'], ['Sign up', '/account.html?view=signup']];
    for (const [label, href] of links) { const a = document.createElement('a'); a.textContent = label; a.href = href; if (user) a.className = 'account-nav-user'; nav.append(a); }
  }
  // Keep desktop account links in the header. On phones, put the same
  // destinations at the top of the existing chess navigation dropdown.
  function renderMobileMenu(user) {
    const menu = header.querySelector('.elo-global-menu nav, .mobile-chess-menu nav');
    if (!menu) return;
    let section = menu.querySelector('.elo-mobile-account-links');
    if (!section) {
      section = document.createElement('div');
      section.className = 'elo-mobile-account-links';
      section.setAttribute('aria-label', 'Account');
      menu.prepend(section);
    }
    section.replaceChildren();
    const links = user ? [[displayName(user), '/profile/' + encodeURIComponent(user.username)]] : [['Log in', '/account.html'], ['Sign up', '/account.html?view=signup']];
    for (const [label, href] of links) {
      const a = document.createElement('a');
      a.textContent = label;
      a.href = href;
      if (user) a.className = 'elo-mobile-account-user';
      section.append(a);
    }
  }
  const renderAccount = user => { render(user); renderMobileMenu(user); };
  renderAccount(null);
  // One shared request per page, no polling, no session token in browser storage.
  window.eloAccountSession = fetch('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => ({ available: response.ok, ...(response.ok ? await response.json() : { user: null }) }))
    .catch(() => ({ available: false, user: null }));
  let presentUser=null;
  async function announcePresence(){
    if(!presentUser||document.visibilityState==='hidden')return;
    try{await fetch('/api/social/presence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'})}catch{}
  }
  window.eloAccountSession.then(result => {presentUser=result.user||null;renderAccount(result.user);announcePresence()});
  setInterval(announcePresence,45000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')announcePresence()});
  window.addEventListener('elo-account-changed', event => {presentUser=event.detail?.user||null;renderAccount(presentUser);announcePresence()});
})();
