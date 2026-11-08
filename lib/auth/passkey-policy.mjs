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


// Defensive rollout guard: an enable flag must not break legacy authentication
// when the additive D1 migration has not been applied yet.
export async function passkeyStorageReady(db) {
  if (!db || typeof db.prepare !== 'function') return false;
  try {
    const row = await db.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('passkey','auth_passkey_stepup')"
    ).first();
    return Number(row?.count) === 2;
  } catch {
    return false;
  }
}
