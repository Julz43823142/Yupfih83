// One fail-closed security boundary for every private admin endpoint.
// Keep membership authorization on the server and re-evaluate it per request.
import ipaddr from 'ipaddr.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createAuth } from './config.mjs';
import { keyedDigest } from './password.mjs';
import { consumeCounter } from './gateway.mjs';

export const adminHeaders = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Vary': 'Cookie'
});
export const adminReply = (message, status, extra = {}) =>
  Response.json({ message }, { status, headers: { ...adminHeaders, ...extra } });

function sourceIp(request) {
  const url = new URL(request.url);
  if (url.hostname === 'localhost' && url.protocol === 'http:') return 'local-test';
  const raw = request.headers.get('CF-Connecting-IP');
  if (!raw || !ipaddr.isValid(raw)) return null;
  const parsed = ipaddr.process(raw);
  return parsed.kind() === 'ipv6'
    ? parsed.parts.slice(0, 4).map(part => part.toString(16)).join(':') + '::/64'
    : parsed.toString();
}
export async function requireAdmin({ request, env }, services = {}) {
  if (!env.AUTH_DB || typeof env.BETTER_AUTH_SECRET !== 'string' ||
      env.BETTER_AUTH_SECRET.length < 32) return adminReply('Unavailable.', 503);
  const url = new URL(request.url), origin = request.headers.get('Origin');
  // Block sibling-domain and cross-site browser contexts; support older clients
  // which do not send Fetch Metadata headers.
  const site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none'))
    return adminReply('Forbidden.', 403);
  const ip = sourceIp(request);
  if (!ip) return adminReply('Unavailable.', 503);
  try {
    const now = (services.now || Date.now)();
    const sourceKey = bytesToHex(await keyedDigest(env.BETTER_AUTH_SECRET, 'admin-source-v1', ip));
    // Atomic D1 limit, shared across Cloudflare isolates. No plaintext IP stored.
    if (await consumeCounter(env.AUTH_DB, sourceKey, now, 60000, 45) > 45)
      return adminReply('Too many requests.', 429, { 'Retry-After': '60' });
    const session = await (services.getSession || (headers => createAuth(env).api.getSession({ headers })))(request.headers);
    if (!session?.user?.id || !session?.session?.id) return adminReply('Unauthorized.', 401);
    const sessionKey = bytesToHex(await keyedDigest(env.BETTER_AUTH_SECRET, 'admin-session-v1', session.session.id));
    if (await consumeCounter(env.AUTH_DB, sessionKey, now, 60000, 40) > 40)
      return adminReply('Too many requests.', 429, { 'Retry-After': '60' });
    const row = await env.AUTH_DB.prepare('SELECT role FROM auth_member_role WHERE userId=? LIMIT 1').bind(session.user.id).first();
    if (row?.role !== 'admin') return adminReply('Forbidden.', 403);
    return { session };
  } catch {
    return adminReply('Administrator verification unavailable.', 503);
  }
}
