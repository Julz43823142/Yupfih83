import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { approvedQrSchema } from '../../lib/auth/qr-schema-policy.mjs';

test('production QR migration accepts its approved additive SQL including foreign-key cascade', () => {
  const sql = readFileSync(new URL('../../migrations/auth/0015_qr_login.sql', import.meta.url), 'utf8');
  assert.match(sql, /ON DELETE CASCADE/i);
  assert.equal(approvedQrSchema(sql), true);
});

test('production QR migration rejects destructive, unapproved, or partial SQL', () => {
  const sql = readFileSync(new URL('../../migrations/auth/0015_qr_login.sql', import.meta.url), 'utf8');
  for (const unsafe of [
    sql + '\nDELETE FROM "user";',
    sql + '\nDROP TABLE passkey;',
    sql.replace('CREATE INDEX IF NOT EXISTS', 'DROP INDEX IF EXISTS'),
    sql.replace('auth_qr_login_expires_idx', 'unapproved_index'),
    sql.replace('auth_qr_login_session_once_idx', 'unapproved_index'),
    sql.replace('approvedSessionId TEXT', 'approvedSessionId BLOB'),
    sql.replace('CREATE UNIQUE INDEX IF NOT EXISTS', 'CREATE INDEX IF NOT EXISTS'),
    sql.replace('CREATE TABLE IF NOT EXISTS auth_qr_login', 'ALTER TABLE auth_qr_login'),
    sql.split('CREATE INDEX')[0],
    '', null
  ]) assert.equal(approvedQrSchema(unsafe), false);
});

test('executed production QR SQL contains all three objects and a unique session index', () => {
  const sql = readFileSync(new URL('../../migrations/auth/0015_qr_login.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(sql);
    const objects = sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name IN ('auth_qr_login','auth_qr_login_expires_idx','auth_qr_login_session_once_idx')").all();
    assert.deepEqual(new Set(objects.map(x => x.name)), new Set([
      'auth_qr_login','auth_qr_login_expires_idx','auth_qr_login_session_once_idx'
    ]));
    const columns = sqlite.prepare("SELECT name FROM pragma_table_info('auth_qr_login')").all();
    assert.ok(columns.some(x => x.name === 'approvedSessionId'));
    const indexes = sqlite.prepare('SELECT name, "unique" AS isUnique FROM pragma_index_list(\'auth_qr_login\') WHERE name=\'auth_qr_login_session_once_idx\'').all();
    assert.equal(Number(indexes[0]?.isUnique), 1);
    // The additive migration must be safe to replay without changing the schema.
    sqlite.exec(sql);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='auth_qr_login_session_once_idx'").get().n, 1);
  } finally {
    sqlite.close();
  }
});
