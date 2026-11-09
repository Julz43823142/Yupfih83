import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { handleAuth } from '../../lib/auth/gateway.mjs';
import { rotateRecoveryCodes } from '../../lib/auth/recovery-codes.mjs';
import { startRecovery, completeRecovery } from '../../lib/auth/recovery-transfer.mjs';
import { startPhoneTransfer, completePhoneTransfer } from '../../lib/auth/phone-transfer.mjs';

const secret = 'SYNTHETIC-TEST-ONLY-passkey-recovery-abuse-123456789';
const origin = 'https://eloscanner.com';
const source = 'a'.repeat(64);
const date = '2026-11-09T00:00:00.000Z';

function addAccount(db, name) {
  db.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)')
    .run(name, name, name + '@accounts.invalid', 0, date, date, name);
  db.sqlite.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,createdAt) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(name + '-primary', 'Phone', 'public-' + name, name, 'credential-' + name, 0, 'singleDevice', 0, date);
}

function addSession(db, name, id) {
  db.sqlite.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
    .run(id, new Date(Date.now() + 3600000).toISOString(), id + '-token', date, date, name);
}

function registration(id) {
  return {
    credential: { response: {} },
    registrationInfo: {
      credential: { id, publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0 },
      credentialDeviceType: 'singleDevice', credentialBackedUp: false, aaguid: null
    }
  };
}

function post(route, body, { requestOrigin = origin, ip = '192.0.2.61' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (requestOrigin !== null) headers.Origin = requestOrigin;
  return new Request(origin + '/api/auth/' + route, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
}

function env(db) {
  return {
    AUTH_DB: db, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin,
    PASSKEY_LOGIN_ENABLED: 'true', PASSKEY_RP_ID: 'eloscanner.com',
    PUBLIC_SIGNUP_ENABLED: 'false'
  };
}

test('recovery refuses an account name paired with another account\'s valid code', async () => {
  const db = database();
  addAccount(db, 'alice');
  addAccount(db, 'bob');
  const codes = await rotateRecoveryCodes(db, secret, 'alice');
  assert.equal(await startRecovery(db, secret, {
    username: 'bob', code: codes.codes[0], sourceDigest: source
  }), null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_recovery_attempt').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').get('bob').passkeyId, 'bob-primary');
});

test('public recovery endpoints reject cross-site and origin-less POSTs before writing attempts', async () => {
  const db = database();
  addAccount(db, 'alice');
  const codes = await rotateRecoveryCodes(db, secret, 'alice');
  const services = { createAuth: () => ({ api: { getSession: async () => null } }) };
  for (const requestOrigin of ['https://attacker.invalid', null]) {
    const response = await handleAuth({
      env: env(db), request: post('passkey/recovery/options', { username: 'alice', code: codes.codes[0] }, { requestOrigin })
    }, services);
    assert.equal(response.status, 403);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_recovery_attempt').get().n, 0);
  }
});

test('recovery rate limits repeated invalid codes without disclosing code or secret', async () => {
  const db = database();
  addAccount(db, 'alice');
  const services = { createAuth: () => ({ api: { getSession: async () => null } }) };
  const invalid = 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA';
  for (let i = 0; i < 8; i++) {
    const response = await handleAuth({
      env: env(db), request: post('passkey/recovery/options', { username: 'alice', code: invalid })
    }, services);
    assert.equal(response.status, 403);
    const body = await response.text();
    assert.ok(!body.includes(invalid));
    assert.ok(!body.includes(secret));
  }
  const ninth = await handleAuth({
    env: env(db), request: post('passkey/recovery/options', { username: 'alice', code: invalid })
  }, services);
  assert.equal(ninth.status, 429);
  assert.equal(ninth.headers.get('Retry-After'), '3600');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_recovery_attempt').get().n, 0);
});

test('two pending recovery ceremonies using one code cannot recover the account twice', async () => {
  const db = database();
  addAccount(db, 'alice');
  addAccount(db, 'bob');
  addSession(db, 'alice', 'alice-session');
  addSession(db, 'bob', 'bob-session');
  const now = Date.now();
  const codes = await rotateRecoveryCodes(db, secret, 'alice', now);
  const first = await startRecovery(db, secret, { username: 'alice', code: codes.codes[0], sourceDigest: source }, now);
  const second = await startRecovery(db, secret, { username: 'alice', code: codes.codes[0], sourceDigest: source }, now);
  assert.ok(first?.id && second?.id && first.id !== second.id);
  assert.equal(await completeRecovery(db, secret, {
    attemptId: first.id, challenge: first.challenge, sourceDigest: source,
    ...registration('alice-recovered')
  }, now + 100), true);
  assert.equal(await completeRecovery(db, secret, {
    attemptId: second.id, challenge: second.challenge, sourceDigest: source,
    ...registration('alice-attacker-retry')
  }, now + 101), false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get('alice').n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get('bob').n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey WHERE userId=?').get('bob').n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_recovery_code WHERE userId=?').get('alice').n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey WHERE credentialID=?').get('alice-attacker-retry').n, 0);
});

test('phone transfer proof cannot be replayed with another session or after session revocation', async () => {
  const db = database();
  addAccount(db, 'alice');
  addSession(db, 'alice', 'session-a');
  addSession(db, 'alice', 'session-b');
  const now = Date.now();
  db.sqlite.prepare('INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .run('session-a', 'alice', now);
  assert.equal(await startPhoneTransfer(db, secret, {
    userId: 'alice', sessionId: 'session-b', sourceDigest: source
  }, now), null);
  const attempt = await startPhoneTransfer(db, secret, {
    userId: 'alice', sessionId: 'session-a', sourceDigest: source
  }, now);
  assert.ok(attempt?.id);
  assert.equal(await completePhoneTransfer(db, secret, {
    attemptId: attempt.id, challenge: attempt.challenge, sourceDigest: source,
    sessionId: 'session-b', ...registration('new-phone')
  }, now + 10), false);
  db.sqlite.prepare('DELETE FROM session WHERE id=?').run('session-a');
  assert.equal(await completePhoneTransfer(db, secret, {
    attemptId: attempt.id, challenge: attempt.challenge, sourceDigest: source,
    sessionId: 'session-a', ...registration('new-phone')
  }, now + 20), false);
  assert.equal(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').get('alice').passkeyId, 'alice-primary');
});
