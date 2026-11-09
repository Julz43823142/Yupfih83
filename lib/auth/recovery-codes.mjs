import { keyedDigest } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';

const COUNT = 8;
const CODE_BYTES = 20; // 160 bits; unguessable even after a database-only breach.
const FORMAT = /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){7}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes) {
  let buffer = 0, bits = 0, out = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return FORMAT.test(code) ? code : null;
}

async function digest(secret, userId, code) {
  if (typeof secret !== 'string' || secret.length < 32 || !userId) throw Error('Recovery secret unavailable');
  return bytesToHex(await keyedDigest(secret, 'eloscanner-recovery-v1', userId + '\0' + code.replaceAll('-', '')));
}

// The returned codes must be shown only once over an authenticated, no-store
// response, and NEVER written to logs, analytics or database.
export async function createRecoveryCodeSet(secret, userId, now = Date.now()) {
  const generation = crypto.randomUUID();
  const codes = [], rows = [];
  for (let i = 0; i < COUNT; i++) {
    const compact = encodeBase32(crypto.getRandomValues(new Uint8Array(CODE_BYTES)));
    const code = compact.match(/.{4}/g).join('-');
    codes.push(code);
    rows.push({ userId, generation, digest: await digest(secret, userId, code), createdAt: now });
  }
  return { codes, rows, generation };
}

// Call only after a fresh primary-credential assertion. A D1 batch provides
// all-or-nothing rotation; a failure must not revoke existing usable codes.
export async function rotateRecoveryCodes(db, secret, userId, now = Date.now()) {
  const { codes, rows, generation } = await createRecoveryCodeSet(secret, userId, now);
  await db.batch([
    db.prepare('DELETE FROM auth_recovery_code WHERE userId=?').bind(userId),
    ...rows.map(row => db.prepare(
      'INSERT INTO auth_recovery_code(userId,generation,digest,createdAt) VALUES(?,?,?,?)'
    ).bind(row.userId,row.generation,row.digest,row.createdAt))
  ]);
  return { codes, generation };
}

// Internal primitive ONLY. Do not expose a public redeem endpoint until
// WebAuthn re-enrollment and session revocation are transactional and tested.
export async function consumeRecoveryCode(db, secret, userId, input, now = Date.now()) {
  const code = normalizeCode(input);
  if (!code) return false;
  const hashed = await digest(secret, userId, code);
  const row = await db.prepare(
    'UPDATE auth_recovery_code SET consumedAt=? WHERE userId=? AND digest=? AND consumedAt IS NULL RETURNING digest'
  ).bind(now,userId,hashed).first();
  return !!row;
}
export function recoveryCodeCount() { return COUNT; }
