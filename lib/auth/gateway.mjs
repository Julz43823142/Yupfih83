import ipaddr from 'ipaddr.js';
import { createAuth } from './config.mjs';
import { keyedDigest, checkNewPassword } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';

// Argon2 reserves 32 MiB. Do not let parallel requests exhaust an isolate's
// 128 MiB memory budget. Rejected requests do not queue plaintext passwords.
let activeCredentialRequests = 0;
const routes = new Map([
  ['get-session', 'GET'], ['sign-up/email', 'POST'], ['sign-in/username', 'POST'], ['sign-out', 'POST'],
  ['change-password', 'POST'], ['revoke-sessions', 'POST'], ['delete-user', 'POST']
]);
const securityHeaders = {
  'Cache-Control': 'no-store, private', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
function reply(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { ...securityHeaders, ...extra } });
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length')) > 8192) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}
export async function consumeCounter(db, key, now, windowMs, limit = Number.MAX_SAFE_INTEGER) {
  // Atomic UPSERT, not read-then-write: parallel requests cannot all bypass the limit.
  const row = await db.prepare(`INSERT INTO auth_attempts(key,count,expiresAt) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN expiresAt<=? THEN 1 ELSE count+1 END,
    expiresAt=CASE WHEN expiresAt<=? THEN excluded.expiresAt ELSE expiresAt END
    WHERE expiresAt<=? OR count<?
    RETURNING count,expiresAt`).bind(key, now + windowMs, now, now, now, limit).first();
  return row ? row.count : limit + 1;
}
function publicUser(user) {
  return user ? { id: user.id, username: user.username, createdAt: user.createdAt } : null;
}
function safeResponse(source, data, status = source.status) {
  const headers = new Headers(securityHeaders);
  // Preserve multiple cookie headers independently; never expose session tokens in JSON.
  for (const value of source.headers.getSetCookie()) headers.append('Set-Cookie', value);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}
