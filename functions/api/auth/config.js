// Lightweight config endpoint: check D1 schema without initializing Better Auth or Argon2.
import { passkeyConfigured, passkeyStorageReady, primaryPasskeyStorageReady } from '../../../lib/auth/passkey-policy.mjs';
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
  const passkeyReady = configured && passkeyConfigured(env) && await passkeyStorageReady(env.AUTH_DB);
  // This dedicated Pages route shadows the gateway's /config route in production.
  // Keep its QR readiness contract aligned with the gateway: fail closed unless
  // both the challenge table and the atomic single-approval index exist.
  let qrLoginReady = false;
  if (passkeyReady) {
    try {
      const row = await env.AUTH_DB.prepare(
        "SELECT COUNT(*) AS ready FROM sqlite_master WHERE (type='table' AND name='auth_qr_login') OR (type='index' AND name='auth_qr_login_session_once_idx' AND tbl_name='auth_qr_login')"
      ).first();
      qrLoginReady = Number(row?.ready) === 2;
    } catch { qrLoginReady = false; }
  }
  // Match the actual auth gateway: show recovery/transfer only when their
  // primary-key guards and all four tables plus both triggers are installed.
  // A partial migration must not advertise a usable recovery route.
  const primaryReady = passkeyReady && await primaryPasskeyStorageReady(env.AUTH_DB);
  let fullRecoveryReady = false;
  if (primaryReady) {
    try {
      const row = await env.AUTH_DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE (type='table' AND name IN ('auth_recovery_code','auth_recovery_attempt','auth_primary_transfer_gate','auth_primary_phone_transfer_attempt')) OR (type='trigger' AND name IN ('auth_primary_transfer_gate_valid','auth_primary_passkey_no_user_change'))"
      ).first();
      fullRecoveryReady = Number(row?.count) === 6;
    } catch { fullRecoveryReady = false; }
  }
  let registrationOpen = false;
  if (fullRecoveryReady && env.PUBLIC_SIGNUP_ENABLED === 'true' && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY) {
    try {
      const row = await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='auth_passkey_signup_attempt'").first();
      registrationOpen = Number(row?.count) === 1;
    } catch { registrationOpen = false; }
  }
  return Response.json({
    registrationOpen,
    loginConfigured: configured,
    passkeyReady,
    qrLoginReady,
    recoveryCodesReady: fullRecoveryReady,
    phoneTransferReady: fullRecoveryReady,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null
  }, { headers });
};
