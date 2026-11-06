// Offline diagnostic only. Does not access Cloudflare, production credentials or D1.
// Run: npm run auth:benchmark
import { passwordFunctions } from '../lib/auth/password.mjs';
const secret = 'OFFLINE-BENCHMARK-ONLY-not-a-production-secret-123456';
const password = 'Offline-benchmark-password-please-never-use-123';
const auth = passwordFunctions(secret);
const measure = async (label, fn) => {
 const cpu = process.cpuUsage(), start = performance.now();
 const result = await fn();
 const usage = process.cpuUsage(cpu);
 const cpuMs = (usage.user + usage.system) / 1000;
 console.log(label + ': CPU ' + cpuMs.toFixed(1) + ' ms; wall ' + (performance.now()-start).toFixed(1) + ' ms');
 return result;
};
const hash = await measure('Argon2id hash', () => auth.hash(password));
const verified = await measure('Argon2id verify', () => auth.verify({password,hash}));
if (!verified) throw Error('Verification failed');
console.log('This measures local Node CPU, NOT Cloudflare Workers CPU. Use Workers logs to attribute production failures. Never reduce existing Argon2 parameters without a migration plan.');


// Compare a possible future WebCrypto-based KDF without changing stored hashes.
// This is NOT a migration: existing Argon2id hashes still require Argon2id verification.
const encoder = new TextEncoder();
const pepper = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
const material = new Uint8Array(await crypto.subtle.sign('HMAC', pepper, encoder.encode('eloscanner-password-v1\\0'+password.normalize('NFC'))));
const pbkdf2Key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
const salt = crypto.getRandomValues(new Uint8Array(16));
await measure('WebCrypto PBKDF2-SHA256 (600k iterations, comparison only)', () =>
  crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},pbkdf2Key,256));
console.log('PBKDF2 is only an experiment; no production password scheme has changed.');
