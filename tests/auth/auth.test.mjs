import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../../lib/auth/config.mjs';
import { handleAuth, consumeCounter } from '../../lib/auth/gateway.mjs';
import { passwordFunctions, checkNewPassword } from '../../lib/auth/password.mjs';
import { database } from './fixture.mjs';
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
