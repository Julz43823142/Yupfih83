import {readBoundedText} from '../bounded-upstream.mjs';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

// OWASP minimum is 19 MiB / 2 passes. Benchmark this 32 MiB / 3-pass
// configuration in Workers before launch; never downgrade to fit Free CPU limits.
export const ARGON = Object.freeze({ m: 32768, t: 3, p: 1, dkLen: 32 });
const encoder = new TextEncoder();
export async function keyedDigest(secret, purpose, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}\0${value}`)));
}
export function passwordFunctions(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Authentication secret is not configured');
  // Domain-separated pepper. Retain the original secret: replacing it invalidates
  // existing password hashes. It protects against DB-only theft, not server takeover.
  const material = password => keyedDigest(secret, 'eloscanner-password-v1', password.normalize('NFC'));
  return {
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const digest = await argon2idAsync(await material(password), salt, ARGON);
      return `$elo-argon2id$v=1$m=32768,t=3,p=1$${bytesToHex(salt)}$${bytesToHex(digest)}`;
    },
    async verify({ password, hash }) {
      // Strict, versioned parameters prevent corrupted hashes requesting huge allocations.
      const match = /^\$elo-argon2id\$v=1\$m=32768,t=3,p=1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(hash || '');
      if (!match) return false;
      const actual = await argon2idAsync(await material(password), hexToBytes(match[1]), ARGON);
      const expected = hexToBytes(match[2]);
      let diff = 0;
      for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
      return diff === 0;
    }
  };
}
export async function checkNewPassword(password, username = '', fetcher = fetch) {
  if (typeof password !== 'string' || [...password.normalize('NFC')].length < 15 || password.length > 128) {
    return 'Use 15–128 characters for your password.';
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Do not include your username in your password.';
  // HIBP range API receives only the first five SHA-1 hex characters, never the
  // password or full hash. SHA-1 is only a lookup key, never password storage.
  const sha = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-1', encoder.encode(password.normalize('NFC'))))).toUpperCase();
  const response = await fetcher(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, {
    headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error('Password safety check unavailable');
  const text = await readBoundedText(response,300000);
  const rows = text.trim().split(/\r?\n/);
  if (!rows.length || rows.some(line => !/^[A-F0-9]{35}:\d+$/.test(line))) throw new Error('Invalid password safety response');
  if (rows.some(line => line.startsWith(sha.slice(5) + ':') && Number(line.split(':')[1]) > 0)) {
    return 'This password appears in known data breaches. Choose a different, unique password.';
  }
  return null;
}
