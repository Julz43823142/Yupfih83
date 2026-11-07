import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './fixture.mjs';
import {handleAuth,recordLoginFailure} from '../../lib/auth/gateway.mjs';
import {keyedDigest} from '../../lib/auth/password.mjs';
import {bytesToHex} from '@noble/hashes/utils.js';
import {isReservedIdentity} from '../../lib/identity.mjs';
const env = () => ({ AUTH_DB:database(), BETTER_AUTH_SECRET:'Synthetic-research-only-secret-123456789', BETTER_AUTH_URL:'https://eloscanner.com', TURNSTILE_SITE_KEY:'test', TURNSTILE_SECRET_KEY:'test' });
function request(username, ip) { return new Request('https://eloscanner.com/api/auth/sign-in/username', { method:'POST', headers:{Origin:'https://eloscanner.com','Content-Type':'application/json','CF-Connecting-IP':ip}, body:JSON.stringify({username,password:'Synthetic-password-for-testing!'}) }); }
test('rotating IPv6 addresses within one /64 must not reset source challenge threshold',async()=>{
 const e=env();let hashes=0;
 const services={createAuth:()=>({handler:async()=>{hashes++;return Response.json({}, {status:401});}})};
 for(let i=1;i<=5;i++) assert.equal((await handleAuth({request:request('person_'+i,'2001:db8:1:2::'+i),env:e},services)).status,401);
 assert.equal((await handleAuth({request:request('person_6','2001:db8:1:2::6'),env:e},services)).status,403);
 assert.equal(hashes,5);
});
test('blocked source must not create new username counters or keep writing counters',async()=>{
 const e=env(); const services={createAuth:()=>({handler:async()=>Response.json({}, {status:401})})};
 for(let i=0;i<65;i++)await handleAuth({request:request('person_'+i,'192.0.2.5'),env:e},services);
 const before=JSON.stringify(e.AUTH_DB.sqlite.prepare('SELECT * FROM auth_attempts ORDER BY key').all());
 await handleAuth({request:request('new_person','192.0.2.5'),env:e},services);
 assert.equal(JSON.stringify(e.AUTH_DB.sqlite.prepare('SELECT * FROM auth_attempts ORDER BY key').all()),before);
});
test('forwarded spoofing does not bypass CF source limit; invalid IP fails closed',async()=>{
 const e=env();const services={createAuth:()=>({handler:async()=>Response.json({}, {status:401})})};
 for(let i=0;i<6;i++){
  const r=request('name_'+i,'192.0.2.77');r.headers.set('X-Forwarded-For','198.51.100.'+i);
  assert.equal((await handleAuth({request:r,env:e},services)).status,i<5?401:403);
 }
 assert.equal((await handleAuth({request:request('abc','not-an-address'),env:e},services)).status,503);
});
test('encoded/unlisted endpoints, injected fields and malformed input never expose secrets',async()=>{
 const e=env();const secret='A-SECRET-MUST-NOT-APPEAR';
 for(const path of ['sign-up/email','sign-up%2femail','%73ign-up/email','admin/list-users','list-accounts','get-access-token','update-user','reset-password','sign-in/email','sign-up/email/extra']){
  for(const method of ['GET','POST','PUT']){
   const r=new Request('https://eloscanner.com/api/auth/'+path,{method,headers:{Origin:'https://eloscanner.com','CF-Connecting-IP':'192.0.2.2','Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({password:secret,userId:'victim',role:'admin'})})});
   const response=await handleAuth({request:r,env:e});assert.ok(response.status>=400);assert.ok(!(await response.text()).includes(secret));
  }
 }
 const bad=request('legitimate','192.0.2.9');
 const error=await handleAuth({request:bad,env:e},{createAuth:()=>{throw new Error(secret);}});
 assert.equal(error.status,503);assert.ok(!(await error.text()).includes(secret));
});

test('source-throttled auth never executes cleanup deletes or credential hashing',async()=>{
 const e=env(),ip='192.0.2.80',now=Date.now();
 const key=bytesToHex(await keyedDigest(e.BETTER_AUTH_SECRET,'rate-source',ip));
 e.AUTH_DB.sqlite.prepare('INSERT INTO auth_attempts(key,count,expiresAt) VALUES(?,60,?)').run(key,now+60000);
 const prepare=e.AUTH_DB.prepare.bind(e.AUTH_DB);
 e.AUTH_DB.prepare=sql=>{
  if(/^\s*DELETE\b/i.test(sql))throw Error('Cleanup should not run after source throttling');
  return prepare(sql);
 };
 const response=await handleAuth({request:request('legitimate',ip),env:e},{createAuth:()=>{throw Error('Credential hashing should not run')}});
 assert.equal(response.status,429);
 assert.equal(e.AUTH_DB.sqlite.prepare('SELECT count FROM auth_attempts WHERE key=?').get(key).count,60);
});

test('staff-like names are reserved consistently across account, guest and leaderboard paths',()=>{
 for(const name of ['admin','a_d_m_i_n','Elo Scanner','elo-scanner-support','EloScanner Team','support_team','mod-erator','system'])
  assert.equal(isReservedIdentity(name),true,name);
 for(const name of ['chessvisitor','chess_supporter','elochess','supportive'])
  assert.equal(isReservedIdentity(name),false,name);
});

test('ten failed passwords escalate IP lockouts by ten minutes up to three days',async()=>{
 const db=database(),key='synthetic-hashed-source';let now=1800000000000;
 for(let tier=1;tier<=435;tier++){
  for(let attempt=1;attempt<10;attempt++)assert.equal(await recordLoginFailure(db,key,now),0);
  const retry=await recordLoginFailure(db,key,now);
  assert.equal(retry,Math.min(tier*600,259200),`tier ${tier}`);
  const row=db.sqlite.prepare('SELECT failures,tier,lockedUntil FROM auth_login_lockouts WHERE key=?').get(key);
  assert.equal(row.tier,tier);
  assert.equal(row.failures,0);
  assert.equal(await recordLoginFailure(db,key,now),retry);
  now=row.lockedUntil+1;
 }
});

test('locked IP is rejected before password verification and login challenges',async()=>{
 const e=env(),ip='192.0.2.170',now=Date.now();
 const key=bytesToHex(await keyedDigest(e.BETTER_AUTH_SECRET,'rate-login-failures',ip));
 e.AUTH_DB.sqlite.prepare('INSERT INTO auth_login_lockouts(key,failures,tier,lockedUntil,updatedAt) VALUES(?,?,?,?,?)').run(key,0,2,now+1200000,now);
 let calls=0;
 const response=await handleAuth({request:request('legitimate',ip),env:e},{createAuth:()=>{calls++;throw Error('must not verify password')}});
 assert.equal(response.status,429);
 assert.ok(Number(response.headers.get('Retry-After'))>0);
 assert.equal(calls,0);
});

test('attacker failures against victim username never block victim on another IP',async()=>{
 const e=env(),now=Date.now(),attacker='192.0.2.191',victim='192.0.2.192';
 const key=bytesToHex(await keyedDigest(e.BETTER_AUTH_SECRET,'rate-login-failures',attacker));
 e.AUTH_DB.sqlite.prepare('INSERT INTO auth_login_lockouts(key,failures,tier,lockedUntil,updatedAt) VALUES(?,?,?,?,?)').run(key,0,1,now+600000,now);
 let verified=0;
 const services={createAuth:()=>({handler:async()=>{verified++;return Response.json({}, {status:401});}})};
 assert.equal((await handleAuth({request:request('target_account',attacker),env:e},services)).status,429);
 assert.equal(verified,0);
 assert.equal((await handleAuth({request:request('target_account',victim),env:e},services)).status,401);
 assert.equal(verified,1);
});
