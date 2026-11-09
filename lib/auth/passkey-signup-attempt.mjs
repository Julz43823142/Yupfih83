// Single-use registration attempt primitives. These do not enable signup.
// WebAuthn verification and account creation must be implemented separately.
import { keyedDigest } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';

const MAX_AGE_MS = 2 * 60 * 1000;
const USERNAME = /^[a-z0-9_]{3,24}$/;

export async function createSignupAttempt(db, secret, { username, challenge, sourceDigest }, now = Date.now()) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Database unavailable');
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('Signup secret unavailable');
  if (typeof username !== 'string' || !USERNAME.test(username)) throw new TypeError('Invalid username');
  if (typeof challenge !== 'string' || challenge.length < 32 || challenge.length > 512) throw new TypeError('Invalid challenge');
  if (typeof sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(sourceDigest)) throw new TypeError('Invalid source digest');
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid timestamp');
  const id = crypto.randomUUID();
  const challengeDigest = bytesToHex(await keyedDigest(secret, 'passkey-signup-challenge', challenge));
  await db.prepare(`INSERT INTO auth_passkey_signup_attempt
    (id,username,challengeDigest,expiresAt,createdAt,sourceDigest)
    VALUES (?,?,?,?,?,?)`).bind(id, username, challengeDigest, now + MAX_AGE_MS, now, sourceDigest).run();
  return { id, expiresAt: now + MAX_AGE_MS };
}

// Consume only AFTER independently verifying WebAuthn challenge, RP ID, origin,
// user verification, credential signature and authenticator attachment policy.
// A successful consumption alone MUST NEVER authorize account creation.
export async function consumeSignupAttempt(db, secret, { id, challenge, sourceDigest }, now = Date.now()) {
  if (!db || typeof db.prepare !== 'function' || typeof secret !== 'string' || secret.length < 32) return null;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return null;
  if (typeof challenge !== 'string' || challenge.length < 32 || challenge.length > 512) return null;
  if (typeof sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(sourceDigest)) return null;
  if (!Number.isSafeInteger(now) || now < 0) return null;
  const challengeDigest = bytesToHex(await keyedDigest(secret, 'passkey-signup-challenge', challenge));
  const row = await db.prepare(`UPDATE auth_passkey_signup_attempt SET consumedAt=?
    WHERE id=? AND challengeDigest=? AND sourceDigest=?
      AND consumedAt IS NULL AND expiresAt>? AND createdAt<=?
    RETURNING username`).bind(now, id, challengeDigest, sourceDigest, now, now).first();
  return row?.username || null;
}


/**
 * Generate an unpredictable WebAuthn challenge for a new registration attempt.
 * The challenge is public, but its digest is bound to one server-side attempt.
 * This does not perform WebAuthn verification or enable public registration.
 */
export function generateSignupChallenge() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split('+').join('-').split('/').join('_').replace(/=+$/, '');
}

export async function signupSourceDigest(secret, ip) {
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('Signup secret unavailable');
  if (typeof ip !== 'string' || !ip || ip.length > 128) throw new TypeError('Invalid source');
  return bytesToHex(await keyedDigest(secret, 'passkey-signup-source', ip));
}
