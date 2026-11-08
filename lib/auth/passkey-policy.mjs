// This module is intentionally dependency-free so the public config endpoint
// does not initialize Better Auth, WebAuthn or D1 merely to show feature state.
export function passkeyConfigured(env) {
  if (env?.PASSKEY_LOGIN_ENABLED !== 'true' || typeof env?.PASSKEY_RP_ID !== 'string') return false;
  try {
    const origin = new URL(env.BETTER_AUTH_URL || 'https://eloscanner.com');
    const local = origin.hostname === 'localhost' && origin.protocol === 'http:';
    return (origin.protocol === 'https:' || local) &&
      origin.username === '' && origin.password === '' &&
      origin.pathname === '/' && origin.search === '' && origin.hash === '' &&
      origin.hostname === env.PASSKEY_RP_ID;
  } catch { return false; }
}

