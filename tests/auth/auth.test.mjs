import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../../lib/auth/config.mjs';
import { onRequestGet as getPublicAuthConfig } from '../../functions/api/auth/config.js';
import { handleAuth, consumeCounter } from '../../lib/auth/gateway.mjs';
import { passwordFunctions, checkNewPassword } from '../../lib/auth/password.mjs';
import { database } from './fixture.mjs';
import { createSignupAttempt, consumeSignupAttempt, generateSignupChallenge, signupSourceDigest } from '../../lib/auth/passkey-signup-attempt.mjs';
import { passkeyConfigured, createPasskeyPlugin } from '../../lib/auth/passkeys.mjs';
const secret = 'synthetic-test-only-secret-with-over-32-characters';
const password = 'Orchard!violet!planet!73519';
const envFor = () => ({ AUTH_DB: database(), BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://eloscanner.com', TURNSTILE_SITE_KEY: 'public-test-site-key', TURNSTILE_SECRET_KEY: 'test-secret' });
function req(route, body, cookie, extra = {}) {
  return new Request(`https://eloscanner.com/api/auth/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://eloscanner.com', 'CF-Connecting-IP': '192.0.2.1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function cookie(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
async function provision(env, username = 'johan') {
  const auth = createAuth(env, { provision: true });
  await auth.api.signUpEmail({ body: { email: `${crypto.randomUUID()}@accounts.invalid`, name: username, username, password } });
}
const safeLookup = async () => new Response('0'.repeat(35) + ':0');

test('Argon2id: random salts, correct verification, pepper separation, bounded hash parameters', async () => {
  const p = passwordFunctions(secret);
  const start = performance.now();
  const a = await p.hash(password); const b = await p.hash(password);
  console.log(`Argon2id 32MiB/3 passes: ${Math.round((performance.now() - start) / 2)} ms per hash (Node, not Workers CPU)`);
  assert.notEqual(a, b); assert.ok(!a.includes(password));
  assert.equal(await p.verify({ password, hash: a }), true);
  assert.equal(await p.verify({ password: password + 'x', hash: a }), false);
  assert.equal(await passwordFunctions(secret + 'x').verify({ password, hash: a }), false);
  assert.equal(await p.verify({ password, hash: a.replace('m=32768', 'm=9999999') }), false);
});
test('Registration and unneeded library routes fail closed even without configuration', async () => {
  for (const route of ['sign-up/email', 'sign-up/email/']) {
    const result = await handleAuth({ request: req(route, { username: 'johan', password }), env: {} });
    assert.equal(result.status, 403);
  }
  for (const route of ['register', 'signup', 'sign-in/email', 'request-password-reset', 'reset-password', 'update-user', 'sign-up%2femail', 'admin/create-user']) {
    assert.equal((await handleAuth({ request: req(route, {}), env: {} })).status, 404);
  }
  const env = envFor();
  const direct = await createAuth(env).handler(req('sign-up/email', { email: 'a@example.com', name: 'a', password }));
  assert.ok(direct.status >= 400);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM user').get().c, 0);
});
test('passkey requires exact operator-approved HTTPS RP ID and strong user verification', () => {
  const env = { BETTER_AUTH_URL: 'https://eloscanner.com', PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com' };
  assert.equal(passkeyConfigured(env), true);
  const configured = createPasskeyPlugin(env);
  assert.equal(configured.id, 'passkey');
  assert.equal(configured.options.authenticatorSelection.userVerification, 'required');
  assert.equal(configured.options.authenticatorSelection.residentKey, 'required');
  for (const changes of [
    { PASSKEY_LOGIN_ENABLED: 'false' },
    { PASSKEY_RP_ID: 'evil.example' },
    { BETTER_AUTH_URL: 'http://eloscanner.com' },
    { BETTER_AUTH_URL: 'https://eloscanner.com.evil.example' },
    { BETTER_AUTH_URL: 'https://eloscanner.com/other' },
    { BETTER_AUTH_URL: 'https://user:pass@eloscanner.com' }
  ]) assert.equal(passkeyConfigured({ ...env, ...changes }), false);
  assert.equal(passkeyConfigured({ ...env, BETTER_AUTH_URL: 'http://localhost:8788', PASSKEY_RP_ID: 'localhost' }), true);
});
test('passkey APIs remain closed by default and when the RP origin mismatches', async () => {
  for (const env of [envFor(), { ...envFor(), PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'evil.example' }]) {
    for (const path of [
      'passkey/step-up', 'passkey/generate-register-options', 'passkey/verify-registration',
      'passkey/generate-authenticate-options', 'passkey/verify-authentication',
      'passkey/list-user-passkeys', 'passkey/delete-passkey', 'passkey/update-passkey', 'sign-in/passkey'
    ]) {
      const body = path === 'passkey/step-up' || path.includes('verify') ? {} : undefined;
      const response = await handleAuth({ request: req(path, body), env });
      assert.equal(response.status, 404, path);
    }
  }
});
test('passkey feature flag does not break existing logins before D1 migration', async () => {
  const env = envFor();
  await provision(env, 'legacy_survivor');
  env.AUTH_DB.sqlite.exec('DROP TABLE auth_passkey_stepup; DROP TABLE passkey;');
  env.PASSKEY_LOGIN_ENABLED = 'true';
  env.PASSKEY_RP_ID = 'eloscanner.com';
  const configuration = await handleAuth({ request: req('config'), env });
  assert.equal(configuration.status, 200);
  assert.equal((await configuration.json()).passkeyReady, false);
  const blocked = await handleAuth({ request: req('passkey/generate-authenticate-options'), env });
  assert.equal(blocked.status, 404);
  const login = await handleAuth({
    request: req('sign-in/username', { username: 'legacy_survivor', password }), env
  });
  assert.equal(login.status, 200, await login.clone().text());
  assert.equal((await login.json()).user.username, 'legacy_survivor');
});
test('preview passkey gateway denies unapproved management and malformed proofs', async () => {
  const env = envFor(); env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
  for (const route of ['passkey/delete-passkey', 'passkey/update-passkey', 'sign-in/passkey']) {
    const result = await handleAuth({ request: req(route, { id: 'other-user-key' }), env });
    assert.equal(result.status, 404, route);
  }
  assert.equal((await handleAuth({ request: req('passkey/list-user-passkeys'), env })).status, 401);
  assert.equal((await handleAuth({ request: req('passkey/verify-authentication', {}), env })).status, 400);
  assert.equal((await handleAuth({
    request: req('passkey/verify-authentication', { response: {} }, null, { Origin: 'https://attacker.example' }), env
  })).status, 403);
  assert.equal((await handleAuth({
    request: req('passkey/step-up', { currentPassword: 'some-password' }), env
  })).status, 401);
});
test('changing a password invalidates all unconsumed passkey enrollment grants', async () => {
  const env = envFor(); env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
  await provision(env, 'password_owner');
  const login = await handleAuth({ request: req('sign-in/username', { username: 'password_owner', password }), env });
  assert.equal(login.status, 200);
  const c = cookie(login);
  const call = (route, body) => handleAuth({ request: req(route, body, c), env }, { fetch: safeLookup });
  assert.equal((await call('passkey/step-up', { currentPassword: password })).status, 200);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM auth_passkey_stepup').get().c, 1);
  const changed = await call('change-password', { currentPassword: password, newPassword: password + '-changed' });
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM auth_passkey_stepup').get().c, 0);
  // Better Auth may revoke the prior session during password rotation (401).
  // A retained session with its step-up revoked yields 403. Neither may enroll.
  assert.ok([401, 403].includes((await call('passkey/generate-register-options')).status));
});
test('WebAuthn challenges and verification attempts are independently rate-limited', async () => {
  for (const [route, max, payload] of [
    ['passkey/generate-authenticate-options', 20, undefined],
    ['passkey/verify-authentication', 30, { response: { id: 'synthetic' } }]
  ]) {
    const env = envFor(); env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
    let reached = 0;
    const services = { createAuth: () => ({ handler: async () => {
      reached++;
      return Response.json({ challenge: 'fixture', user: { id: 'fixture', username: 'fixture' } });
    } }) };
    for (let i = 0; i < max; i++) {
      const response = await handleAuth({ request: req(route, payload), env }, services);
      assert.equal(response.status, 200, `${route} request ${i + 1}`);
    }
    const denied = await handleAuth({ request: req(route, payload), env }, services);
    assert.equal(denied.status, 429, route);
    assert.equal(reached, max, 'blocked requests must never reach WebAuthn verification');
    assert.equal(denied.headers.get('Retry-After'), '60');
  }
});
test('legacy password confirmation authorizes one WebAuthn registration challenge on the same account', async () => {
  const env = envFor(); env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
  await provision(env, 'sharkmeister');
  const login = await handleAuth({ request: req('sign-in/username', { username: 'sharkmeister', password }), env });
  assert.equal(login.status, 200);
  const c = cookie(login);
  const call = (route, body) => handleAuth({ request: req(route, body, c), env });
  const noProof = await call('passkey/generate-register-options');
  assert.equal(noProof.status, 403);
  assert.equal((await call('passkey/step-up', { currentPassword: 'incorrect' })).status, 403);
  assert.equal((await call('passkey/step-up', { currentPassword: password })).status, 200);
  const options = await call('passkey/generate-register-options');
  assert.equal(options.status, 200, await options.clone().text());
  const challenge = await options.json();
  assert.equal(typeof challenge.challenge, 'string');
  assert.equal(challenge.rp.id, 'eloscanner.com');
  assert.equal(challenge.user.name, 'sharkmeister');
  assert.equal(challenge.user.displayName, 'sharkmeister');
  assert.ok(!JSON.stringify(challenge).includes('@accounts.invalid'));
  assert.equal(challenge.authenticatorSelection.userVerification, 'required');
  assert.equal((await call('passkey/generate-register-options')).status, 403);
  const session = await call('get-session');
  assert.equal((await session.json()).user.username, 'sharkmeister');
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM passkey').get().c, 0);
});
test('passkey enrollment proof cannot be reused in another session or after logout', async () => {
  const env = envFor(); env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
  await provision(env, 'session_owner');
  const login = async () => {
    const result = await handleAuth({ request: req('sign-in/username', { username: 'session_owner', password }), env });
    assert.equal(result.status, 200);
    return cookie(result);
  };
  const ownerCookie = await login();
  const otherCookie = await login();
  const call = (route, body, c) => handleAuth({ request: req(route, body, c), env });
  assert.equal((await call('passkey/step-up', { currentPassword: password }, ownerCookie)).status, 200);
  assert.equal((await call('passkey/generate-register-options', undefined, otherCookie)).status, 403);
  assert.equal((await call('passkey/generate-register-options', undefined, ownerCookie)).status, 200);
  assert.equal((await call('passkey/generate-register-options', undefined, ownerCookie)).status, 403);
  assert.equal((await call('passkey/step-up', { currentPassword: password }, ownerCookie)).status, 200);
  assert.equal((await call('sign-out', {}, ownerCookie)).status, 200);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM auth_passkey_stepup').get().c, 0);
  assert.equal((await call('passkey/generate-register-options', undefined, ownerCookie)).status, 401);
});
test('public registration remains closed even if a legacy flag is set', async () => {
  const env = envFor(); env.PUBLIC_SIGNUP_ENABLED = 'true'; env.PASSKEY_LOGIN_ENABLED = 'true'; env.PASSKEY_RP_ID = 'eloscanner.com';
  const signup = await handleAuth({ request: req('sign-up/email', { username: 'test_user', password }), env });
  assert.equal(signup.status, 403);
  assert.equal((await signup.json()).code, 'REGISTRATION_CLOSED');
  const config = await handleAuth({ request: req('config'), env });
  assert.equal((await config.json()).registrationOpen, true); // Only passkey signup is open; password signup stays closed.
  const direct = await createAuth(env).handler(req('sign-up/email', { email: 'test@accounts.invalid', username: 'test_user', password }));
  assert.ok(direct.status >= 400);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM user').get().c, 0);
});
test('passkey preparation preserves existing accounts and enforces credential ownership', async () => {
  const env = envFor(); await provision(env, 'sharkmeister');
  const user = env.AUTH_DB.sqlite.prepare('SELECT id FROM user WHERE username=?').get('sharkmeister');
  assert.ok(user?.id);
  const insert = (id, credentialID, userId = user.id) => env.AUTH_DB.sqlite.prepare(
    'INSERT INTO passkey (id,publicKey,userId,credentialID,counter,deviceType,backedUp) VALUES (?,?,?,?,?,?,?)'
  ).run(id, 'test-public-key', userId, credentialID, 0, 'singleDevice', 0);
  insert('pk-1', 'credential-1');
  assert.throws(() => insert('pk-2', 'credential-1'));
  assert.throws(() => insert('pk-3', 'credential-3', 'nonexistent-user'));
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM passkey WHERE userId=?').get(user.id).c, 1);
  // Database invariants must hold even if a future handler forgets the limit.
  for (let i = 2; i <= 5; i++) insert('pk-' + i, 'credential-' + i);
  assert.throws(() => insert('pk-6', 'credential-6'), /passkey limit reached/);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM passkey WHERE userId=?').get(user.id).c, 5);
  await provision(env, 'another_user');
  const other = env.AUTH_DB.sqlite.prepare('SELECT id FROM user WHERE username=?').get('another_user');
  assert.throws(() => env.AUTH_DB.sqlite.prepare('UPDATE passkey SET userId=? WHERE id=?').run(other.id, 'pk-1'), /passkey owner cannot change/);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT userId FROM passkey WHERE id=?').get('pk-1').userId, user.id);
  env.AUTH_DB.sqlite.prepare('DELETE FROM passkey WHERE id=?').run('pk-5');
  insert('pk-6', 'credential-6');
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM passkey WHERE userId=?').get(user.id).c, 5);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT username FROM user WHERE id=?').get(user.id).username, 'sharkmeister');
  env.AUTH_DB.sqlite.prepare('DELETE FROM user WHERE id=?').run(user.id);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM passkey').get().c, 0);
});
test('origin/method/body guards reject cross-site and oversized requests', async () => {
  const env = envFor();
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await handleAuth({ request: req('sign-in/username', {}, null, headers), env })).status, 403);
  }
  assert.equal((await handleAuth({ request: req('sign-in/username'), env })).status, 405);
  assert.equal((await handleAuth({ request: req('sign-in/username', { password: 'x'.repeat(9000) }), env })).status, 400);
});
test('real D1 adapter: login, isolation, secure cookies, no raw token/email/IP disclosure, logout', async () => {
  const env = envFor(); await provision(env); await provision(env, 'other_user');
  const call = (route, body, cookies) => handleAuth({ request: req(route, body, cookies), env });
  assert.equal((await call('sign-in/username', { username: 'johan', password: 'wrong' })).status, 401);
  const login = await call('sign-in/username', { username: 'JOHAN', password, rememberMe: true });
  assert.equal(login.status, 200, await login.clone().text());
  const content = await login.clone().text(); assert.ok(!content.includes('token')); assert.ok(!content.includes('@'));
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i); assert.match(login.headers.get('set-cookie'), /Secure/i); assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
  for (const header of login.headers.getSetCookie()) {
    assert.match(header, /^__Host-eloscanner\./);
    assert.match(header, /; Secure(?:;|$)/i);
    assert.match(header, /; Path=\/(?:;|$)/i);
    assert.doesNotMatch(header, /; Domain=/i);
  }
  const c = cookie(login);
  assert.equal((await (await call('get-session', undefined, c.replaceAll('__Host-', '__Secure-'))).json()).user, null);
  const session = await (await call('get-session', undefined, c)).json(); assert.equal(session.user.username, 'johan');
  assert.equal((await (await call('get-session')).json()).user, null);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT ipAddress FROM session LIMIT 1').get().ipAddress, null);
  await call('sign-out', {}, c);
  assert.equal((await (await call('get-session', undefined, c)).json()).user, null);
});
test('atomic counters and Turnstile gate before password hashing, hard limit survives solved challenges', async () => {
  const env = envFor(); let now = Date.now();
  const counts = await Promise.all(Array.from({ length: 12 }, () => consumeCounter(env.AUTH_DB, 'parallel', now, 1000)));
  assert.deepEqual(counts.sort((a,b) => a-b), Array.from({ length: 12 }, (_,i) => i+1));
  let hashed = 0;
  const stub = () => ({ handler: async () => { hashed++; return Response.json({}, { status: 401 }); } });
  const services = { now: () => now, createAuth: stub, fetch: async () => Response.json({ success: true, hostname: 'eloscanner.com', action: 'login' }) };
  const login = token => handleAuth({ request: req('sign-in/username', { username: 'unknown_user', password, turnstileToken: token }), env }, services);
  for (let i=0;i<5;i++) assert.equal((await login()).status, 401);
  const sixth = await login(); assert.equal(sixth.status, 403); assert.equal((await sixth.json()).code, 'CHALLENGE_REQUIRED'); assert.equal(hashed, 5);
  const wrongHost = await handleAuth({ request: req('sign-in/username', { username: 'unknown_user', password, turnstileToken: 'token' }), env }, { ...services, fetch: async () => Response.json({ success: true, hostname: 'evil.example', action: 'login' }) });
  assert.equal(wrongHost.status, 403); assert.equal(hashed, 5);
  for (let i=0;i<23;i++) await login('solved');
  assert.equal((await login('solved')).status, 429);
  now += 600001; assert.equal((await login()).status, 401);
  const stored = JSON.stringify(env.AUTH_DB.sqlite.prepare('SELECT * FROM auth_attempts').all()); assert.ok(!stored.includes('192.0.2.1')); assert.ok(!stored.includes('unknown_user'));
});
test('breached password checks never transmit full password/hash, fail closed on outage', async () => {
  assert.ok(await checkNewPassword('short'));
  let captured;
  const digest = Buffer.from(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))).toString('hex').toUpperCase();
  assert.ok(await checkNewPassword(password, '', async url => { captured=url; return new Response(digest.slice(5) + ':12'); }));
  assert.equal(captured, 'https://api.pwnedpasswords.com/range/' + digest.slice(0,5));
  await assert.rejects(checkNewPassword(password, '', async () => new Response('', { status: 503 })));
});
test('password changes verify current password, reject breach, revoke other sessions; deletion requires password', async () => {
  const env = envFor(); await provision(env);
  const call = (route, body, c) => handleAuth({ request: req(route, body, c), env }, { fetch: safeLookup });
  const c1 = cookie(await call('sign-in/username', { username: 'johan', password }));
  const c2 = cookie(await call('sign-in/username', { username: 'johan', password }));
  assert.equal((await call('change-password', { currentPassword: 'wrong', newPassword: password + 'new' }, c1)).status, 400);
  assert.equal((await call('change-password', { currentPassword: password, newPassword: password + 'new' }, c1)).status, 200);
  assert.equal((await (await call('get-session', undefined, c2)).json()).user, null);
  const latest = await call('sign-in/username', { username: 'johan', password: password + 'new' });
  assert.equal(latest.status, 200); const c3=cookie(latest);
  assert.ok((await call('delete-user', { password: 'wrong' }, c3)).status >= 400);
  assert.equal((await call('delete-user', { password: password + 'new' }, c3)).status, 200);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM user').get().c, 0);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM account').get().c, 0);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM session').get().c, 0);
});

test('logout everywhere, cookie tampering and absolute expiry cannot reuse sessions', async () => {
  const env = envFor(); await provision(env);
  const call = (route, body, c) => handleAuth({ request: req(route, body, c), env });
  const a = cookie(await call('sign-in/username', { username: 'johan', password }));
  const b = cookie(await call('sign-in/username', { username: 'johan', password }));
  assert.equal((await (await call('get-session', undefined, a.replace('=', '=tampered'))).json()).user, null);
  assert.equal((await call('revoke-sessions', {}, a)).status, 200);
  for (const c of [a,b]) assert.equal((await (await call('get-session', undefined, c)).json()).user, null);
  const c = cookie(await call('sign-in/username', { username: 'johan', password }));
  env.AUTH_DB.sqlite.prepare('UPDATE session SET expiresAt=?').run('2000-01-01T00:00:00.000Z');
  assert.equal((await (await call('get-session', undefined, c)).json()).user, null);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) c FROM session').get().c, 0);
});
test('concurrent expensive credential work is bounded before hashing', async () => {
  const env = envFor(); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const services = { createAuth: () => ({ handler: async () => { entered(); await pending; return Response.json({}, { status: 401 }); } }) };
  const one = handleAuth({ request: req('sign-in/username', { username: 'test_one', password }), env }, services);
  await ready;
  const two = await handleAuth({ request: req('sign-in/username', { username: 'test_two', password }), env }, services);
  assert.equal(two.status, 429);
  release(); assert.equal((await one).status, 401);
});
test('forged session, injection fields and malicious Turnstile responses cannot grant access',async()=>{
 const env=envFor();await provision(env);
 const signIn={username:'johan',password, userId:'victim', role:'admin', email:'attacker@example.com',callbackURL:'https://evil.example'};
 const response=await handleAuth({request:req('sign-in/username',signIn),env});
 assert.equal(response.status,200);assert.equal(response.headers.get('Location'),null);
 const user=(await response.json()).user;assert.equal(user.username,'johan');assert.notEqual(user.id,'victim');assert.equal(user.role,undefined);assert.equal(user.email,undefined);
 const forged=await handleAuth({request:req('get-session',undefined,'__Secure-eloscanner.session_token=forged'),env});
 assert.equal((await forged.json()).user,null);
 for(let i=0;i<5;i++)await handleAuth({request:req('sign-in/username',{username:'unused',password:'incorrect'}),env},{createAuth:()=>({handler:async()=>Response.json({}, {status:401})})});
 for(const result of [{success:true,hostname:'eloscanner.com',action:'register'},{success:false,hostname:'eloscanner.com',action:'login'}]){
  let reached=false;
  const check=await handleAuth({request:req('sign-in/username',{username:'unused',password,turnstileToken:'replayed-or-wrong-action'}),env},{fetch:async()=>Response.json(result),createAuth:()=>({handler:async()=>{reached=true;return Response.json({});}})});
  assert.equal(check.status,403);assert.equal(reached,false);
 }
});


test('new login sessions expire after 30 days, not seven', async () => {
  const env = envFor();
  await provision(env);
  const before = Date.now();
  const response = await handleAuth({
    request: req('sign-in/username', { username: 'johan', password, rememberMe: true }),
    env
  });
  assert.equal(response.status, 200);
  const sessionCookie = cookie(response);
  const sessionResponse = await handleAuth({
    request: req('get-session', undefined, sessionCookie),
    env
  });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.user.username, 'johan');
  const expiry = new Date(session.expiresAt).getTime();
  const dbExpiry = env.AUTH_DB.sqlite.prepare('SELECT expiresAt FROM session ORDER BY createdAt DESC LIMIT 1').get()?.expiresAt;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  assert.ok(expiry >= before + thirtyDays - 60_000, `session should last approximately 30 days; actual=${session.expiresAt}, db=${dbExpiry}, days=${(expiry - before) / 86400000}`);
  assert.ok(expiry <= Date.now() + thirtyDays + 60_000, 'session must not exceed 30 days');
});


test('phone-first signup attempts cannot be replayed or create accounts on their own', () => {
  const db = database().sqlite;
  const created = Date.now();
  db.prepare('INSERT INTO auth_passkey_signup_attempt(id, username, challengeDigest, expiresAt, createdAt, sourceDigest) VALUES (?,?,?,?,?,?)')
    .run('attempt-1', 'test_phone', 'challenge-digest-1', created + 120_000, created, 'source-digest');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM user').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM auth_passkey_signup_attempt').get().c, 1);
  db.prepare('UPDATE auth_passkey_signup_attempt SET consumedAt=? WHERE id=? AND consumedAt IS NULL AND expiresAt>?')
    .run(created + 1, 'attempt-1', created);
  assert.throws(() => db.prepare('UPDATE auth_passkey_signup_attempt SET consumedAt=NULL WHERE id=?').run('attempt-1'));
  assert.throws(() => db.prepare('INSERT INTO auth_passkey_signup_attempt(id, username, challengeDigest, expiresAt, createdAt, sourceDigest) VALUES (?,?,?,?,?,?)')
    .run('attempt-2', 'test_phone', 'challenge-digest-1', created + 120_000, created, 'source-digest'));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM user').get().c, 0);
});

test('signup attempts are bound to a challenge and source, expire and are single-use', async () => {
  const db = database();
  const sourceDigest = 'a'.repeat(64);
  const challenge = 'challenge-'.repeat(8);
  const now = 1_700_000_000_000;
  const first = await createSignupAttempt(db, secret, { username: 'phoneuser', challenge, sourceDigest }, now);
  assert.equal(await consumeSignupAttempt(db, secret, { id: first.id, challenge: 'wrong-'.repeat(8), sourceDigest }, now + 1), null);
  assert.equal(await consumeSignupAttempt(db, secret, { id: first.id, challenge, sourceDigest: 'b'.repeat(64) }, now + 1), null);
  assert.equal(await consumeSignupAttempt(db, secret, { id: first.id, challenge, sourceDigest }, now + 1), 'phoneuser');
  assert.equal(await consumeSignupAttempt(db, secret, { id: first.id, challenge, sourceDigest }, now + 2), null);
  const second = await createSignupAttempt(db, secret, { username: 'phoneuser', challenge: 'second-'.repeat(8), sourceDigest }, now);
  assert.equal(await consumeSignupAttempt(db, secret, { id: second.id, challenge: 'second-'.repeat(8), sourceDigest }, now + 120_000), null);
  await assert.rejects(() => createSignupAttempt(db, secret, { username: 'bad name', challenge, sourceDigest }, now));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM user').get().c, 0);
});


test('signup attempt quota is enforced by SQLite even for simultaneous sources', async () => {
  const db = database();
  const now = 1_700_000_000_000;
  const sourceDigest = 'c'.repeat(64);
  for (let i = 0; i < 5; i++) {
    await createSignupAttempt(db, secret, {
      username: 'phoneuser', challenge: 'challenge-' + String(i).repeat(40), sourceDigest
    }, now);
  }
  await assert.rejects(() => createSignupAttempt(db, secret, {
    username: 'phoneuser', challenge: 'challenge-' + '9'.repeat(40), sourceDigest
  }, now));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM auth_passkey_signup_attempt').get().c, 5);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM user').get().c, 0);
});

test('signup challenges use 256-bit randomness and source identifiers are pseudonymous', async () => {
  const first = generateSignupChallenge();
  const second = generateSignupChallenge();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  const a = await signupSourceDigest(secret, '192.0.2.1');
  const b = await signupSourceDigest(secret, '192.0.2.2');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(a, await signupSourceDigest(secret, '192.0.2.1'));
  assert.notEqual(a, await signupSourceDigest(secret + '-other', '192.0.2.1'));
});

test('phone-first signup options require rollout flag and verified Turnstile; create no account', async () => {
  const env = { ...envFor(), PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com' };
  const request = () => req('passkey-signup/options', { username: 'new_phone_user', turnstileToken: 'verified-token' });
  assert.equal((await handleAuth({ request: request(), env })).status, 404);
  env.PUBLIC_SIGNUP_ENABLED = 'true';
  const denied = await handleAuth({ request: request(), env }, { fetch: async () => Response.json({ success: false }) });
  assert.equal(denied.status, 403);
  const services = { fetch: async () => Response.json({ success: true, hostname: 'eloscanner.com', action: 'signup' }) };
  const response = await handleAuth({ request: request(), env }, services);
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.match(data.publicKey.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(data.publicKey.rp.id, 'eloscanner.com');
  assert.equal(Buffer.from(data.publicKey.user.id, 'base64url').toString('utf8'), data.attemptId);
  assert.deepEqual(data.publicKey.hints, ['client-device']);
  assert.equal(data.publicKey.authenticatorSelection.authenticatorAttachment, 'platform');
  assert.equal(data.publicKey.authenticatorSelection.userVerification, 'required');
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_passkey_signup_attempt').get().n, 1);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n, 0);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get().n, 0);
  assert.equal((await handleAuth({ request: req('passkey-signup/verify', {}), env })).status, 400); // Enabled route rejects malformed attestation.
});

test('passkey signup commits account and credential atomically, rejects replay and duplicate credentials', async () => {
  const env = { ...envFor(), PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com', PUBLIC_SIGNUP_ENABLED: 'true' };
  let credentialId = 'test-credential-unique';
  const services = {
    fetch: async () => Response.json({ success: true, hostname: 'eloscanner.com', action: 'signup' }),
    verifyRegistrationResponse: async () => ({
      verified: true,
      registrationInfo: {
        credential: { id: credentialId, publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0 },
        credentialDeviceType: 'multiDevice', credentialBackedUp: true
      }
    })
  };
  const start = async username => {
    const response = await handleAuth({ request: req('passkey-signup/options', { username, turnstileToken: 'test' }), env }, services);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const verify = options => handleAuth({ request: req('passkey-signup/verify', {
    attemptId: options.attemptId, challenge: options.publicKey.challenge, credential: { id: credentialId }
  }), env }, services);
  const first = await start('phone_first');
  const success = await verify(first);
  assert.equal(success.status, 201, await success.clone().text());
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n, 1);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n, 1);
  assert.equal((await verify(first)).status, 403);
  const second = await start('phone_second');
  assert.equal((await verify(second)).status, 409);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n, 1);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n, 1);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT consumedAt FROM auth_passkey_signup_attempt WHERE id=?').get(second.attemptId).consumedAt, null);
  credentialId = 'test-credential-second';
  assert.equal((await verify(second)).status, 201);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n, 2);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n, 2);
});

test('public config enables phone signup only with rollout, Turnstile and migration, and rejects foreign origins', async () => {
  const env = { ...envFor(), PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com' };
  const get = async (request = req('config')) => getPublicAuthConfig({ request, env }).then(async response => ({ status: response.status, body: await response.json() }));
  assert.equal((await get()).body.registrationOpen, false);
  env.PUBLIC_SIGNUP_ENABLED = 'true';
  assert.equal((await get()).body.registrationOpen, true);
  delete env.TURNSTILE_SECRET_KEY;
  assert.equal((await get()).body.registrationOpen, false);
  env.TURNSTILE_SECRET_KEY = 'test-secret';
  delete env.TURNSTILE_SITE_KEY;
  assert.equal((await get()).body.registrationOpen, false);
  env.TURNSTILE_SITE_KEY = 'public-test-site-key';
  env.AUTH_DB.sqlite.exec('DROP TABLE auth_passkey_signup_attempt');
  assert.equal((await get()).body.registrationOpen, false);
  const foreign = await get(req('config', undefined, undefined, { Origin: 'https://untrusted.example' }));
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.code, 'HEADER_ORIGIN_MISMATCH');
});

test('Sharkmeister password removal requires a session-bound passkey proof and preserves identity', async () => {
  const env = envFor();
  env.PASSKEY_LOGIN_ENABLED = 'true';
  env.PASSKEY_RP_ID = 'eloscanner.com';
  await provision(env, 'sharkmeister');
  const login = await handleAuth({ request: req('sign-in/username', { username: 'sharkmeister', password }), env });
  assert.equal(login.status, 200);
  const c = cookie(login);
  const session = await createAuth(env).api.getSession({ headers: new Headers({ Cookie: c }) });
  assert.ok(session?.session?.id);
  const id = session.user.id;
  env.AUTH_DB.sqlite.prepare('INSERT INTO passkey(id,publicKey,userId,credentialID,counter,deviceType,backedUp) VALUES (?,?,?,?,?,?,?)')
    .run('synced-key-1','fixture-public-key',id,'test-passkey-ID',0,'multiDevice',1);
  const call = (route, body, cookies = c) => handleAuth({ request: req(route, body, cookies), env });
  const status = await call('passkey/password-status');
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { passwordEnabled: true, passkeyCount: 1, backupReady: true, recentPasskeyLogin: false });
  assert.equal((await call('passkey/remove-password', { currentPassword: password, confirm: 'REMOVE_PASSWORD' })).status, 403);
  const otherLogin = await handleAuth({ request: req('sign-in/username', { username: 'sharkmeister', password }), env });
  const otherCookie = cookie(otherLogin);
  // The proof belongs to one authenticated session only, not merely a user ID.
  env.AUTH_DB.sqlite.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES (?,?,?)')
    .run(session.session.id, id, Date.now());
  assert.equal((await call('passkey/remove-password', { currentPassword: password, confirm: 'REMOVE_PASSWORD' }, otherCookie)).status, 403);
  assert.equal((await call('passkey/remove-password', { currentPassword: 'wrong-password', confirm: 'REMOVE_PASSWORD' })).status, 403);
  assert.equal((await call('passkey/remove-password', { currentPassword: password, confirm: 'WRONG' })).status, 400);
  const removed = await call('passkey/remove-password', { currentPassword: password, confirm: 'REMOVE_PASSWORD' });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT id FROM "user" WHERE id=?').get(id).id, id, 'same account ID');
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT password FROM account WHERE userId=? AND providerId=?').get(id, 'credential').password, null);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS c FROM passkey WHERE userId=?').get(id).c, 1, 'passkey retained');
  assert.equal((await call('passkey/password-status')).status, 200);
  assert.equal((await call('passkey/password-status').then(r => r.json())).passwordEnabled, false);
  assert.notEqual((await call('sign-in/username', { username: 'sharkmeister', password })).status, 200, 'old password no longer logs in');
  const deleted = await call('passkey/delete-account', { confirm: 'DELETE_MY_ACCOUNT' });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS c FROM "user" WHERE id=?').get(id).c, 0);
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS c FROM passkey WHERE userId=?').get(id).c, 0);
});
