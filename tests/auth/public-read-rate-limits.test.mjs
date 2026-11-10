import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { onRequestGet as members } from '../../functions/api/members.js';
import { onRequestGet as records } from '../../functions/api/profile-records/[username].js';

const SECRET = 'synthetic-directory-test-secret-1234567890';
const origin = 'https://eloscanner.com';

function request(path, ip = '192.0.2.42', forwarded = '') {
  const headers = { 'CF-Connecting-IP': ip };
  if (forwarded) headers['X-Forwarded-For'] = forwarded;
  return new Request(origin + path, { headers });
}

test('public member listing has an atomic source budget before both D1 reads', async () => {
  const db = database(), env = { AUTH_DB: db, BETTER_AUTH_SECRET: SECRET };
  for (let i = 0; i < 30; i++) {
    const response = await members({ env, request: request('/api/members', '192.0.2.42', '198.51.100.' + i) });
    assert.equal(response.status, 200);
  }
  const blocked = await members({ env, request: request('/api/members') });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
  assert.deepEqual(Object.keys(await blocked.json()), ['message']);
  assert.equal((await members({ env, request: request('/api/members', '192.0.2.43') })).status, 200);
});

test('public personal-record queries have a D1 budget even for unknown usernames', async () => {
  const env = { AUTH_DB: database(), SUS_DB: database(), BETTER_AUTH_SECRET: SECRET };
  for (let i = 0; i < 30; i++) {
    const result = await records({ env, request: request('/api/profile-records/unknown'), params: { username: 'unknown' } });
    assert.equal(result.status, 404);
  }
  const blocked = await records({ env, request: request('/api/profile-records/unknown'), params: { username: 'unknown' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
});

test('public member and profile endpoints fail closed when auth rate-limit protection is unavailable', async () => {
  const db = database();
  const req = request('/api/members');
  assert.equal((await members({ env: { AUTH_DB: db }, request: req })).status, 503);
  assert.equal((await records({ env: { AUTH_DB: db, SUS_DB: db }, request: req, params: { username: 'testuser' } })).status, 503);
});
