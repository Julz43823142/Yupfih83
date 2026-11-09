import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { primaryPasskeyStorageReady } from '../../lib/auth/passkey-policy.mjs';

const date = '2026-11-09T00:00:00.000Z';
function user(db, id) {
  db.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)')
    .run(id,id,id+'@accounts.invalid',0,date,date,id);
}
function key(db,id,owner) {
  db.sqlite.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,createdAt) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,'Synthetic device','public-'+id,owner,'credential-'+id,0,'singleDevice',0,date);
}

test('first passkey is assigned primary and immutable; optional keys remain removable', async () => {
  const db=database();
  assert.equal(await primaryPasskeyStorageReady(db),true);
  user(db,'owner');
  key(db,'phone','owner');
  key(db,'laptop','owner');
  assert.equal(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').get('owner').passkeyId,'phone');
  assert.throws(()=>db.sqlite.prepare('DELETE FROM passkey WHERE id=?').run('phone'),/primary passkey cannot be deleted/);
  assert.throws(()=>db.sqlite.prepare('UPDATE passkey SET id=? WHERE id=?').run('phone-renamed','phone'),/passkey ID cannot be changed/);
  assert.throws(()=>db.sqlite.prepare('UPDATE auth_primary_passkey SET passkeyId=? WHERE userId=?').run('laptop','owner'),/cannot be reassigned/);
  assert.throws(()=>db.sqlite.prepare('DELETE FROM auth_primary_passkey WHERE userId=?').run('owner'),/cannot be deleted/);
  db.sqlite.prepare('DELETE FROM passkey WHERE id=?').run('laptop');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey WHERE userId=?').get('owner').n,1);
  db.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('owner');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_primary_passkey').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n,0);
});

test('five-key cap and account ownership remain enforced by database under concurrent-like writes', () => {
  const db=database(); user(db,'owner'); user(db,'other');
  for(let i=0;i<5;i++)key(db,'key'+i,'owner');
  assert.throws(()=>key(db,'key5','owner'),/passkey limit reached/);
  assert.throws(()=>db.sqlite.prepare('UPDATE passkey SET userId=? WHERE id=?').run('other','key1'),/passkey owner cannot change/);
  assert.equal(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').get('owner').passkeyId,'key0');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey WHERE userId=?').get('owner').n,5);
});

test('legacy passkey schema remains login-capable but signup storage gate fails closed',async()=>{
  const db=database();
  db.sqlite.exec('DROP TABLE auth_primary_passkey_proof; DROP TRIGGER auth_primary_passkey_no_mapping_delete; DROP TRIGGER auth_primary_passkey_no_reassign; DROP TRIGGER auth_primary_passkey_no_id_change; DROP TRIGGER auth_primary_passkey_no_delete; DROP TRIGGER auth_primary_passkey_assign; DROP TABLE auth_primary_passkey;');
  assert.equal(await primaryPasskeyStorageReady(db),false);
});

test('secondary-passkey login proof cannot authorize optional enrollment', async () => {
  const { handleAuth } = await import('../../lib/auth/gateway.mjs');
  const db = database(), now=Date.now();
  user(db,'owner');
  key(db,'phone','owner');
  key(db,'laptop','owner');
  db.sqlite.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
    .run('current-session',new Date(now+3600000).toISOString(),'test-token',date,date,'owner');
  db.sqlite.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .run('current-session','owner',now);
  const env={AUTH_DB:db,BETTER_AUTH_SECRET:'synthetic-test-only-secret-with-over-32-characters',
    BETTER_AUTH_URL:'https://eloscanner.com',PASSKEY_LOGIN_ENABLED:'true',PASSKEY_RP_ID:'eloscanner.com'};
  const session={user:{id:'owner',username:'owner'},session:{id:'current-session'}};
  let forwarded=0;
  const services={now:()=>now,createAuth:()=>({
    api:{getSession:async()=>session},
    handler:async()=>{forwarded++;return Response.json({challenge:'synthetic-challenge',user:{id:'owner'}});}
  })};
  const call=()=>handleAuth({request:new Request('https://eloscanner.com/api/auth/passkey/generate-register-options',{
    headers:{Origin:'https://eloscanner.com','CF-Connecting-IP':'192.0.2.44'}
  }),env},services);
  assert.equal((await call()).status,403,'secondary WebAuthn proof cannot authorize enrollment');
  assert.equal(forwarded,0);
  db.sqlite.prepare('INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .run('current-session','owner',now-11*60*1000);
  assert.equal((await call()).status,403,'expired primary proof cannot authorize enrollment');
  db.sqlite.prepare('UPDATE auth_primary_passkey_proof SET verifiedAt=? WHERE sessionId=?').run(now,'current-session');
  assert.equal((await call()).status,200,'fresh primary proof permits options');
  assert.equal(forwarded,1);
});

test('public signup stays closed when primary D1 migration is not installed',async()=>{
  const { handleAuth }=await import('../../lib/auth/gateway.mjs');
  const db=database();
  db.sqlite.exec('DROP TABLE auth_primary_passkey_proof; DROP TRIGGER auth_primary_passkey_no_mapping_delete; DROP TRIGGER auth_primary_passkey_no_reassign; DROP TRIGGER auth_primary_passkey_no_id_change; DROP TRIGGER auth_primary_passkey_no_delete; DROP TRIGGER auth_primary_passkey_assign; DROP TABLE auth_primary_passkey;');
  const env={AUTH_DB:db,BETTER_AUTH_SECRET:'synthetic-test-only-secret-with-over-32-characters',
    BETTER_AUTH_URL:'https://eloscanner.com',PASSKEY_LOGIN_ENABLED:'true',PASSKEY_RP_ID:'eloscanner.com',
    PUBLIC_SIGNUP_ENABLED:'true',TURNSTILE_SITE_KEY:'test-key',TURNSTILE_SECRET_KEY:'test-secret'};
  const config=await handleAuth({request:new Request('https://eloscanner.com/api/auth/config'),env});
  assert.equal((await config.json()).registrationOpen,false);
  const attempt=await handleAuth({request:new Request('https://eloscanner.com/api/auth/passkey-signup/options',{
    method:'POST',headers:{Origin:'https://eloscanner.com','Content-Type':'application/json'},
    body:JSON.stringify({username:'testuser',turnstileToken:'test-token'})
  }),env});
  assert.equal(attempt.status,404);
});
