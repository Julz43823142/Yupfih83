// Explicit, protected, additive D1 migration for QR login. Never changes
// existing users, passkeys, sessions, roles or public signup configuration.
import { readFileSync } from 'node:fs';
import { PROJECT, PRODUCTION_AUTH_DB, assertProduction, assertPreviewIsolation } from './cloudflare.mjs';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const pagesToken = process.env.CLOUDFLARE_PRODUCTION_API_TOKEN;
const d1Token = process.env.CLOUDFLARE_PRODUCTION_D1_WRITE_TOKEN;
if (process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.INPUT_CONFIRMATION !== 'APPLY_0015_QR_LOGIN_SIGNUP_CLOSED' ||
    !/^[a-f0-9]{32}$/i.test(account || '') || !pagesToken || !d1Token)
  throw Error('Protected manual migration confirmation/credentials missing; no writes.');

const base = 'https://api.cloudflare.com/client/v4/accounts/' + account;
async function api(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw Error('Cloudflare request failed: HTTP ' + response.status);
  const payload = await response.json();
  if (payload.success !== true || (Array.isArray(payload.result) &&
      payload.result.some(x => x.success === false)))
    throw Error('Cloudflare rejected protected migration operation');
  return payload.result;
}
async function query(sql) {
  const result = await api('/d1/database/' + PRODUCTION_AUTH_DB + '/query', d1Token, 'POST', { sql });
  if (!Array.isArray(result)) throw Error('Invalid D1 response');
  return result.flatMap(x => x.results || []);
}
const read = sql => {
  if (!/^\s*SELECT\b/i.test(sql)) throw Error('Only SELECT reads allowed');
  return query(sql);
};
const project = await api('/pages/projects/' + PROJECT, pagesToken);
assertProduction(project);
assertPreviewIsolation(project);
if (project.production_branch !== 'main' ||
    project.source?.config?.production_deployments_enabled !== false ||
    project.source?.config?.preview_deployment_setting !== 'none' ||
    project.deployment_configs?.production?.env_vars?.PUBLIC_SIGNUP_ENABLED?.value !== 'false' ||
    project.deployment_configs?.production?.env_vars?.PASSKEY_LOGIN_ENABLED?.value !== 'true')
  throw Error('Production safety invariants failed; no D1 writes');
const live = await fetch('https://eloscanner.com/api/auth/config', {
  headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000)
});
if (!live.ok || (await live.json()).registrationOpen !== false)
  throw Error('Live registration is not confirmed closed');

const before = (await read('SELECT (SELECT COUNT(*) FROM "user") AS users, (SELECT COUNT(*) FROM "passkey") AS passkeys'))[0];
const schema = await read("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name IN ('auth_qr_login','auth_qr_login_expires_idx')");
const existing = new Set(schema.map(x => x.name));
if (existing.has('auth_qr_login') || existing.has('auth_qr_login_expires_idx')) {
  if (existing.size === 2) {
    console.log('QR login schema already present; no writes needed.');
    process.exit(0);
  }
  throw Error('Partial QR schema found; review manually, do not retry');
}
const bookmark = await api('/d1/database/' + PRODUCTION_AUTH_DB + '/time_travel/bookmark', d1Token);
if (!bookmark?.bookmark) throw Error('Time Travel recovery bookmark unavailable');
console.log('Pre-migration recovery bookmark: ' + bookmark.bookmark);
const sql = readFileSync('migrations/auth/0015_qr_login.sql', 'utf8');
// Inspect complete statements, not isolated keywords: ON DELETE CASCADE
// is a valid foreign-key clause in this strictly additive CREATE TABLE.
const statements = sql.replace(/^\s*--[^\n]*/gm, '').split(';').map(x => x.trim()).filter(Boolean);
if (statements.length !== 2 ||
    !/^CREATE TABLE IF NOT EXISTS auth_qr_login\s*\(/i.test(statements[0]) ||
    !/^CREATE INDEX IF NOT EXISTS auth_qr_login_expires_idx\s+ON\s+auth_qr_login\s*\(/i.test(statements[1]))
  throw Error('Migration must contain only the approved QR table and index CREATE statements');
await query(sql);
const afterSchema = await read("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name IN ('auth_qr_login','auth_qr_login_expires_idx')");
if (afterSchema.length !== 2) throw Error('Incomplete QR schema; inspect manually');
const after = (await read('SELECT (SELECT COUNT(*) FROM "user") AS users, (SELECT COUNT(*) FROM "passkey") AS passkeys'))[0];
if (Number(before.users) !== Number(after.users) || Number(before.passkeys) !== Number(after.passkeys))
  throw Error('Account or passkey count changed unexpectedly');
console.log('QR login D1 schema ready. Existing accounts/passkeys unchanged; signup remains CLOSED.');
