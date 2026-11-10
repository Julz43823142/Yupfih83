(async () => {
  const byId = id => document.getElementById(id);
  const status = byId('account-status');
  let config, token = '', widgetId, turnstileLoading;
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function changed(user) { window.dispatchEvent(new CustomEvent('elo-account-changed', { detail: { user } })); }
  let recoveryCodes = null;
  function clearRecoveryCodes() {
    recoveryCodes = null;
    byId('recovery-codes-text').textContent = '';
    byId('recovery-codes-output').hidden = true;
  }
  function recoveryCodeText() {
    if (!recoveryCodes) throw new Error('Generate recovery codes first.');
    return 'EloScanner emergency recovery codes\nKeep these private. Each code works only once.\n\n' +
      recoveryCodes.map((code, index) => (index + 1) + '. ' + code).join('\n') + '\n';
  }
  function displayRecoveryCodes(result) {
    if (!Array.isArray(result?.codes) || result.codes.length !== 8 ||
        result.codes.some(code => !/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){7}$/.test(code)))
      throw new Error('Recovery codes were not returned correctly.');
    recoveryCodes = result.codes;
    byId('recovery-codes-text').textContent = recoveryCodeText();
    byId('recovery-codes-output').hidden = false;
    byId('recovery-codes-notice').textContent = 'Download or copy your codes now. Do not share them.';
  }
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
  let accountPasswordEnabled = null;
  async function refreshPasswordStatus() {
    if (!config?.passkeyReady || byId('passkey-profile-panel').hidden) return;
    try {
      const response = await fetch('/api/auth/passkey/password-status', {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (!response.ok) throw new Error('Account security status unavailable.');
      const state = await response.json();
      accountPasswordEnabled = state.passwordEnabled;
      byId('passwordless-migration-panel').hidden = false;
      byId('remove-password-form').hidden = !state.passwordEnabled;
      byId('passwordless-active').hidden = state.passwordEnabled;
      byId('password-form').hidden = !state.passwordEnabled;
      byId('delete-form').hidden = !state.passwordEnabled;
      byId('delete-passkey-account-form').hidden = state.passwordEnabled;
      byId('passkey-confirm-password').required = state.passwordEnabled;
      byId('passkey-confirm-password').closest('form').querySelector('label').hidden = !state.passwordEnabled;
      const readiness = byId('passwordless-readiness');
      if (!state.passwordEnabled) {
        readiness.textContent = 'Passkey-only account. Your previous password can no longer sign you in.';
      } else if (!state.backupReady) {
        readiness.textContent = 'Add at least one backed-up passkey or two distinct passkeys before disabling your password.';
      } else if (!state.recentPasskeyLogin) {
        readiness.textContent = 'Passkey ready. Sign out and sign back in with your passkey before removing your password.';
      } else {
        readiness.textContent = 'Passkey login verified on this session. You can now remove your password after confirming it below.';
      }
      const desktop = !window.eloPhoneAccount?.isPhone();
      byId('passkey-enrollment-form').hidden = desktop;
      byId('passkey-phone-enroll-handoff').hidden = !desktop;
      if (desktop) window.eloPhoneAccount?.render(byId('passkey-phone-enroll-qr'));
    } catch {
      accountPasswordEnabled = null;
      byId('passwordless-migration-panel').hidden = true;
      // Fail closed: never offer password removal when its safety status is unavailable.
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
    if (user && !byId('passkey-profile-panel').hidden) void refreshPasswordStatus();
    if (!user) { ++passkeyListGeneration; clearRecoveryCodes(); }
    byId('recovery-codes-panel').hidden = !(user && config?.passkeyReady && config?.recoveryCodesReady);
    byId('phone-transfer-panel').hidden = !(user && config?.phoneTransferReady);
    byId('recovery-login-panel').hidden = !(!user && config?.recoveryCodesReady);
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
      if (!window.eloPhoneSignup?.isPhone()) throw new Error('Create your account on your phone. Scan the QR code shown on this page.');
      const username = byId('signup-username').value.trim();
      if (!config?.registrationOpen || !config?.passkeyReady || !window.eloPasskey || !window.PublicKeyCredential)
        throw new Error('Phone-passkey registration is not available yet.');
      if (!signupToken) throw new Error('Complete the security check first.');
      message('Preparing your phone passkey…');
      const options = await post('passkey-signup/options', { username, turnstileToken: signupToken });
      signupToken = '';
      if (signupWidgetId !== undefined) window.turnstile.reset(signupWidgetId);
      message('Confirm the passkey using your phone’s Face ID, fingerprint, or phone screen lock…');
      const credential = await window.eloPasskey.registerPhone(options.publicKey);
      message('Verifying your new passkey…');
      const created = await post('passkey-signup/verify', {
        attemptId: options.attemptId, challenge: options.publicKey.challenge, credential
      });
      if (!created.success || created.username !== username.toLowerCase()) throw new Error('Registration response did not match the requested username. Do not sign in; contact support.');
      if (created.loggedIn && created.user?.username === created.username) {
        form.reset();
        showUser(created.user);
        if (config?.recoveryCodesReady) {
          // New passkey-only accounts need an independent recovery method before
          // they leave the signup screen. Never silently rotate existing codes.
          try {
            const codes = await post('passkey/recovery-codes/rotate', {});
            displayRecoveryCodes(codes);
            byId('recovery-codes-panel').scrollIntoView({ behavior: 'smooth' });
            message('Account created. Save these eight recovery codes now; they cannot be shown again.');
          } catch {
            message('Account created, but recovery codes were not generated or could not be displayed. Sign in again with your primary passkey and generate recovery codes before using this account.', true);
          }
        } else {
          message('Account created, but recovery codes are unavailable. Do not rely on this account until recovery is configured.', true);
        }
        history.replaceState(null, '', '/account.html');
        return;
      }
      form.reset();
      // Registration intentionally does not sign in: a generic passkey prompt
      // could select a different existing account. Never present that as success.
      form.hidden = true;
      message('Account ' + created.username + ' created. You are not signed in. Open the login page, choose Log in with passkey, and confirm the displayed username is ' + created.username + '.');
    });
  });
  byId('recovery-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, async () => {
      if (!config?.recoveryCodesReady || !window.eloPhoneSignup?.isPhone() ||
          !window.eloPasskey?.registerRecoveryPhone || !window.PublicKeyCredential)
        throw new Error('Open EloScanner on your phone to recover your account.');
      const username = byId('recovery-username').value.trim().toLowerCase();
      const code = byId('recovery-code').value.trim();
      message('Verifying emergency recovery code…');
      const options = await post('passkey/recovery/options', { username, code });
      byId('recovery-code').value = '';
      message('Create a new phone passkey using your device screen lock…');
      const credential = await window.eloPasskey.registerRecoveryPhone(options.publicKey);
      const verified = await post('passkey/recovery/verify', {
        attemptId: options.attemptId, challenge: options.challenge, credential
      });
      if (!verified.success) throw new Error('Recovery could not be completed.');
      form.reset();
      message('Your primary passkey has been replaced. All old sessions, passkeys and recovery codes are invalid. Sign in with your new passkey, then generate eight new recovery codes.');
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
  // The QR contains a request ID only. The one-time desktop claim secret is
  // kept in this tab and never sent to the phone or put in a URL.
  let qrActive = null;
  const isPhone = () => !!window.eloPhoneSignup?.isPhone();
  function drawLoginQr(element, url) {
    if (typeof window.qrcode !== 'function') throw new Error('QR generator unavailable.');
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount(), quiet = 4, size = count + quiet * 2;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('width', '260');
    svg.setAttribute('height', '260');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Scan this QR code with your phone to approve computer login');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', size); bg.setAttribute('height', size);
    bg.setAttribute('fill', '#ffffff'); svg.append(bg);
    const cells = [];
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) cells.push('M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z');
    }
    const dark = document.createElementNS(ns, 'path');
    dark.setAttribute('d', cells.join(''));
    dark.setAttribute('fill', '#101820'); svg.append(dark);
    element.replaceChildren(svg);
  }
  function cancelQr() {
    if (qrActive) qrActive.cancelled = true;
    qrActive = null;
    byId('qr-login-desktop').hidden = true;
    byId('qr-login-image').replaceChildren();
    byId('qr-login-code').textContent = '';
    byId('qr-login-status').textContent = '';
  }
  byId('qr-login-cancel').addEventListener('click', () => { cancelQr(); message('QR login cancelled.'); });
  byId('qr-login-start').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (isPhone() || !config?.qrLoginReady) throw new Error('QR login is unavailable on this device.');
    cancelQr();
    const attempt = await post('qr-login/start', {});
    if (!/^[a-f0-9-]{36}$/.test(attempt.id) ||
        !/^[A-Za-z0-9_-]{43}$/.test(attempt.secret) ||
        !/^[A-F0-9]{8}$/.test(attempt.code) ||
        new URL(attempt.phoneUrl).origin !== location.origin)
      throw new Error('QR login server response is invalid.');
    const active = { id: attempt.id, secret: attempt.secret, cancelled: false };
    qrActive = active;
    drawLoginQr(byId('qr-login-image'), attempt.phoneUrl);
    byId('qr-login-code').textContent = attempt.code;
    byId('qr-login-desktop').hidden = false;
    byId('qr-login-status').textContent = 'Waiting for approval on your phone (2 minutes)…';
    message('Scan the QR code using your phone camera.');
    void (async () => {
      try {
        while (!active.cancelled && Date.now() < attempt.expiresAt) {
          await new Promise(resolve => setTimeout(resolve, 2500));
          if (active.cancelled) return;
          const result = await post('qr-login/finish', { id: active.id, secret: active.secret });
          if (active.cancelled) return;
          if (result.status === 'pending') continue;
          if (!result.success || !result.user?.username) throw new Error('QR login could not be completed.');
          cancelQr();
          showUser(result.user);
          message('You are logged in using your phone passkey.');
          history.replaceState(null, '', '/account.html');
          return;
        }
        if (!active.cancelled) throw new Error('QR code expired. Request a new QR code.');
      } catch (error) {
        if (active.cancelled) return;
        cancelQr();
        message(error.message || 'QR login failed. Please try again.', true);
      }
    })();
  }));
  byId('qr-phone-approve').addEventListener('click', event => busy(event.currentTarget, async () => {
    const id = new URLSearchParams(location.search).get('qr') || '';
    if (!isPhone() || !/^[a-f0-9-]{36}$/.test(id) ||
        !config?.qrLoginReady || !window.eloPasskey || !window.PublicKeyCredential)
      throw new Error('Open a valid QR link on your phone with passkey support.');
    const label = byId('qr-phone-status');
    label.textContent = 'Confirm your phone passkey…';
    // Always require a fresh WebAuthn login for this specific approval.
    // A pre-existing session cookie is never enough.
    const result = await window.eloPasskey.signIn();
    if (!result?.user?.username) throw new Error('Phone passkey verification failed.');
    showUser(result.user);
    const code = id.slice(0, 8).toUpperCase();
    label.textContent = 'Passkey verified for ' + result.user.username + '.';
    if (!confirm('Approve logging in as ' + result.user.username +
      ' on the computer showing code ' + code + '? Only approve if you see this code on your own computer.')) {
      label.textContent = 'Computer login not approved.';
      return;
    }
    const approved = await post('qr-login/approve', { id });
    if (!approved.success || approved.username !== result.user.username)
      throw new Error('Computer approval did not complete.');
    label.textContent = 'Computer approved. You can return to your computer.';
    byId('qr-phone-approve').hidden = true;
    history.replaceState(null, '', '/account.html');
  }));
  byId('passkey-enrollment-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, async () => {
      if (!config?.passkeyReady || !window.eloPasskey || !window.PublicKeyCredential) throw new Error('Passkey enrollment is not available.');
      if (accountPasswordEnabled !== false) {
        await post('passkey/step-up', { currentPassword: byId('passkey-confirm-password').value });
        byId('passkey-confirm-password').value = '';
      }
      message('Confirm the new passkey on your device…');
      await window.eloPasskey.enroll();
      form.reset();
      message('Your passkey is registered. Test a passkey login before removing any old sign-in method.');
      await refreshPasskeyCount();
      await refreshPasswordStatus();
    });
  });
  byId('phone-transfer-start').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (!window.eloPhoneSignup?.isPhone() || !window.eloPasskey?.registerRecoveryPhone)
      throw new Error('Open your signed-in account on the new phone to register its primary passkey.');
    if (!confirm('Replace your primary passkey? This signs out all devices and invalidates all existing passkeys and recovery codes.')) return;
    message('Checking recent primary passkey verification…');
    const options = await post('passkey/phone-transfer/options', {});
    message('Create a new primary passkey on this phone…');
    const credential = await window.eloPasskey.registerRecoveryPhone(options.publicKey);
    const result = await post('passkey/phone-transfer/verify', {
      attemptId: options.attemptId, challenge: options.challenge, credential
    });
    if (!result.success) throw new Error('Phone transfer could not be completed.');
    showUser(null);
    message('Your primary phone passkey was replaced. Sign in with the new passkey and save eight new recovery codes.');
  }));
  byId('recovery-codes-generate').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (!confirm('Create eight new recovery codes? Any previously saved recovery codes will stop working.')) return;
    clearRecoveryCodes();
    const result = await post('passkey/recovery-codes/rotate', {});
    displayRecoveryCodes(result);
  }));
  byId('recovery-codes-copy').addEventListener('click', event => busy(event.currentTarget, async () => {
    await navigator.clipboard.writeText(recoveryCodeText());
    byId('recovery-codes-notice').textContent = 'Codes copied. Clear your clipboard after saving them.';
  }));
  byId('recovery-codes-download').addEventListener('click', event => busy(event.currentTarget, async () => {
    const blob = new Blob([recoveryCodeText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url; a.download = 'eloscanner-recovery-codes.txt';
      document.body.append(a); a.click(); a.remove();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    byId('recovery-codes-notice').textContent = 'Download started. Keep the file somewhere private.';
  }));
  byId('recovery-codes-dismiss').addEventListener('click', () => {
    clearRecoveryCodes();
    byId('recovery-codes-notice').textContent = 'Codes hidden. They cannot be displayed again.';
  });
  byId('remove-password-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!confirm('Remove your password permanently? Only your verified passkeys will be able to sign in.')) return;
    busy(form, async () => {
      if (!byId('remove-password-understood').checked) throw new Error('Confirm that you have tested passkey sign-in.');
      await post('passkey/remove-password', {
        currentPassword: byId('remove-password-confirm').value,
        confirm: 'REMOVE_PASSWORD'
      });
      form.reset();
      message('Password removed. Your username and account remain unchanged. Sign in using your passkey.');
      await refreshPasswordStatus();
    });
  });
  byId('delete-passkey-account-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!confirm('Permanently delete your passkey-only account and its login credentials?')) return;
    busy(form, async () => {
      if (!byId('passkey-delete-understood').checked) throw new Error('Confirm permanent deletion.');
      await post('passkey/delete-account', { confirm: 'DELETE_MY_ACCOUNT' });
      form.reset(); showUser(null); message('Your account has been deleted.');
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
    byId('passkey-login').hidden ||= !isPhone();
    byId('qr-login-start').hidden = isPhone() || !config.qrLoginReady || typeof window.qrcode !== 'function';
    const qrParam = new URLSearchParams(location.search).get('qr');
    if (qrParam && isPhone()) {
      if (!/^[a-f0-9-]{36}$/.test(qrParam) || !config.qrLoginReady)
        throw new Error('This computer login QR link is invalid or unavailable.');
      byId('qr-login-phone').hidden = false;
      byId('qr-phone-code').textContent = qrParam.slice(0, 8).toUpperCase();
      byId('qr-phone-status').textContent = 'Verify your passkey and approve only if this code matches the computer.';
    }
    if (new URLSearchParams(location.search).get('view') === 'signup') {
      byId('registration-panel').hidden = false;
      byId('signup-submit').disabled = !config.registrationOpen;
      if (!config.registrationOpen) { message('Registration is currently unavailable.'); return; }
      const current = await fetch('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' });
      const existing = current.ok ? (await current.json()).user : null;
      if (existing?.username) {
        byId('registration-preview-form').hidden = true;
        message('You are already signed in as ' + existing.username + '. Open your account and log out before creating another account.');
        return;
      }
      if (!window.eloPhoneSignup?.isPhone()) {
        byId('registration-preview-form').hidden = true;
        const handoff = byId('signup-phone-handoff');
        handoff.hidden = false;
        if (!window.eloPhoneSignup?.renderQr(byId('signup-phone-qr')))
          throw new Error('Phone signup QR code unavailable for this domain.');
        message('Scan the QR code with your phone to create an account. Registration on this computer is disabled.');
        return;
      }
      message('');
      await signupChallenge();
      return;
    }
    const session = await (window.eloAccountSession || fetch('/api/auth/get-session', { cache: 'no-store' }).then(async r => ({ available: r.ok, ...(r.ok ? await r.json() : {}) })));
    showUser(session.user || null);
    message(config.loginConfigured && session.available ? '' : 'Account services are not available yet. Registration remains closed.');
    if (!config.loginConfigured || !session.available) byId('login-form').querySelector('button').disabled = true;
  } catch (error) {
    if (new URLSearchParams(location.search).get('view') === 'signup') byId('registration-panel').hidden = false;
    message(error.message, true);
  }
})();
