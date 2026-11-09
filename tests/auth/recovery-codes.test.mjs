import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { createRecoveryCodeSet, rotateRecoveryCodes, consumeRecoveryCode } from '../../lib/auth/recovery-codes.mjs';

const secret = 'synthetic-recovery-secret-at-least-32-characters';
function user(db,id) {
  db.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)')
    .run(id,id,id+'@accounts.invalid',0,'2026-11-09T00:00:00Z','2026-11-09T00:00:00Z',id);
}

test('recovery codes have 160 bits entropy and only keyed digests are persisted',async()=>{
  const db=database();user(db,'owner');
  const {codes,generation}=await rotateRecoveryCodes(db,secret,'owner',100);
  assert.equal(codes.length,8);
  assert.equal(new Set(codes).size,8);
  for(const code of codes)assert.match(code,/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){7}$/);
  const stored=db.sqlite.prepare('SELECT generation,digest FROM auth_recovery_code WHERE userId=?').all('owner');
  assert.equal(stored.length,8);
  assert(stored.every(x=>x.generation===generation&&/^[0-9a-f]{64}$/.test(x.digest)));
  assert(stored.every(x=>!codes.includes(x.digest)));
  assert.equal(await consumeRecoveryCode(db,secret,'owner',codes[0],200),true);
  assert.equal(await consumeRecoveryCode(db,secret,'owner',codes[0],201),false,'single use');
  assert.equal(await consumeRecoveryCode(db,secret,'other',codes[1],202),false,'account bound');
  assert.equal(await consumeRecoveryCode(db,'wrong-secret-but-still-at-least-32-chars','owner',codes[1],202),false);
  assert.equal(await consumeRecoveryCode(db,secret,'owner','invalid',203),false);
  assert.equal(await consumeRecoveryCode(db,secret,'owner',codes[1].toLowerCase(),204),true);
});

test('rotating codes invalidates every previous code and retains exactly eight',async()=>{
  const db=database();user(db,'owner');
  const old=await rotateRecoveryCodes(db,secret,'owner',100);
  const fresh=await rotateRecoveryCodes(db,secret,'owner',200);
  assert.notEqual(old.generation,fresh.generation);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n,8);
  assert.equal(await consumeRecoveryCode(db,secret,'owner',old.codes[0]),false);
  assert.equal(await consumeRecoveryCode(db,secret,'owner',fresh.codes[0]),true);
  db.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('owner');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n,0);
});

test('code generation does not write to database and rejects short server secret',async()=>{
  const db=database();user(db,'owner');
  const {codes}=await createRecoveryCodeSet(secret,'owner');
  assert.equal(codes.length,8);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n,0);
  await assert.rejects(createRecoveryCodeSet('short','owner'),/secret unavailable/);
});

test('recovery generation endpoint rejects unauthenticated and secondary-only sessions',async()=>{
  const { handleAuth }=await import('../../lib/auth/gateway.mjs');
  const db=database(),now=Date.now();
  user(db,'owner');
  db.sqlite.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
    .run('recovery-session',new Date(now+3600000).toISOString(),'recovery-token','2026-11-09T00:00:00Z','2026-11-09T00:00:00Z','owner');
  const env={AUTH_DB:db,BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:'https://eloscanner.com',
    PASSKEY_LOGIN_ENABLED:'true',PASSKEY_RP_ID:'eloscanner.com'};
  let loggedIn=false;
  const services={now:()=>now,createAuth:()=>({api:{getSession:async()=>loggedIn?{
    user:{id:'owner',username:'owner'},session:{id:'recovery-session'}
  }:null}})};
  const call=()=>handleAuth({request:new Request('https://eloscanner.com/api/auth/passkey/recovery-codes/rotate',{
    method:'POST',headers:{Origin:'https://eloscanner.com','CF-Connecting-IP':'192.0.2.85','Content-Type':'application/json'},
    body:'{}'
  }),env},services);
  assert.equal((await call()).status,401);
  loggedIn=true;
  assert.equal((await call()).status,403);
  db.sqlite.prepare('INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .run('recovery-session','owner',now-6*60*1000);
  assert.equal((await call()).status,403);
  db.sqlite.prepare('UPDATE auth_primary_passkey_proof SET verifiedAt=?').run(now);
  const response=await call();
  assert.equal(response.status,200);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.equal((await response.json()).codes.length,8);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n,8);
});

test('recovery readiness is false without migration and true only with migration',async()=>{
  const { handleAuth }=await import('../../lib/auth/gateway.mjs');
  const db=database();
  const env={AUTH_DB:db,BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:'https://eloscanner.com',
    PASSKEY_LOGIN_ENABLED:'true',PASSKEY_RP_ID:'eloscanner.com'};
  const config=async()=> (await handleAuth({
    request:new Request('https://eloscanner.com/api/auth/config'),env
  })).json();
  assert.equal((await config()).recoveryCodesReady,true);
  db.sqlite.exec('DROP TABLE auth_recovery_code');
  assert.equal((await config()).recoveryCodesReady,false);
  assert.equal((await config()).registrationOpen,false);
});

test('account UI contains one-time code controls and does not automatically request new codes',async()=>{
  const { readFileSync }=await import('node:fs');
  const html=readFileSync(new URL('../../account.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../../account.js',import.meta.url),'utf8');
  for(const id of ['recovery-codes-panel','recovery-codes-generate','recovery-codes-output',
    'recovery-codes-download','recovery-codes-copy','recovery-codes-dismiss']) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(js,/recoveryCodesReady/);
  assert.match(js,/navigator\.clipboard\.writeText/);
  assert.match(js,/URL\.createObjectURL/);
  assert.match(js,/clearRecoveryCodes\(\)/);
});
