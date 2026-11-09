import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { rotateRecoveryCodes } from '../../lib/auth/recovery-codes.mjs';
import { startPhoneTransfer, completePhoneTransfer } from '../../lib/auth/phone-transfer.mjs';
const secret='synthetic-phone-transfer-secret-over-32-characters';
const date='2026-11-09T00:00:00.000Z',source='a'.repeat(64);
function setup(now){
  const db=database();
  db.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)')
    .run('owner','owner','owner@accounts.invalid',0,date,date,'owner');
  for(const id of ['primary','secondary']){
    db.sqlite.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,createdAt) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,id,'public-'+id,'owner','credential-'+id,0,'singleDevice',0,date);
  }
  db.sqlite.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
    .run('session',new Date(now+3600000).toISOString(),'session-token',date,date,'owner');
  return db;
}
function info(){return {credential:{id:'new-phone-credential',publicKey:new Uint8Array([1,2,3]),counter:0},credentialDeviceType:'singleDevice',credentialBackedUp:false};}
test('primary phone transfer requires fresh primary proof and atomically revokes old access',async()=>{
  const now=Date.now(),db=setup(now);
  const codes=await rotateRecoveryCodes(db,secret,'owner',now);
  assert.equal(await startPhoneTransfer(db,secret,{userId:'owner',sessionId:'session',sourceDigest:source},now),null);
  db.sqlite.prepare('INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)').run('session','owner',now-301000);
  assert.equal(await startPhoneTransfer(db,secret,{userId:'owner',sessionId:'session',sourceDigest:source},now),null);
  db.sqlite.prepare('UPDATE auth_primary_passkey_proof SET verifiedAt=?').run(now);
  const attempt=await startPhoneTransfer(db,secret,{userId:'owner',sessionId:'session',sourceDigest:source},now);
  assert(attempt?.id);
  const params={attemptId:attempt.id,challenge:attempt.challenge,sourceDigest:source,
    sessionId:'session',registrationInfo:info(),credential:{response:{}}};
  assert.equal(await completePhoneTransfer(db,secret,{...params,challenge:'wrong'},now+10),false);
  assert.equal(await completePhoneTransfer(db,secret,params,now+100),true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM session').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_primary_transfer_gate').get().n,0);
  assert.notEqual(db.sqlite.prepare('SELECT passkeyId FROM auth_primary_passkey').get().passkeyId,'primary');
  assert.equal(await completePhoneTransfer(db,secret,params,now+101),false);
  assert.equal(await startPhoneTransfer(db,secret,{userId:'owner',sessionId:'session',sourceDigest:source},now+101),null);
});
test('secondary passkey proof cannot authorize transfer',async()=>{
  const now=Date.now(),db=setup(now);
  db.sqlite.prepare('INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt) VALUES(?,?,?)')
    .run('session','owner',now);
  assert.equal(await startPhoneTransfer(db,secret,{userId:'owner',sessionId:'session',sourceDigest:source},now),null);
  assert.throws(()=>db.sqlite.prepare('UPDATE auth_primary_passkey SET passkeyId=? WHERE userId=?').run('secondary','owner'),/cannot be reassigned/);
});
