// Post-migration READ-ONLY production D1 verification: never rerun SQL migrations.
// Cloudflare D1 /query can reject PRAGMA integrity_check with HTTP 400 even when
// all migration statements and ordinary read queries completed successfully.
import {PROJECT, PRODUCTION_AUTH_DB, assertProduction, assertPreviewIsolation} from './cloudflare.mjs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const pagesToken=process.env.CLOUDFLARE_PRODUCTION_API_TOKEN;
const d1Token=process.env.CLOUDFLARE_PRODUCTION_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!pagesToken||!d1Token||
  process.env.GITHUB_REF!=='refs/heads/main') {
  throw Error('Protected main-branch production read-only verification credentials required');
}
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
const call=async(path,token,method='GET',body)=>{
  const response=await fetch(api+path,{method,headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json'
  },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Cloudflare read failed for '+path.split('?')[0]+': HTTP '+response.status);
  const json=await response.json();
  if(json.success!==true||(Array.isArray(json.result)&&json.result.some(x=>x.success===false)))
    throw Error('Cloudflare read rejected for '+path.split('?')[0]);
  return json.result;
};
const project=await call('/pages/projects/'+PROJECT,pagesToken);
assertProduction(project);
assertPreviewIsolation(project);
if(project.source?.type!=='github'||
  project.source.config?.production_deployments_enabled!==false||
  project.source.config?.preview_deployment_setting!=='none')
  throw Error('Native production or preview Git deployment is enabled');
const query=async sql=>{
  if(!/^\s*SELECT\b/i.test(sql))throw Error('Only SELECT queries are permitted');
  const result=await call('/d1/database/'+PRODUCTION_AUTH_DB+'/query',d1Token,'POST',{sql});
  if(!Array.isArray(result))throw Error('Unexpected D1 response');
  return result.flatMap(x=>x.results||[]);
};
const bookmark=await call('/d1/database/'+PRODUCTION_AUTH_DB+'/time_travel/bookmark',d1Token);
if(!bookmark?.bookmark)throw Error('Time Travel bookmark unavailable');
const objects=await query("SELECT name,type FROM sqlite_master WHERE type IN ('table','index','trigger')");
const nameToType=new Map(objects.map(x=>[x.name,x.type]));
const required=[
  ['user','table'],['session','table'],['passkey','table'],
  ['auth_passkey_login_proof','table'],
  ['auth_primary_passkey','table'],
  ['auth_primary_passkey_proof','table'],
  ['auth_recovery_code','table'],
  ['auth_recovery_attempt','table'],
  ['auth_primary_transfer_gate','table'],
  ['auth_primary_phone_transfer_attempt','table'],
  ['auth_primary_passkey_assign','trigger'],
  ['auth_primary_passkey_no_delete','trigger'],
  ['auth_primary_passkey_no_id_change','trigger'],
  ['auth_primary_passkey_no_reassign','trigger'],
  ['auth_primary_passkey_no_mapping_delete','trigger'],
  ['auth_primary_passkey_no_user_change','trigger'],
  ['auth_primary_transfer_gate_valid','trigger']
];
for(const [name,type] of required)
  if(nameToType.get(name)!==type)throw Error('Migration object absent or wrong type: '+name);

const counts=await query('SELECT (SELECT COUNT(*) FROM "user") AS users, (SELECT COUNT(*) FROM "passkey") AS passkeys, (SELECT COUNT(*) FROM "auth_primary_passkey") AS primaries');
const count=counts[0]||{};
for(const key of ['users','passkeys','primaries'])
  if(!Number.isSafeInteger(Number(count[key]))||Number(count[key])<0)
    throw Error('Invalid aggregate production account count: '+key);
const incomplete=await query('SELECT COUNT(*) AS n FROM "passkey" p WHERE NOT EXISTS (SELECT 1 FROM "auth_primary_passkey" m WHERE m."userId"=p."userId")');
const invalid=await query('SELECT COUNT(*) AS n FROM "auth_primary_passkey" m LEFT JOIN "passkey" p ON p."id"=m."passkeyId" AND p."userId"=m."userId" WHERE p."id" IS NULL');
const orphan=await query('SELECT COUNT(*) AS n FROM "passkey" p LEFT JOIN "user" u ON p."userId"=u."id" WHERE u."id" IS NULL');
if([incomplete,invalid,orphan].some(x=>Number(x[0]?.n)!==0))
  throw Error('Passkey ownership or primary mapping invariants violated');
const live=await fetch('https://eloscanner.com/api/auth/config',{
  headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
if(!live.ok||(await live.json()).registrationOpen!==false)
  throw Error('Public signup not confirmed closed');
const post=await call('/pages/projects/'+PROJECT,pagesToken);
assertProduction(post);
assertPreviewIsolation(post);
if(post.source?.config?.production_deployments_enabled!==false||
  post.source?.config?.preview_deployment_setting!=='none')
  throw Error('Native auto-deploy unexpectedly enabled');
console.log(JSON.stringify({productionD1Id:PRODUCTION_AUTH_DB,
  requiredObjectsPresent:required.length,users:Number(count.users),
  passkeys:Number(count.passkeys),primaries:Number(count.primaries),
  orphanPasskeys:0,brokenPrimaryMappings:0,
  recoveryBookmarkAvailable:true,signupClosed:true,autoDeployDisabled:true,
  readOnly:true,migrationsAppliedByThisWorkflow:false}));
console.log('SUCCESS: production migration schema and referential invariants verified by SELECT only.');
