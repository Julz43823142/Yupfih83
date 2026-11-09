import { keyedDigest } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateSignupChallenge } from './passkey-signup-attempt.mjs';

export async function recoveryDigest(secret,userId,code) {
  if (typeof secret !== 'string' || secret.length < 32 || !userId) throw Error('Recovery secret unavailable');
  return bytesToHex(await keyedDigest(secret,'eloscanner-recovery-v1',userId+'\0'+code.replaceAll('-','')));
}
export function normalizeRecoveryCode(input) {
  if (typeof input !== 'string') return null;
  const code=input.trim().toUpperCase();
  return /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){7}$/.test(code)?code:null;
}
export async function startRecovery(db,secret,{username,code,sourceDigest},now=Date.now()) {
  const normalized=normalizeRecoveryCode(code);
  if (!normalized || !/^[a-z0-9_]{3,24}$/.test(username) || !/^[a-f0-9]{64}$/.test(sourceDigest)) return null;
  const user=await db.prepare('SELECT id FROM "user" WHERE username=?').bind(username).first();
  if (!user) return null;
  const codeDigest=await recoveryDigest(secret,user.id,normalized);
  const valid=await db.prepare('SELECT 1 AS valid FROM auth_recovery_code WHERE userId=? AND digest=? AND consumedAt IS NULL')
    .bind(user.id,codeDigest).first();
  if (!valid) return null;
  const challenge=generateSignupChallenge(),id=crypto.randomUUID();
  const challengeDigest=bytesToHex(await keyedDigest(secret,'eloscanner-recovery-challenge-v1',challenge));
  await db.prepare('INSERT INTO auth_recovery_attempt(id,userId,challengeDigest,codeDigest,sourceDigest,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?)')
    .bind(id,user.id,challengeDigest,codeDigest,sourceDigest,now,now+120000).run();
  return {id,challenge,expiresAt:now+120000,userId:user.id};
}
export async function completeRecovery(db,secret,{attemptId,challenge,sourceDigest,credential,registrationInfo},now=Date.now()) {
  if (!/^[a-f0-9-]{36}$/.test(attemptId||'') || typeof challenge!=='string' ||
      !/^[a-f0-9]{64}$/.test(sourceDigest||'') || !registrationInfo?.credential?.id ||
      !registrationInfo.credential.publicKey) return false;
  const digest=bytesToHex(await keyedDigest(secret,'eloscanner-recovery-challenge-v1',challenge));
  const attempt=await db.prepare('SELECT userId,codeDigest FROM auth_recovery_attempt WHERE id=? AND challengeDigest=? AND sourceDigest=? AND consumedAt IS NULL AND expiresAt>?')
    .bind(attemptId,digest,sourceDigest,now).first();
  if (!attempt) return false;
  const primary=await db.prepare('SELECT passkeyId FROM auth_primary_passkey WHERE userId=?').bind(attempt.userId).first();
  if (!primary) return false;
  const info=registrationInfo;
  const bytes=info.credential.publicKey;
  const publicKey=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const newId=crypto.randomUUID(),iso=new Date(now).toISOString();
  try {
    await db.batch([
      db.prepare('INSERT INTO auth_primary_transfer_gate(userId,oldPasskeyId,newPasskeyId,attemptId,nowMs) VALUES(?,?,?,?,?)')
        .bind(attempt.userId,primary.passkeyId,newId,attemptId,now),
      // Revoke optional credentials too: a lost phone may have compromised them.
      // Delete before insert to respect the five-passkey DB cap.
      db.prepare('DELETE FROM passkey WHERE userId=? AND id<>?').bind(attempt.userId,primary.passkeyId),
      db.prepare('INSERT INTO passkey(id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,transports,createdAt,aaguid) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(newId,'Recovered phone passkey',publicKey,attempt.userId,info.credential.id,
          info.credential.counter||0,info.credentialDeviceType||'singleDevice',
          info.credentialBackedUp?1:0,Array.isArray(credential.response?.transports)?JSON.stringify(credential.response.transports):null,
          iso,info.aaguid||null),
      db.prepare('UPDATE auth_primary_passkey SET passkeyId=? WHERE userId=? AND passkeyId=?')
        .bind(newId,attempt.userId,primary.passkeyId),
      db.prepare('DELETE FROM passkey WHERE id=? AND userId=?').bind(primary.passkeyId,attempt.userId),
      // Trigger enforces attempt+code validity at gate creation; all mutations
      // are one D1 batch transaction, so failure rolls everything back.
      db.prepare('UPDATE auth_recovery_attempt SET consumedAt=? WHERE id=? AND consumedAt IS NULL')
        .bind(now,attemptId),
      db.prepare('DELETE FROM auth_recovery_code WHERE userId=?').bind(attempt.userId),
      db.prepare('DELETE FROM session WHERE userId=?').bind(attempt.userId),
      db.prepare('DELETE FROM auth_primary_transfer_gate WHERE userId=? AND attemptId=?').bind(attempt.userId,attemptId)
    ]);
    return true;
  } catch { return false; }
}
