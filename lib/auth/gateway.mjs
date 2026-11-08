import ipaddr from 'ipaddr.js';
import {isReservedIdentity} from '../identity.mjs';
import { createAuth } from './config.mjs';
import { keyedDigest, checkNewPassword } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';

// Argon2 reserves 32 MiB. Do not let parallel requests exhaust an isolate's
// 128 MiB memory budget. Rejected requests do not queue plaintext passwords.
let activeCredentialRequests = 0;
// Keep routine expiry cleanup out of the hot path and out of throttled requests.
let nextCleanupAt = 0;
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
// Ten actual failed password checks per Cloudflare source trigger escalating
// 10-minute increments, capped at 72 hours. All writes are atomic in D1.
export async function recordLoginFailure(db, key, now) {
  const row = await db.prepare(`INSERT INTO auth_login_lockouts(key,failures,tier,lockedUntil,updatedAt)
    VALUES (?,1,0,0,?)
    ON CONFLICT(key) DO UPDATE SET
      failures=CASE WHEN lockedUntil>? THEN failures ELSE CASE WHEN failures>=9 THEN 0 ELSE failures+1 END END,
      tier=CASE WHEN lockedUntil>? THEN tier ELSE CASE WHEN failures>=9 THEN tier+1 ELSE tier END END,
      lockedUntil=CASE WHEN lockedUntil>? THEN lockedUntil ELSE CASE WHEN failures>=9 THEN ?+MIN(tier+1,432)*600000 ELSE 0 END END,
      updatedAt=?
    RETURNING failures,tier,lockedUntil`).bind(key,now,now,now,now,now,now).first();
  return row?.lockedUntil>now ? Math.ceil((row.lockedUntil-now)/1000) : 0;
}
function loginLockReply(seconds) {
  return reply({message:'Too many incorrect passwords. Please try again later.'},429,{'Retry-After':String(seconds)});
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
  // Public registration requires an explicit production flag and Turnstile keys.
  // Missing or unexpected flag values fail closed.
  if (/^(register|signup)(\/|$)/.test(route) || (route.startsWith('sign-up/') && route !== 'sign-up/email')) return reply({ message: 'Not found.' }, 404);
  if (route === 'sign-up/email' && env.PUBLIC_SIGNUP_ENABLED !== 'true') return reply({ code: 'REGISTRATION_CLOSED', message: 'Registration is not open yet.' }, 403);
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
  if (route === 'config') return reply({ registrationOpen: configured && env.PUBLIC_SIGNUP_ENABLED === 'true' && !!env.TURNSTILE_SECRET_KEY && !!env.TURNSTILE_SITE_KEY, loginConfigured: configured, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
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
    // Never store raw IPs or usernames in abuse counters. Cloudflare has its own logs.
    const sourceKey = await keyFor('source', ip);
    if (await consumeCounter(env.AUTH_DB, sourceKey, now, 60000, 60) > 60) return reply({ message: 'Too many requests. Please wait a minute.' }, 429, { 'Retry-After': '60' });
    // Bounded housekeeping only after the source limiter. A rejected flood
    // cannot force the two extra DELETE queries on every request, and accepted
    // traffic performs cleanup at most once per five minutes per isolate.
    if (now >= nextCleanupAt) {
      nextCleanupAt = now + 300000;
      try {
        await env.AUTH_DB.prepare('DELETE FROM auth_attempts WHERE key IN (SELECT key FROM auth_attempts WHERE expiresAt<=? LIMIT 100)').bind(now).run();
        await env.AUTH_DB.prepare('DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt<=? LIMIT 100)').bind(new Date(now).toISOString()).run();
      } catch (error) { nextCleanupAt = 0; throw error; }
    }
    const data = request.method === 'POST' ? await readBody(request) : null;
    if (request.method === 'POST' && !data) return reply({ message: 'Invalid request.' }, 400);
    const auth = (services.createAuth || createAuth)(env);
    let body;
    let loginFailureKey;
    if (route === 'sign-up/email') {
      if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Registration security check unavailable.' }, 503);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply({ message: 'Use 3–24 letters, digits or underscores for your username.' }, 400);
      // A newly registered account must not impersonate official site operators.
      if (isReservedIdentity(username))
        return reply({ message: 'This username is reserved. Choose another.' }, 400);
      const signupCount = await consumeCounter(env.AUTH_DB, await keyFor('signup-source', ip), now, 3600000, 10);
      if (signupCount > 10) return reply({ message: 'Too many registration attempts. Try again later.' }, 429, { 'Retry-After': '3600' });
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
      const [loginSourceKey, failureKey] = await Promise.all([keyFor('login-source', ip), keyFor('login-failures', ip)]);
      const lock = await env.AUTH_DB.prepare('SELECT lockedUntil FROM auth_login_lockouts WHERE key=?').bind(failureKey).first();
      if (lock?.lockedUntil > now) return loginLockReply(Math.ceil((lock.lockedUntil-now)/1000));
      const sourceCount = await consumeCounter(env.AUTH_DB, loginSourceKey, now, 600000, 100);
      if (sourceCount > 100) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      // Never lock or challenge a victim based on attempts against their username
      // from another IP. Only the requesting source accumulates login penalties.
      if (sourceCount > 5) {
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
      // Remember the canonical pseudonymous source for outcome-based failure counting.
      loginFailureKey = failureKey;
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
    if (!result.ok) {
      if (route === 'sign-in/username' && (result.status === 400 || result.status === 401 || result.status === 403)) {
        const retry = await recordLoginFailure(env.AUTH_DB, loginFailureKey, now);
        if (retry) return loginLockReply(retry);
      }
      // Do not expose Better Auth's raw error bodies or internal diagnostics.
      if (route === 'sign-up/email') {
        if (result.status === 409 || result.status === 422) return safeResponse(result, { code: 'USERNAME_UNAVAILABLE', message: 'This username is unavailable. Try another username.' });
        if (result.status >= 500) return reply({ code: 'SIGNUP_UNAVAILABLE', message: 'Registration service is temporarily unavailable. Please try later.' }, 503);
        return safeResponse(result, { code: 'SIGNUP_FAILED', message: 'Account creation failed. Check your username and password, then try again.' });
      }
      return safeResponse(result, { message: route === 'sign-in/username' ? 'Username or password is incorrect.' : route === 'change-password' ? 'Password change failed. Check your current and new passwords.' : route === 'delete-user' ? 'Account deletion failed. Check your password.' : 'Account request could not be completed.' });
    }
    if (route === 'sign-in/username') {
      await env.AUTH_DB.prepare('UPDATE auth_login_lockouts SET failures=0,updatedAt=? WHERE key=?').bind(now,loginFailureKey).run();
    }
    const output = await result.json();
    if (route === 'get-session') return safeResponse(result, { user: publicUser(output?.user), expiresAt: output?.session?.expiresAt || null });
    if (route === 'sign-in/username' || route === 'sign-up/email') return safeResponse(result, { user: publicUser(output.user) });
    return safeResponse(result, { success: true });
  } catch {
    // Never serialize exception objects, request bodies, credentials or tokens.
    return reply({ message: 'Account services are temporarily unavailable. Please try again later.' }, 503);
  }
}
