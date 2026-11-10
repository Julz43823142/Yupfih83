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
  await env.AUTH_DB.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .bind(session.session.id, session.user.id, now).run();
  const approved = await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie);
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal((await call(env, 'qr-login/approve', { id: qr.id }, phoneCookie)).status, 409);
  const direct = await createAuth(env).api.completeVerifiedQrLogin({
    body: { userId: session.user.id }, headers: new Headers({ Origin: base }), asResponse: true
  });
  assert.equal(direct.status, 200, 'Direct verified QR session: ' + await direct.clone().text());
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
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(session.user.id).n, 3);
});

test('expired QR requests cannot be approved or redeemed', async () => {
  const env = envFor();
  const now = Date.now();
  const start = await call(env, 'qr-login/start', {}, '', base, { now: () => now });
  const qr = await start.json();
  const expired = await call(env, 'qr-login/finish', { id: qr.id, secret: qr.secret }, '', base, { now: () => now + 120001 });
  assert.equal(expired.status, 410);
});
