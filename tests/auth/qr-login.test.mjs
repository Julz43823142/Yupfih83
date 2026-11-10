import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { createAuth } from '../../lib/auth/config.mjs';
import { handleAuth } from '../../lib/auth/gateway.mjs';

const base = 'https://eloscanner.com';
const envFor = () => ({
  AUTH_DB: database(), BETTER_AUTH_URL: base,
  BETTER_AUTH_SECRET: 'qr-login-test-secret-32-characters-minimum-12345',
  PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com',
  PUBLIC_SIGNUP_ENABLED: 'false'
});
const req = (route, data, cookie = '', origin = base) => new Request(base + '/api/auth/' + route, {
  method: data === undefined ? 'GET' : 'POST',
  headers: {
    Origin: origin, 'CF-Connecting-IP': '192.0.2.77',
    ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(cookie ? { Cookie: cookie } : {})
  },
  ...(data === undefined ? {} : { body: JSON.stringify(data) })
});
const call = (env, route, data, cookie = '', origin = base, services = {}) =>
  handleAuth({ request: req(route, data, cookie, origin), env }, services);
const cookies = response => response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');

test('QR login is unavailable without schema and public registration remains closed', async () => {
  const env = envFor();
  assert.equal((await call(env, 'config')).status, 200);
  assert.equal((await (await call(env, 'config')).json()).qrLoginReady, true);
  assert.equal((await (await call(env, 'config')).json()).registrationOpen, false);
  assert.equal((await call(env, 'sign-up/email', {})).status, 403);
  env.AUTH_DB.sqlite.exec('DROP INDEX auth_qr_login_session_once_idx');
  assert.equal((await (await call(env, 'config')).json()).qrLoginReady, false);
  assert.equal((await call(env, 'qr-login/start', {})).status, 503);
  env.AUTH_DB.sqlite.exec('DROP TABLE auth_qr_login');
  assert.equal((await (await call(env, 'config')).json()).qrLoginReady, false);
  assert.equal((await call(env, 'qr-login/start', {})).status, 503);
});

test('QR login needs fresh phone passkey, explicit approval, correct desktop secret and single redemption', async () => {
  const env = envFor();
  const auth = createAuth(env, { provision: true });
  const created = await auth.api.signUpEmail({
    body: {
      email: 'qr-test@accounts.invalid', name: 'qr_test', username: 'qr_test',
      password: 'Unique!qr!test!password!1234'
    }, asResponse: true
  });
  assert.equal(created.status, 200, await created.clone().text());
  const phoneCookie = cookies(created);
  assert.match(phoneCookie, /session_token=/);
  const session = await auth.api.getSession({ headers: new Headers({ Cookie: phoneCookie }) });
  assert.equal(session.user.username, 'qr_test');
  const started = await call(env, 'qr-login/start', {});
  assert.equal(started.status, 200, await started.clone().text());
  const qr = await started.json();
  assert.match(qr.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(qr.phoneUrl, base + '/account.html?qr=' + qr.id);
  assert.ok(!qr.phoneUrl.includes(qr.secret));
  assert.equal((await call(env, 'qr-login/finish', { id: qr.id, secret: qr.secret })).status, 202);
  assert.equal((await call(env, 'qr-login/approve', { id: qr.id })).status, 401);
  assert.equal((await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie)).status, 403);
  assert.equal((await call(env, 'qr-login/finish', { id: qr.id, secret: 'a'.repeat(43) })).status, 410);
  assert.equal((await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie, 'https://evil.example')).status, 403);
  const now = Date.now();
  // The phone proof must be issued AFTER the desktop QR was created.
  await env.AUTH_DB.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .bind(session.session.id, session.user.id, now + 1000).run();
  const approved = await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie, base, { now: () => now + 1001 });
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal((await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie)).status, 403);
  const finished = await call(env, 'qr-login/finish', { id: qr.id, secret: qr.secret });
  assert.equal(finished.status, 200, await finished.clone().text());
  assert.equal((await finished.clone().json()).user.id, session.user.id);
  const desktopCookie = cookies(finished);
  assert.match(desktopCookie, /session_token=/);
  assert.notEqual(desktopCookie, phoneCookie);
  const desktopSession = await call(env, 'get-session', undefined, desktopCookie);
  assert.equal((await desktopSession.json()).user.username, 'qr_test');
  const desktopId = (await auth.api.getSession({ headers: new Headers({ Cookie: desktopCookie }) })).session.id;
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_passkey_login_proof WHERE sessionId=?').get(desktopId).n, 0);
  assert.equal((await call(env, 'qr-login/finish', { id: qr.id, secret: qr.secret })).status, 410);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(session.user.id).n, 2);
});

