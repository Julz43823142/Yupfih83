import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { handleAuth } from '../../lib/auth/gateway.mjs';

test('one verified registration creates a session for precisely that new username', async () => {
  const env = {
    AUTH_DB: database(),
    BETTER_AUTH_SECRET: 'test-only-registration-session-secret-over-32-characters',
    BETTER_AUTH_URL: 'https://eloscanner.com',
    PASSKEY_RP_ID: 'eloscanner.com',
    PASSKEY_LOGIN_ENABLED: 'true',
    PUBLIC_SIGNUP_ENABLED: 'true',
    TURNSTILE_SITE_KEY: 'test-site',
    TURNSTILE_SECRET_KEY: 'test-secret'
  };
  const call = (path, data, cookies) => handleAuth({
    env,
    request: new Request('https://eloscanner.com/api/auth/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'https://eloscanner.com',
        'CF-Connecting-IP': '192.0.2.10',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookies ? { Cookie: cookies } : {})
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    })
  }, {
    fetch: async () => Response.json({ success: true, hostname: 'eloscanner.com', action: 'signup' }),
    verifyRegistrationResponse: async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'one-confirmation-test-credential',
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true
      }
    })
  });
  const optionsResponse = await call('passkey-signup/options', { username: 'one_step_user', turnstileToken: 'fixture' });
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  const result = await call('passkey-signup/verify', {
    attemptId: options.attemptId,
    challenge: options.publicKey.challenge,
    credential: { id: 'one-confirmation-test-credential' }
  });
  assert.equal(result.status, 201, await result.clone().text());
  const signup = await result.json();
  assert.equal(signup.username, 'one_step_user');
  assert.equal(signup.loggedIn, true, 'verified signup should immediately issue a session');
  assert.equal(signup.user?.username, 'one_step_user');
  assert.equal(signup.user?.id, options.attemptId);
  const cookies = result.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  assert.match(cookies, /session_token=/);
  const sessionResponse = await call('get-session', undefined, cookies);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.user?.username, 'one_step_user');
  assert.equal(session.user?.id, options.attemptId);
  const anotherSignup = await call('passkey-signup/options', { username: 'different_user', turnstileToken: 'fixture' }, cookies);
  assert.equal(anotherSignup.status, 409, 'signed-in users may not silently create another identity');
  assert.equal((await anotherSignup.json()).code, 'ALREADY_SIGNED_IN');
  assert.equal(env.AUTH_DB.sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n, 1);
});
