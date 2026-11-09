// Live Cloudflare D1 Time Travel restore rehearsal, using SYNTHETIC DATA ONLY.
// This script never writes to production/preview AUTH_DB, nor changes Pages config.
// A separate GitHub production-environment D1 Write token is required.
import { PROJECT, PRODUCTION_AUTH_DB, PREVIEW_AUTH_DB, assertProduction } from './cloudflare.mjs';

const env = process.env;
const account = env.CLOUDFLARE_ACCOUNT_ID;
const pagesToken = env.CLOUDFLARE_PRODUCTION_API_TOKEN;
const d1Token = env.CLOUDFLARE_PRODUCTION_D1_WRITE_TOKEN;
const run = env.GITHUB_RUN_ID;
const attempt = env.GITHUB_RUN_ATTEMPT;
if (!/^[a-f0-9]{32}$/i.test(account || '') || !pagesToken || !d1Token ||
    !/^\d{6,}$/.test(run || '') || !/^\d+$/.test(attempt || '')) {
  throw Error('Protected production environment, separate D1 Write credentials and GitHub run identity required; no writes performed');
}
const url = 'https://api.cloudflare.com/client/v4/accounts/' + account;
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const pageApi = async path => {
  const r = await fetch(url + path, {headers: {Authorization: 'Bearer ' + pagesToken},
    signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw Error('Pages verification HTTP ' + r.status);
  const j = await r.json();
  if (j.success !== true) throw Error('Pages verification rejected');
  return j.result;
};
const d1Api = async (path, method = 'GET', body) => {
  const r = await fetch(url + path, {method, headers: {
    Authorization: 'Bearer ' + d1Token, 'Content-Type': 'application/json'
  }, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000)});
  if (!r.ok) throw Error('Disposable D1 API ' + method + ' failed HTTP ' + r.status);
  const j = await r.json();
  if (j.success !== true || (j.result || []).some?.(entry => entry.success === false))
    throw Error('Disposable D1 API rejected request');
  return j.result;
};
const project = await pageApi('/pages/projects/' + PROJECT);
assertProduction(project);
if (project.source?.type !== 'github' ||
    project.source.config?.production_deployments_enabled !== false ||
    project.source.config?.preview_deployment_setting !== 'none') {
  throw Error('Native Git deployment switches are not both disabled');
}
// Confirm the public signup routes are still closed WITHOUT creating an account.
const live = await fetch('https://eloscanner.com/api/auth/config', {headers: {'Cache-Control': 'no-cache'},
  signal: AbortSignal.timeout(15000)});
if (!live.ok || (await live.json()).registrationOpen !== false)
  throw Error('Public signup closed state not confirmed');
const name = 'eloscanner-d1-restore-test-' + run + '-' + attempt;
let created;
let completed = false;
const safeId = id => {
  if (!uuid(id) || id === PRODUCTION_AUTH_DB || id === PREVIEW_AUTH_DB)
    throw Error('Refusing D1 operation against non-disposable database');
  return id;
};
try {
  const db = await d1Api('/d1/database', 'POST', {name, jurisdiction: 'eu'});
  if (db?.name !== name) throw Error('Created disposable database identity mismatch');
  created = safeId(db.uuid);
  console.log('Created isolated synthetic D1 database: ' + created);
  const path = '/d1/database/' + safeId(created);
  const query = async sql => {
    const rows = await d1Api(path + '/query', 'POST', {sql});
    if (!Array.isArray(rows)) throw Error('Unexpected D1 query result');
    return rows.flatMap(x => x.results || []);
  };
  await query('CREATE TABLE rehearsal_probe (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)');
  await query("INSERT INTO rehearsal_probe(id, marker) VALUES (1, 'before-restore')");
  const before = await query('SELECT COUNT(*) AS count FROM rehearsal_probe');
  if (Number(before[0]?.count) !== 1) throw Error('Synthetic fixture could not be created');
  const bookmark = await d1Api(path + '/time_travel/bookmark');
  if (!bookmark?.bookmark || typeof bookmark.bookmark !== 'string')
    throw Error('Disposable D1 does not support Time Travel bookmarks');
  await query("INSERT INTO rehearsal_probe(id, marker) VALUES (2, 'after-bookmark')");
  const changed = await query('SELECT COUNT(*) AS count FROM rehearsal_probe');
  if (Number(changed[0]?.count) !== 2) throw Error('Synthetic post-bookmark write not visible');
  const restored = await d1Api(path + '/time_travel/restore?bookmark=' +
    encodeURIComponent(bookmark.bookmark), 'POST');
  if (!restored?.bookmark) throw Error('Time Travel restore not confirmed');
  const result = await query('SELECT id, marker FROM rehearsal_probe ORDER BY id');
  if (result.length !== 1 || result[0].id !== 1 || result[0].marker !== 'before-restore')
    throw Error('D1 restored state does not match synthetic bookmark');
  const afterProject = await pageApi('/pages/projects/' + PROJECT);
  assertProduction(afterProject);
  if (afterProject.source?.config?.production_deployments_enabled !== false ||
      afterProject.source?.config?.preview_deployment_setting !== 'none')
    throw Error('Native Git auto-deploy unexpectedly enabled after rehearsal');
  completed = true;
  console.log('PASS: live D1 Time Travel restored isolated synthetic data. No production DB writes; public signup closed.');
} finally {
  if (created) {
    try {
      await d1Api('/d1/database/' + safeId(created), 'DELETE');
      console.log('Deleted disposable rehearsal D1 database: ' + created);
    } catch (error) {
      // The UUID is deliberately logged to support deletion if cleanup fails.
      console.error('CRITICAL: failed to delete disposable database ' + created +
        '; Cloudflare manual cleanup required. ' + String(error));
      throw error;
    }
  }
}
if (!completed) throw Error('D1 Time Travel rehearsal did not complete');
