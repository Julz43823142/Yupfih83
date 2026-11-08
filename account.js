(async () => {
  const byId = id => document.getElementById(id);
  const status = byId('account-status');
  let config, token = '', widgetId, turnstileLoading;
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function changed(user) { window.dispatchEvent(new CustomEvent('elo-account-changed', { detail: { user } })); }
  let passkeyListGeneration = 0;
  async function refreshPasskeyCount() {
    const generation = ++passkeyListGeneration;
    const count = byId('passkey-count');
    if (!count || !config?.passkeyReady || !window.eloPasskey) return;
    count.textContent = 'Checking registered passkeys…';
    try {
      const keys = await window.eloPasskey.list();
      if (generation !== passkeyListGeneration || byId('passkey-profile-panel').hidden) return;
      if (!Array.isArray(keys)) throw new Error('Unable to read passkeys.');
      count.textContent = keys.length === 0 ? 'No passkeys registered yet.' :
        keys.length === 1 ? '1 passkey registered. Add a second passkey as a backup.' :
        keys.length + ' passkeys registered (maximum 5).';
      byId('passkey-enrollment-form').querySelector('button').disabled = keys.length >= 5;
    } catch {
      if (generation === passkeyListGeneration && !byId('passkey-profile-panel').hidden) count.textContent = 'Passkey list unavailable. Try refreshing the page.';
    }
  }
  function showUser(user) {
    byId('registration-panel').hidden = true;
    byId('login-panel').hidden = !!user;
    byId('profile-panel').hidden = !user;
    byId('passkey-profile-panel').hidden = !(user && config?.passkeyReady && window.eloPasskey && window.PublicKeyCredential);
    if (user) {
      byId('profile-username').textContent = user.username;
      byId('profile-link').href = '/profile/' + encodeURIComponent(user.username);
      byId('account-avatar').textContent = user.username.slice(0, 2).toUpperCase();
      byId('profile-created').textContent = `Member since ${new Date(user.createdAt).toLocaleDateString()}`;
    }
    if (!user) { byId('password-form').reset(); byId('delete-form').reset(); }
    if (user && !byId('passkey-profile-panel').hidden) void refreshPasskeyCount();
    if (!user) ++passkeyListGeneration;
    changed(user);
  }
  async function post(route, body) {
    // A password hash may still be running in the same Worker isolate.
    // Retry only the explicit BUSY response, never login failures or rate limits.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`/api/auth/${route}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      if (!type.toLowerCase().includes('application/json')) throw new Error('Account server returned a webpage instead of API data. Check the Cloudflare Pages Functions deployment and /api/auth routing.');
      const data = await response.json();
      if (response.status === 429 && data.code === 'AUTH_BUSY' && attempt < 2) {
        const seconds = Math.min(5, Math.max(1, Number(response.headers.get('Retry-After')) || 2));
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        continue;
      }
      if (!response.ok) throw Object.assign(new Error(data.message || 'Unable to complete this request.'), { code: data.code });
      return data;
    }
  }
  async function busy(form, action) {
    const button = form.querySelector('button') || form; button.disabled = true;
    try { await action(); } catch (error) { message(error.message || 'Connection failed. Please try again.', true); }
    finally { button.disabled = false; }
  }
  async function challenge() {
    if (!config?.turnstileSiteKey) throw new Error('Security check unavailable. Please try again later.');
    if (!window.turnstile) {
      turnstileLoading ||= new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
        script.onload = resolve; script.onerror = () => { turnstileLoading = null; reject(new Error('Unable to load the security check. Please try again.')); }; document.head.append(script);
      });
      await turnstileLoading;
    }
    if (widgetId !== undefined) { window.turnstile.reset(widgetId); return; }
    widgetId = window.turnstile.render('#turnstile-container', { sitekey: config.turnstileSiteKey, action: 'login', callback: value => { token = value; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; message('Security check failed. Please try again.', true); } });
  }
  let signupWidgetId, signupToken = '';
  async function signupChallenge() {
    if (!config?.turnstileSiteKey) throw new Error('Registration security check is not configured.');
    if (!window.turnstile) {
      turnstileLoading ||= new Promise((resolve,reject)=>{ const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script); });
      await turnstileLoading;
    }
    if (signupWidgetId !== undefined) return;
    signupWidgetId = window.turnstile.render('#signup-turnstile', { sitekey: config.turnstileSiteKey, action: 'signup', callback: value => { signupToken=value; }, 'expired-callback':()=>{signupToken='';}, 'error-callback':()=>{signupToken='';} });
  }
  byId('registration-preview-form').addEventListener('submit', event => {
    event.preventDefault(); const form=event.currentTarget;
    busy(form, async()=>{
      const username = byId('signup-username').value.trim();
      if (!config?.registrationOpen || !config?.passkeyReady || !window.eloPasskey || !window.PublicKeyCredential)
        throw new Error('Phone-passkey registration is not available yet.');
      if (!signupToken) throw new Error('Complete the security check first.');
      message('Preparing your phone passkey…');
      const options = await post('passkey-signup/options', { username, turnstileToken: signupToken });
      signupToken = '';
      if (signupWidgetId !== undefined) window.turnstile.reset(signupWidgetId);
      message('Confirm the passkey on your phone. Scan the QR code if your browser shows one…');
      const credential = await window.eloPasskey.registerPhone(options.publicKey);
      message('Verifying your new passkey…');
      const created = await post('passkey-signup/verify', {
        attemptId: options.attemptId, challenge: options.publicKey.challenge, credential
      });
      if (!created.success) throw new Error('Registration could not be completed.');
      form.reset();
      // Never sign in automatically with a discoverable credential: the browser
      // could select an unrelated existing account after registration.
      byId('signup-submit').disabled = true;
      message('Account ' + username + ' created successfully. You are not signed in yet. Use passkey sign-in on the account page and verify the displayed username.');
    });
  });
  byId('login-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    busy(form, async () => {
      message('Logging in…');
      try {
        const result = await post('sign-in/username', { username: byId('username').value, password: byId('password').value, rememberMe: byId('remember').checked, turnstileToken: token });
        form.reset(); showUser(result.user); message('You are logged in.');
        history.replaceState(null, '', '/account.html');
      } catch (error) {
        if (error.code === 'CHALLENGE_REQUIRED') await challenge();
        throw error;
      } finally { token = ''; if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId); }
    });
  });
  byId('passkey-login').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (!config?.passkeyReady || !window.eloPasskey || !window.PublicKeyCredential) throw new Error('Passkey sign-in is not available.');
    message('Confirm the passkey on your device…');
    const result = await window.eloPasskey.signIn();
    if (!result?.user) throw new Error('Passkey sign-in did not complete.');
    showUser(result.user);
    message('You are logged in with your passkey.');
    history.replaceState(null, '', '/account.html');
  }));
  byId('passkey-enrollment-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, async () => {
      if (!config?.passkeyReady || !window.eloPasskey || !window.PublicKeyCredential) throw new Error('Passkey enrollment is not available.');
      await post('passkey/step-up', { currentPassword: byId('passkey-confirm-password').value });
      byId('passkey-confirm-password').value = '';
      message('Confirm the new passkey on your device…');
      await window.eloPasskey.enroll();
      form.reset();
      message('Your passkey is registered. Test a passkey login before removing any old sign-in method.');
      await refreshPasskeyCount();
    });
  });
  byId('password-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    busy(form, async () => {
      if (byId('new-password').value !== byId('confirm-password').value) throw new Error('The new passwords do not match.');
      await post('change-password', { currentPassword: byId('current-password').value, newPassword: byId('new-password').value });
      form.reset(); message('Password changed. Your other sessions have been signed out.');
    });
  });
  byId('sign-out').addEventListener('click', event => busy(event.currentTarget, async () => { await post('sign-out', {}); showUser(null); message('You are logged out.'); }));
  byId('sign-out-all').addEventListener('click', event => busy(event.currentTarget, async () => { await post('revoke-sessions', {}); await post('sign-out', {}); showUser(null); message('All sessions have been signed out.'); }));
  byId('delete-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!confirm('Permanently delete your EloScanner account? This cannot be undone.')) return;
    busy(form, async () => { await post('delete-user', { password: byId('delete-password').value }); form.reset(); showUser(null); message('Your account has been deleted.'); });
  });
  try {
    const response = await fetch('/api/auth/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Account services are not available yet.');
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Account API is not responding correctly. Check the Cloudflare Pages Functions deployment.');
    config = await response.json();
    byId('passkey-login').hidden = !(config.passkeyReady && window.eloPasskey && window.PublicKeyCredential);
    if (new URLSearchParams(location.search).get('view') === 'signup') { byId('registration-panel').hidden = false; byId('signup-submit').disabled = !config.registrationOpen; message(config.registrationOpen ? '' : 'Registration is currently unavailable.'); if(config.registrationOpen) await signupChallenge(); return; }
    const session = await (window.eloAccountSession || fetch('/api/auth/get-session', { cache: 'no-store' }).then(async r => ({ available: r.ok, ...(r.ok ? await r.json() : {}) })));
    showUser(session.user || null);
    message(config.loginConfigured && session.available ? '' : 'Account services are not available yet. Registration remains closed.');
    if (!config.loginConfigured || !session.available) byId('login-form').querySelector('button').disabled = true;
  } catch (error) {
    if (new URLSearchParams(location.search).get('view') === 'signup') byId('registration-panel').hidden = false;
    message(error.message, true);
  }
})();
