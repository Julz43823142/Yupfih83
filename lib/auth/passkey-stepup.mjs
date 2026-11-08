import { passwordFunctions } from './password.mjs';

export const PASSKEY_STEPUP_MS = 5 * 60 * 1000;

// This only authorizes migration of a legacy password account. Passwordless
// accounts need a separately reviewed passkey-based step-up or recovery flow.
export async function grantPasskeyStepup(db, secret, session, currentPassword, now = Date.now()) {
  if (!session?.user?.id || !session?.session?.id ||
      typeof currentPassword !== 'string' || !currentPassword.length || currentPassword.length > 128) return false;
  const credential = await db.prepare(
    'SELECT password FROM account WHERE userId=? AND providerId=? AND password IS NOT NULL LIMIT 1'
  ).bind(session.user.id, 'credential').first();
  if (!credential?.password) return false;
  const verified = await passwordFunctions(secret).verify({
    password: currentPassword.normalize('NFC'),
    hash: credential.password
  });
  if (!verified) return false;
  await db.prepare(`INSERT INTO auth_passkey_stepup(sessionId,userId,expiresAt)
    VALUES(?,?,?) ON CONFLICT(sessionId) DO UPDATE SET
    userId=excluded.userId, expiresAt=excluded.expiresAt`
  ).bind(session.session.id, session.user.id, now + PASSKEY_STEPUP_MS).run();
  return true;
}

export async function hasPasskeyStepup(db, session, now = Date.now()) {
  if (!session?.user?.id || !session?.session?.id) return false;
  const row = await db.prepare(`SELECT 1 AS valid FROM auth_passkey_stepup
    WHERE sessionId=? AND userId=? AND expiresAt>? LIMIT 1`
  ).bind(session.session.id, session.user.id, now).first();
  return !!row;
}

export async function consumePasskeyStepup(db, session, now = Date.now()) {
  if (!session?.user?.id || !session?.session?.id) return false;
  const result = await db.prepare(`DELETE FROM auth_passkey_stepup
    WHERE sessionId=? AND userId=? AND expiresAt>? RETURNING sessionId`
  ).bind(session.session.id, session.user.id, now).first();
  return !!result;
}
