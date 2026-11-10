import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { requireAdmin } from '../../lib/auth/admin-access.mjs';

const secret = 'test-only-admin-perimeter-secret-length-32-plus';
function fixture() {
  const db = database();
  db.sqlite.exec("INSERT INTO \"user\" (id,name,email,emailVerified,createdAt,updatedAt,username,displayUsername) VALUES ('admin-id','Admin','admin@invalid.example',1,'2026-01-01','2026-01-01','sharkmeister','sharkmeister'),('member-id','Member','member@invalid.example',1,'2026-01-01','2026-01-01','member1','member1')");
  db.sqlite.exec("INSERT INTO auth_member_role (userId,role) VALUES ('admin-id','admin')");
  return { AUTH_DB: db, BETTER_AUTH_SECRET: secret };
}
function request(overrides = {}) {
  return new Request('https://eloscanner.com/api/admin/users', {
    headers: { 'CF-Connecting-IP': '192.0.2.15', 'Sec-Fetch-Site': 'same-origin', ...overrides }
  });
}
const sessionFor = id => ({ user: { id }, session: { id: 'session-' + id } });
async function check(env, headers = {}, user = 'admin-id', now = 1800000000000, requireRole = true) {
  return requireAdmin({ request: request(headers), env }, { now: () => now, getSession: async () => user ? sessionFor(user) : null }, requireRole);
}

test('admin role is checked by immutable user ID, not username; missing sessions and roles fail closed', async () => {
  const env = fixture();
  assert.equal((await check(env)).session.user.id, 'admin-id');
  assert.equal((await check(env, {}, 'member-id')).status, 403);
  assert.equal((await check(env, {}, null)).status, 401);
  assert.equal((await check(env, {}, 'unknown-id')).status, 403);
  const memberRole = await check(env, {}, 'member-id', 1800000000000, false);
  assert.equal(memberRole.role, 'member');
});

test('admin API rejects cross-site, sibling-site, forged origins and missing trusted edge IP', async () => {
  const env = fixture();
  for (const headers of [
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
    { Origin: 'https://evil.example' },
    { Origin: 'https://eloscanner.com.evil.example' }
  ]) assert.equal((await check(env, headers)).status, 403);
  assert.equal((await check(env, { 'CF-Connecting-IP': '' })).status, 503);
  assert.equal((await check(env, { 'CF-Connecting-IP': '1.1.1.1, 2.2.2.2' })).status, 503);
  assert.equal((await check(env, { Origin: 'https://eloscanner.com' })).session.user.id, 'admin-id');
});

test('admin request quotas are atomic, edge-wide in D1 and reset after the window', async () => {
  const env = fixture(), now = 1800000000000;
  const requests = await Promise.all(Array.from({ length: 48 }, () => check(env, {}, 'admin-id', now)));
  assert.equal(requests.filter(result => result instanceof Response && result.status === 429).length, 8);
  assert.equal(requests.filter(result => !(result instanceof Response)).length, 40);
  assert.equal((await check(env, {}, 'admin-id', now)).status, 429);
  assert.equal((await check(env, {}, 'admin-id', now + 60001)).session.user.id, 'admin-id');
});

test('admin checks fail closed on DB errors and missing configuration', async () => {
  const env = fixture();
  assert.equal((await check({ ...env, BETTER_AUTH_SECRET: 'short' })).status, 503);
  assert.equal((await check({ ...env, AUTH_DB: null })).status, 503);
  env.AUTH_DB.sqlite.exec('DROP TABLE auth_member_role');
  assert.equal((await check(env)).status, 503);
});

test('admin error responses disable caching, framing and cross-origin reads', async () => {
  const response = await check(fixture(), {}, null);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
