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