export async function handleAuth({ request, env }, services = {}) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
  // Registration is unconditionally closed. No environment toggle, invitation,
  // hidden signup route, or client flag can open it. Provisioning is offline only.
  if (/^(register|signup)(\/|$)/.test(route) || (route.startsWith('sign-up/') && route !== 'sign-up/email')) return reply({ message: 'Not found.' }, 404);
  if (route === 'sign-up/email') return reply({ code: 'REGISTRATION_CLOSED', message: 'Registration is not open yet.' }, 403);
  if (route !== 'config' && !routes.has(route)) return reply({ message: 'Not found.' }, 404);
  const expectedMethod = route === 'config' ? 'GET' : routes.get(route);
  if (request.method !== expectedMethod) return reply({ message: 'Method not allowed.' }, 405, { Allow: expectedMethod });
  const base = env.BETTER_AUTH_URL || 'https://eloscanner.com';
  const origin = request.headers.get('Origin');
  if (url.origin !== base || (origin && origin !== base) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return reply({ message: 'Request not allowed.' }, 403);
  }
  if (request.method === 'POST' && origin !== base) return reply({ message: 'Request not allowed.' }, 403);
  const configured = !!env.AUTH_DB && typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32;
  if (route === 'config') return reply({ registrationOpen: false, loginConfigured: configured, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
  if (!configured) return reply({ message: 'Account services are not available yet.' }, 503);
  try {
    const now = (services.now || Date.now)();
    const fetcher = services.fetch || fetch;
    const isLocal = url.hostname === 'localhost' && url.protocol === 'http:';
    const rawIp = request.headers.get('CF-Connecting-IP');
    // Trust only Cloudflare's overwritten connecting-IP header. Collapse IPv6
    // privacy addresses to /64 and mapped IPv4 to its canonical IPv4 form.
    let ip = isLocal ? 'local-test' : null;
    if (!isLocal && rawIp && ipaddr.isValid(rawIp)) {
      const address = ipaddr.process(rawIp);
      ip = address.kind() === 'ipv6'
        ? address.parts.slice(0, 4).map(part => part.toString(16)).join(':') + '::/64'
        : address.toString();
    }
    if (!ip) return reply({ message: 'Account services are temporarily unavailable.' }, 503);
    const keyFor = async (kind, value) => bytesToHex(await keyedDigest(env.BETTER_AUTH_SECRET, `rate-${kind}`, value));
    // No raw IP or username in abuse counters. Pseudonymous counters expire after
    // at most 10 minutes; cleanup is bounded and indexed. Cloudflare has its own logs.
    await env.AUTH_DB.prepare('DELETE FROM auth_attempts WHERE key IN (SELECT key FROM auth_attempts WHERE expiresAt<=? LIMIT 100)').bind(now).run();
    await env.AUTH_DB.prepare('DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt<=? LIMIT 100)').bind(new Date(now).toISOString()).run();
    const sourceKey = await keyFor('source', ip);
    if (await consumeCounter(env.AUTH_DB, sourceKey, now, 60000, 60) > 60) return reply({ message: 'Too many requests. Please wait a minute.' }, 429, { 'Retry-After': '60' });
    const data = request.method === 'POST' ? await readBody(request) : null;
    if (request.method === 'POST' && !data) return reply({ message: 'Invalid request.' }, 400);
    const auth = (services.createAuth || createAuth)(env);
    let body;
    if (route === 'sign-up/email') {
      if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Registration security check unavailable.' }, 503);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply({ message: 'Use 3–24 letters, digits or underscores for your username.' }, 400);
      const signupCount = await consumeCounter(env.AUTH_DB, await keyFor('signup-source', ip), now, 3600000, 3);
      if (signupCount > 3) return reply({ message: 'Too many registration attempts. Try again later.' }, 429, { 'Retry-After': '3600' });
      if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) return reply({ code: 'CHALLENGE_REQUIRED', message: 'Complete the security check.' }, 403);
      const challengeResponse = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:data.turnstileToken}),signal:AbortSignal.timeout(5000) });
      if (!challengeResponse.ok) return reply({ message: 'Security check unavailable.' }, 503);
      const challenge = await challengeResponse.json();
      if (challenge.success !== true || challenge.hostname !== url.hostname || challenge.action !== 'signup') return reply({ code: 'CHALLENGE_REQUIRED', message: 'Security check failed. Try again.' }, 403);
      const error = await checkNewPassword(data.password, username, fetcher);
      if (error) return reply({ message: error }, 400);
      body = { email: crypto.randomUUID() + '@accounts.invalid', name: username, username, password: data.password.normalize('NFC') };
    } else if (route === 'sign-in/username') {
      const name = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(name) || typeof data.password !== 'string' || !data.password.length || data.password.length > 128) {
        return reply({ message: 'Username or password is incorrect.' }, 401);
      }
      const [accountKey, loginSourceKey] = await Promise.all([keyFor('account', name), keyFor('login-source', ip)]);
      const sourceCount = await consumeCounter(env.AUTH_DB, loginSourceKey, now, 600000, 30);
      if (sourceCount > 30) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      const accountCount = await consumeCounter(env.AUTH_DB, accountKey, now, 600000, 30);
      if (accountCount > 30 || sourceCount > 30) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      if (accountCount > 5 || sourceCount > 5) {
        if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Security check unavailable. Please try again later.' }, 503);
        if (typeof data.turnstileToken !== 'string' || !data.turnstileToken.length || data.turnstileToken.length > 2048) {
          return reply({ code: 'CHALLENGE_REQUIRED', message: 'Please complete the security check.' }, 403);
        }
        const check = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: data.turnstileToken }), signal: AbortSignal.timeout(5000)
        });
        if (!check.ok) return reply({ message: 'Security check unavailable.' }, 503);
        const result = await check.json();
        if (result.success !== true || result.hostname !== url.hostname || result.action !== 'login') {
          return reply({ code: 'CHALLENGE_REQUIRED', message: 'Please try the security check again.' }, 403);
        }
      }
      body = { username: name, password: data.password.normalize('NFC'), rememberMe: data.rememberMe === true };
    } else if (route === 'change-password' || route === 'delete-user') {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return reply({ message: 'Please log in.' }, 401);
      const count = await consumeCounter(env.AUTH_DB, await keyFor('sensitive', session.user.id), now, 600000, 5);
      if (count > 5) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      const current = route === 'change-password' ? data.currentPassword : data.password;
      if (typeof current !== 'string' || !current.length || current.length > 128) return reply({ message: 'Enter your current password.' }, 400);
      if (route === 'change-password') {
        const error = await checkNewPassword(data.newPassword, session.user.username, fetcher);
        if (error) return reply({ message: error }, 400);
        body = { currentPassword: current.normalize('NFC'), newPassword: data.newPassword.normalize('NFC'), revokeOtherSessions: true };
      } else body = { password: current.normalize('NFC') };
    } else if (request.method === 'POST') body = {};
    const headers = new Headers({ 'Origin': base, 'Content-Type': 'application/json' });
    if (request.headers.has('Cookie')) headers.set('Cookie', request.headers.get('Cookie'));
    // Pass only explicitly allowed fields and headers to the library.
    const internal = new Request(`${base}/api/auth/${route}`, {
      method: request.method, headers, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const expensive = ['sign-up/email', 'sign-in/username', 'change-password', 'delete-user'].includes(route);
    if (expensive && activeCredentialRequests >= 1) return reply({ code: 'AUTH_BUSY', message: 'Authentication is processing another request. Retrying shortly may help.' }, 429, { 'Retry-After': '2' });
    if (expensive) activeCredentialRequests++;
    let result;
    try { result = await auth.handler(internal); }
    finally { if (expensive) activeCredentialRequests--; }
    if (!result.ok) return safeResponse(result, { message: route === 'sign-in/username' ? 'Username or password is incorrect.' : 'Unable to complete this request. Check your password or log in again.' });
    const output = await result.json();
    if (route === 'get-session') return safeResponse(result, { user: publicUser(output?.user), expiresAt: output?.session?.expiresAt || null });
    if (route === 'sign-in/username' || route === 'sign-up/email') return safeResponse(result, { user: publicUser(output.user) });
    return safeResponse(result, { success: true });
  } catch {
    // Never serialize exception objects, request bodies, credentials or tokens.
    return reply({ message: 'Account services are temporarily unavailable. Please try again later.' }, 503);
  }
}
