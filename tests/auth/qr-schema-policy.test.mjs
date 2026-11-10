import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
