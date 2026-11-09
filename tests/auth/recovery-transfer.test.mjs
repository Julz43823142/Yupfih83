import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { rotateRecoveryCodes } from '../../lib/auth/recovery-codes.mjs';
import { startRecovery, completeRecovery } from '../../lib/auth/recovery-transfer.mjs';

const secret='synthetic-recovery-secret-at-least-32-characters';
const date='2026-11-09T00:00:00.000Z';
const source='a'.repeat(64);
function setup(){
  const db=database();
  db.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)')
    .run('owner','owner','owner@accounts.invalid',0,date,date,'owner');
  for(const id of ['phone','backup1','backup2','backup3','backup4']) {
    db.sqlite.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,createdAt) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,id,'public-'+id,'owner','credential-'+id,0,'singleDevice',0,date);
  }
  db.sqlite.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
    .run('old-session',new Date(Date.now()+3600000).toISOString(),'old-session-token',date,date,'owner');
  return db;
}
function credential(id='new-credential') {
  return {
    credential:{id,publicKey:new Uint8Array([1,2,3,4]),counter:0},
    credentialDeviceType:'singleDevice',credentialBackedUp:false,aaguid:null
  };
}
test('lost-phone recovery replaces primary, removes old passkeys/sessions/codes and rejects replay',async()=>{
  const db=setup(),now=Date.now();
  const codes=await rotateRecoveryCodes(db,secret,'owner',now);
  const a=await startRecovery(db,secret,{username:'owner',code:codes.codes[0],sourceDigest:source},now);
  assert(a?.id);
  const params={attemptId:a.id,challenge:a.challenge,sourceDigest:source,credential:{response:{}},registrationInfo:credential()};
  assert.equal(await completeRecovery(db,secret,params,now+100),true);
  const primary=db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').get('owner');
  assert(primary.passkeyId&&!['phone','backup1','backup2','backup3','backup4'].includes(primary.passkeyId));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey WHERE userId=?').get('owner').n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM session WHERE userId=?').get('owner').n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code WHERE userId=?').get('owner').n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_primary_transfer_gate').get().n,0);
  assert.equal(await completeRecovery(db,secret,params,now+101),false);
  assert.equal(await startRecovery(db,secret,{username:'owner',code:codes.codes[1],sourceDigest:source},now+102),null);
});
test('recovery attempt wrong challenge, source, expiry or invalid code leaves original primary intact',async()=>{
  const db=setup(),now=Date.now();
  const codes=await rotateRecoveryCodes(db,secret,'owner',now);
  assert.equal(await startRecovery(db,secret,{username:'owner',code:'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA',sourceDigest:source},now),null);
  const a=await startRecovery(db,secret,{username:'owner',code:codes.codes[0],sourceDigest:source},now);
  const params={attemptId:a.id,challenge:a.challenge,sourceDigest:source,credential:{response:{}},registrationInfo:credential()};
  assert.equal(await completeRecovery(db,secret,{...params,challenge:'wrong'},now+1),false);
  assert.equal(await completeRecovery(db,secret,{...params,sourceDigest:'b'.repeat(64)},now+1),false);
  assert.equal(await completeRecovery(db,secret,params,now+120001),false);
  assert.equal(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey').get().passkeyId,'phone');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n,5);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM session').get().n,1);
});
test('ordinary SQL cannot change primary without a valid recovery attempt',async()=>{
  const db=setup();
  assert.throws(()=>db.sqlite.prepare('UPDATE auth_primary_passkey SET passkeyId=? WHERE userId=?').run('backup1','owner'),/cannot be reassigned/);
  assert.throws(()=>db.sqlite.prepare('DELETE FROM passkey WHERE id=?').run('phone'),/cannot be deleted/);
  assert.throws(()=>db.sqlite.prepare('INSERT INTO auth_primary_transfer_gate(userId,oldPasskeyId,newPasskeyId,attemptId,nowMs) VALUES(?,?,?,?,?)')
    .run('owner','phone','fake','not-a-real-attempt',Date.now()),/invalid recovery authorization/);
});