test('expired QR requests cannot be approved or redeemed', async () => {
  const env = envFor();
  const now = Date.now();
  const start = await call(env, 'qr-login/start', {}, '', base, { now: () => now });
  const qr = await start.json();
  const expired = await call(env, 'qr-login/finish', { id: qr.id, secret: qr.secret }, '', base, { now: () => now + 120001 });
  assert.equal(expired.status, 410);
});

test('fresh passkey proof cannot approve an older QR or two concurrent QR requests', async () => {
  const env = envFor();
  const auth = createAuth(env, { provision: true });
  const created = await auth.api.signUpEmail({
    body: { email: 'qr-once@accounts.invalid', name: 'qr_once', username: 'qr_once',
      password: 'Unique!qr!test!password!1234' }, asResponse: true
  });
  const cookie = cookies(created);
  const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) });
  const start = 1730000000000;
  const early = await (await call(env, 'qr-login/start', {}, '', base, { now: () => start })).json();
  await env.AUTH_DB.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .bind(session.session.id, session.user.id, start - 1).run();
  assert.equal((await call(env, 'qr-login/approve', { id: early.id }, cookie, base,
    { now: () => start + 1000 })).status, 403, 'a proof from before the QR is invalid');

  await env.AUTH_DB.prepare('UPDATE auth_passkey_login_proof SET verifiedAt=? WHERE sessionId=?')
    .bind(start + 1000, session.session.id).run();
  const a = await (await call(env, 'qr-login/start', {}, '', base, { now: () => start + 1001 })).json();
  const b = await (await call(env, 'qr-login/start', {}, '', base, { now: () => start + 1001 })).json();
  assert.equal((await call(env, 'qr-login/approve', { id: a.id }, cookie, base,
    { now: () => start + 1002 })).status, 403, 'proof must follow each QR request');
  const earlierApproved = await call(env, 'qr-login/approve', { id: early.id }, cookie, base,
    { now: () => start + 1002 });
  assert.equal(earlierApproved.status, 200, await earlierApproved.clone().text());

  await env.AUTH_DB.prepare('UPDATE auth_passkey_login_proof SET verifiedAt=? WHERE sessionId=?')
    .bind(start + 2000, session.session.id).run();
  const two = await Promise.all([a, b].map(qr => call(env, 'qr-login/approve', { id: qr.id }, cookie, base,
    { now: () => start + 2001 })));
  assert.ok(two.every(result => result.status !== 200), 'a passkey session is single-use even if proof is refreshed');
  assert.equal(env.AUTH_DB.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM auth_qr_login WHERE approvedSessionId=?').get(session.session.id).n, 1);
});

test('desktop cancellation invalidates both pending and approved QR requests', async () => {
  const env = envFor();
  const pending = await (await call(env, 'qr-login/start', {})).json();
  assert.equal((await call(env, 'qr-login/cancel', { id: pending.id, secret: 'z'.repeat(43) })).status, 410);
  assert.equal((await call(env, 'qr-login/cancel', { id: pending.id, secret: pending.secret })).status, 200);
  assert.equal((await call(env, 'qr-login/finish', { id: pending.id, secret: pending.secret })).status, 410);
  assert.equal((await call(env, 'qr-login/cancel', { id: pending.id, secret: pending.secret })).status, 410);
  assert.equal((await call(env, 'qr-login/cancel', { id: pending.id, secret: pending.secret }, '',
    'https://evil.example')).status, 403);

  const auth = createAuth(env, { provision: true });
  const created = await auth.api.signUpEmail({
    body: { email: 'qr-cancel@accounts.invalid', name: 'qr_cancel', username: 'qr_cancel',
      password: 'Unique!qr!test!password!1234' }, asResponse: true
  });
  const cookie = cookies(created);
  const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) });
  const baseTime = Date.now();
  const approvedQr = await (await call(env, 'qr-login/start', {}, '', base,
    { now: () => baseTime })).json();
  await env.AUTH_DB.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .bind(session.session.id, session.user.id, baseTime + 1000).run();
  assert.equal((await call(env, 'qr-login/approve', { id: approvedQr.id }, cookie, base,
    { now: () => baseTime + 1001 })).status, 200);
  assert.equal((await call(env, 'qr-login/cancel',
    { id: approvedQr.id, secret: approvedQr.secret })).status, 200);
  assert.equal((await call(env, 'qr-login/finish',
    { id: approvedQr.id, secret: approvedQr.secret })).status, 410);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?')
    .get(session.user.id).n, 1, 'no desktop session was created');
});
