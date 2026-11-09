// Protected manual whole-chain production D1 migration. Never opens signup.
// Prerequisites: real disposable Cloudflare D1 Time Travel restore rehearsal,
// explicit protected workflow dispatch, and verified production recovery bookmark.
// DDL changes are not generally idempotent: any partial prior run FAILS CLOSED.
import {readFile} from 'node:fs/promises';
import {PROJECT, PRODUCTION_AUTH_DB, PREVIEW_AUTH_DB, assertProduction} from './cloudflare.mjs';

const env=process.env;
const account=env.CLOUDFLARE_ACCOUNT_ID;
const pagesToken=env.CLOUDFLARE_PRODUCTION_API_TOKEN;
const d1Token=env.CLOUDFLARE_PRODUCTION_D1_WRITE_TOKEN;
const githubToken=env.GITHUB_TOKEN;
const repository=env.GITHUB_REPOSITORY;
const confirm=env.MIGRATION_CONFIRMATION;
const main=env.GITHUB_REF==='refs/heads/main';
if (!main||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    confirm!=='APPLY_0010_0013_WITH_SIGNUP_CLOSED'||
    !/^[a-f0-9]{32}$/i.test(account||'')||!pagesToken||!d1Token||
    !githubToken||!/^[-\w]+\/[-.\w]+$/.test(repository||'')) {
  throw Error('Protected explicit manual production invocation/credentials absent; NO D1 writes');
}
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
const api=async (path,token,method='GET',body)=>{
  const r=await fetch(base+path,{method,headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json'
  },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error('Cloudflare '+method+' '+path.split('?')[0]+' HTTP '+r.status);
  const j=await r.json();
  if(j.success!==true||(Array.isArray(j.result)&&j.result.some(x=>x.success===false)))
    throw Error('Cloudflare rejected '+method+' '+path.split('?')[0]);
  return j.result;
};
const pages=()=>api('/pages/projects/'+PROJECT,pagesToken);
const d1=path=>api('/d1/database/'+PRODUCTION_AUTH_DB+path,d1Token);
const query=async sql=>{
  const result=await api('/d1/database/'+PRODUCTION_AUTH_DB+'/query',d1Token,'POST',{sql});
  if(!Array.isArray(result))throw Error('Unexpected production D1 query result');
  return result.flatMap(x=>x.results||[]);
};
const read=async sql=>{
  // Only literal internal read-only queries in this file call this helper.
  if(!/^\s*(SELECT|PRAGMA)\b/i.test(sql))throw Error('Read-only SQL required');
  return query(sql);
};
const project=await pages();
assertProduction(project);
if(project.source?.type!=='github'||
  project.source.config?.production_deployments_enabled!==false||
  project.source.config?.preview_deployment_setting!=='none')
  throw Error('Native production/preview Git auto-deploy must be disabled');
if(project.deployment_configs?.production?.env_vars?.PUBLIC_SIGNUP_ENABLED?.value!=='false')
  throw Error('PUBLIC_SIGNUP_ENABLED must be explicitly false');
const live=await fetch('https://eloscanner.com/api/auth/config',{
  headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
if(!live.ok||(await live.json()).registrationOpen!==false)
  throw Error('Live public signup must remain closed');

// Require a real, successful disposable D1 Time Travel restore on trusted main,
// not the local SQLite simulation. Do not trust job summaries or PR code.
const gh=await fetch('https://api.github.com/repos/'+repository+
  '/actions/workflows/disposable-d1-restore-rehearsal.yml/runs?status=success&per_page=10',{
  headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json'},
  signal:AbortSignal.timeout(15000)});
if(!gh.ok)throw Error('Cannot verify trusted D1 Time Travel restore run HTTP '+gh.status);
const runs=(await gh.json()).workflow_runs||[];
const recent=runs.find(x=>x.name==='Rehearse Cloudflare D1 Time Travel on isolated synthetic database'&&
  x.head_branch==='main'&&x.conclusion==='success'&&
  Date.now()-Date.parse(x.updated_at)>=0&&Date.now()-Date.parse(x.updated_at)<86400000);
if(!recent)throw Error('No successful main-branch Cloudflare D1 Time Travel restore in last 24 hours');
console.log('Cloudflare D1 restore rehearsal verified from GitHub Actions run '+recent.id);

// All production verification before the first SQL write.
const db=await d1('');
if(db?.uuid!==PRODUCTION_AUTH_DB||db?.version!=='production')
  throw Error('Production D1 identity/backend does not support Time Travel');
const objects=await read("SELECT name,type FROM sqlite_master WHERE type IN ('table','trigger','index')");
const existing=new Set(objects.map(x=>x.name));
const baseNames=['user','session','passkey','auth_passkey_login_proof','passkey_limit_insert','passkey_no_owner_change'];
if(baseNames.some(n=>!existing.has(n)))
  throw Error('Required baseline authentication schema or passkey trigger missing');
const migrationNames=[
  'auth_primary_passkey','auth_primary_passkey_proof','auth_primary_passkey_assign',
  'auth_primary_passkey_no_delete','auth_primary_passkey_no_id_change',
  'auth_primary_passkey_no_reassign','auth_primary_passkey_no_mapping_delete',
  'auth_primary_passkey_no_user_change','auth_recovery_code','auth_recovery_attempt',
  'auth_primary_transfer_gate','auth_primary_transfer_gate_valid',
  'auth_primary_phone_transfer_attempt'
];
if(migrationNames.some(n=>existing.has(n)))
  throw Error('Prior/partial 0010–0013 detected. STOP: do not rerun non-idempotent migrations');
const before=await read('SELECT (SELECT COUNT(*) FROM "user") AS users,(SELECT COUNT(*) FROM "passkey") AS passkeys');
const users=Number(before[0]?.users),passkeys=Number(before[0]?.passkeys);
if(!Number.isSafeInteger(users)||!Number.isSafeInteger(passkeys))
  throw Error('Could not measure production account counts');
const orphan=await read('SELECT COUNT(*) AS n FROM "passkey" p LEFT JOIN "user" u ON p."userId"=u."id" WHERE u."id" IS NULL');
if(Number(orphan[0]?.n)!==0)throw Error('Production contains orphan passkeys');

// Bookmark is live and returned by Cloudflare, not a snapshot export.
// Time Travel restore overwrites the DB and must NEVER be automatic.
const bookmark=await d1('/time_travel/bookmark');
if(typeof bookmark?.bookmark!=='string'||!bookmark.bookmark)
  throw Error('Production Time Travel recovery bookmark unavailable');
// Output recovery bookmark in protected Actions log for incident recovery.
console.log('PRE-MIGRATION RECOVERY BOOKMARK: '+bookmark.bookmark);
console.log('All preconditions checked; preparing 0010→0011→0012→0013. Signup is CLOSED.');
const files=[
  'migrations/auth/0010_primary_passkey.sql',
  'migrations/auth/0011_recovery_codes.sql',
  'migrations/auth/0012_recovery_transfer.sql',
  'migrations/auth/0013_phone_transfer.sql'
];
let step=0;
try {
  for(const file of files){
    const sql=await readFile(file,'utf8');
    if(!sql.trim())throw Error('Empty migration '+file);
    // Cloudflare D1 /query explicitly supports multi-statement SQL batches;
    // never split SQLite triggers on semicolons.
    await query(sql);
    step++;
    console.log('Applied production schema migration '+file+' ('+step+'/4)');
  }
} catch(error) {
  console.error('STOP: incomplete migration after '+step+' full files. Do NOT rerun. Review schema.');
  console.error('RECOVERY BOOKMARK: '+bookmark.bookmark);
  throw error;
}
const afterObjects=await read("SELECT name,type FROM sqlite_master WHERE type IN ('table','trigger','index')");
const afterSet=new Set(afterObjects.map(x=>x.name));
for(const name of migrationNames)if(!afterSet.has(name))
  throw Error('Missing post-migration object '+name+'; inspect, do not rerun');
const after=await read('SELECT (SELECT COUNT(*) FROM "user") AS users,(SELECT COUNT(*) FROM "passkey") AS passkeys');
if(Number(after[0]?.users)!==users||Number(after[0]?.passkeys)!==passkeys)
  throw Error('Account/passkey counts changed unexpectedly');
const missing=await read('SELECT COUNT(*) AS n FROM "passkey" p WHERE NOT EXISTS (SELECT 1 FROM "auth_primary_passkey" m WHERE m."userId"=p."userId")');
const invalid=await read('SELECT COUNT(*) AS n FROM "auth_primary_passkey" m LEFT JOIN "passkey" p ON p."id"=m."passkeyId" AND p."userId"=m."userId" WHERE p."id" IS NULL');
if(Number(missing[0]?.n)!==0||Number(invalid[0]?.n)!==0)
  throw Error('Invalid primary mapping after migration');
// D1's HTTP /query endpoint can reject SQLite PRAGMA integrity_check
// with HTTP 400. Never turn a post-migration diagnostic into a reason
// to rerun non-idempotent production schema files.
const orphanAfter=await read('SELECT COUNT(*) AS n FROM "passkey" p LEFT JOIN "user" u ON p."userId"=u."id" WHERE u."id" IS NULL');
if(Number(orphanAfter[0]?.n)!==0)
  throw Error('Orphan passkey found after migration');
const post=await pages();assertProduction(post);
if(post.source?.config?.production_deployments_enabled!==false||
  post.source?.config?.preview_deployment_setting!=='none')
  throw Error('Native deployments enabled after migration');
console.log('SUCCESS: production 0010–0013 complete; accounts/passkeys unchanged; mapping and ownership verified; signup CLOSED.');
console.log('Recovery bookmark (retain for protected rollback planning): '+bookmark.bookmark);
