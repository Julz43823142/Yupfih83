import { keyedDigest } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateSignupChallenge } from './passkey-signup-attempt.mjs';

export async function startPhoneTransfer(db,secret,{userId,sessionId,sourceDigest},now=Date.now()){
  if (!userId||!sessionId||!/^[a-f0-9]{64}$/.test(sourceDigest)) return null;
  const proof=await db.prepare('SELECT 1 AS valid FROM auth_primary_passkey_proof WHERE sessionId=? AND userId=? AND verifiedAt>?')
    .bind(sessionId,userId,now-300000).first();
  if (!proof) return null;
  const id=crypto.randomUUID(),challenge=generateSignupChallenge();
  const challengeDigest=bytesToHex(await keyedDigest(secret,'eloscanner-phone-transfer-challenge-v1',challenge));
  await db.prepare('INSERT INTO auth_primary_phone_transfer_attempt(id,userId,sessionId,challengeDigest,sourceDigest,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?)')
    .bind(id,userId,sessionId,challengeDigest,sourceDigest,now,now+120000).run();
  return {id,challenge,userId};
}
export async function completePhoneTransfer(db,secret,{attemptId,challenge,sourceDigest,sessionId,registrationInfo,credential},now=Date.now()){
  if(!/^[a-f0-9-]{36}$/.test(attemptId||'')||typeof challenge!=='string'||
     !/^[a-f0-9]{64}$/.test(sourceDigest||'')||!sessionId||
     !registrationInfo?.credential?.id||!registrationInfo.credential.publicKey)return false;
  const challengeDigest=bytesToHex(await keyedDigest(secret,'eloscanner-phone-transfer-challenge-v1',challenge));
  const attempt=await db.prepare('SELECT userId FROM auth_primary_phone_transfer_attempt WHERE id=? AND sessionId=? AND challengeDigest=? AND sourceDigest=? AND consumedAt IS NULL AND expiresAt>?')
    .bind(attemptId,sessionId,challengeDigest,sourceDigest,now).first();
  if(!attempt)return false;
  const proof=await db.prepare('SELECT 1 AS valid FROM auth_primary_passkey_proof WHERE sessionId=? AND userId=? AND verifiedAt>?')
    .bind(sessionId,attempt.userId,now-300000).first();
  if(!proof)return false;
  const primary=await db.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').bind(attempt.userId).first();
  if(!primary)return false;
  const info=registrationInfo,newId=crypto.randomUUID(),iso=new Date(now).toISOString();
  const publicKey=btoa(String.fromCharCode(...info.credential.publicKey)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  try{
    await db.batch([
      db.prepare('INSERT INTO auth_primary_transfer_gate(userId,oldPasskeyId,newPasskeyId,attemptId,nowMs) VALUES(?,?,?,?,?)')
        .bind(attempt.userId,primary.passkeyId,newId,attemptId,now),
      db.prepare('DELETE FROM passkey WHERE userId=? AND id<>?').bind(attempt.userId,primary.passkeyId),
      db.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,transports,createdAt,aaguid) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(newId,'Transferred phone passkey',publicKey,attempt.userId,info.credential.id,info.credential.counter||0,
          info.credentialDeviceType||'singleDevice',info.credentialBackedUp?1:0,
          Array.isArray(credential.response?.transports)?JSON.stringify(credential.response.transports):null,iso,info.aaguid||null),
      db.prepare('UPDATE auth_primary_passkey SET passkeyId=? WHERE userId=? AND passkeyId=?')
        .bind(newId,attempt.userId,primary.passkeyId),
      db.prepare('DELETE FROM passkey WHERE id=? AND userId=?').bind(primary.passkeyId,attempt.userId),
      db.prepare('UPDATE auth_primary_phone_transfer_attempt SET consumedAt=? WHERE id=? AND consumedAt IS NULL').bind(now,attemptId),
      db.prepare('DELETE FROM auth_recovery_code WHERE userId=?').bind(attempt.userId),
      db.prepare('DELETE FROM session WHERE userId=?').bind(attempt.userId),
      db.prepare('DELETE FROM auth_primary_transfer_gate WHERE userId=? AND attemptId=?').bind(attempt.userId,attemptId)
    ]);
    return true;
  }catch{return false;}
}
