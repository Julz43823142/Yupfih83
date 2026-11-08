// Lightweight config endpoint: check D1 schema without initializing Better Auth or Argon2.
import { passkeyConfigured, passkeyStorageReady } from '../../../lib/auth/passkey-policy.mjs';
// This endpoint is public and must never expose secrets or database contents.
export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const base = env.BETTER_AUTH_URL || 'https://eloscanner.com';
  const origin = request.headers.get('Origin');
  const headers = {
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (url.origin !== base || (origin && origin !== base) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return Response.json({ message: 'Request not allowed.' }, { status: 403, headers });
  }
  const configured = !!env.AUTH_DB && typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32;
  return Response.json({
    registrationOpen: false,
    loginConfigured: configured,
    passkeyReady: configured && passkeyConfigured(env) && await passkeyStorageReady(env.AUTH_DB),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null
  }, { headers });
};
