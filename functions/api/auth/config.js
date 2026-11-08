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
  // Keep the origin policy unchanged. Report only a coarse rejection reason
  // so an isolated Pages preview can diagnose environment/hostname mismatches
  // without exposing secrets, tokens, or request headers.
  const denialCode = url.origin !== base ? 'URL_ORIGIN_MISMATCH'
    : origin && origin !== base ? 'HEADER_ORIGIN_MISMATCH'
    : request.headers.get('Sec-Fetch-Site') === 'cross-site' ? 'CROSS_SITE_REQUEST'
    : null;
  if (denialCode) {
    return Response.json({ message: 'Request not allowed.', code: denialCode }, { status: 403, headers });
  }
  const configured = !!env.AUTH_DB && typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32;
  return Response.json({
    registrationOpen: false,
    loginConfigured: configured,
    passkeyReady: configured && passkeyConfigured(env) && await passkeyStorageReady(env.AUTH_DB),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null
  }, { headers });
};
