import { passkey } from '@better-auth/passkey';

// Private opt-in gate. A flag alone never enables the plugin: the operator must
// also pin the exact RP ID to the configured origin. Public signup remains off.
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

export function createPasskeyPlugin(env) {
  if (!passkeyConfigured(env)) throw new Error('Passkey origin and RP ID not configured');
  const origin = new URL(env.BETTER_AUTH_URL || 'https://eloscanner.com').origin;
  return passkey({
    rpID: env.PASSKEY_RP_ID,
    origin,
    rpName: 'EloScanner',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required'
    },
    registration: { requireSession: true }
  });
}
