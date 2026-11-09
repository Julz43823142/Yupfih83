import ipaddr from 'ipaddr.js';
import { createAuth } from './config.mjs';
import { keyedDigest, checkNewPassword, passwordFunctions } from './password.mjs';
import { bytesToHex } from '@noble/hashes/utils.js';
import { passkeyConfigured, passkeyStorageReady, primaryPasskeyStorageReady } from './passkey-policy.mjs';
import { grantPasskeyStepup, consumePasskeyStepup } from './passkey-stepup.mjs';
import { createSignupAttempt, generateSignupChallenge, signupSourceDigest } from './passkey-signup-attempt.mjs';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { rotateRecoveryCodes } from './recovery-codes.mjs';
import { startRecovery, completeRecovery } from './recovery-transfer.mjs';
import { startPhoneTransfer, completePhoneTransfer } from './phone-transfer.mjs';

// Argon2 reserves 32 MiB. Do not let parallel requests exhaust an isolate's
// 128 MiB memory budget. Rejected requests do not queue plaintext passwords.
let activeCredentialRequests = 0;
const routes = new Map([
  ['get-session', 'GET'], ['sign-up/email', 'POST'], ['sign-in/username', 'POST'], ['sign-out', 'POST'],
  ['change-password', 'POST'], ['revoke-sessions', 'POST'], ['delete-user', 'POST']
]);
const passkeyRoutes = new Map([
  ['passkey/step-up', 'POST'],
  ['passkey/password-status', 'GET'],
  ['passkey/remove-password', 'POST'],
  ['passkey/delete-account', 'POST'],
  ['passkey/generate-register-options', 'GET'],
  ['passkey/verify-registration', 'POST'],
  ['passkey/generate-authenticate-options', 'GET'],
  ['passkey/verify-authentication', 'POST'],
  ['passkey/list-user-passkeys', 'GET'],
  ['passkey/remove-secondary', 'POST'],
  ['passkey/recovery-codes/rotate', 'POST'],
  ['passkey/recovery/options', 'POST'],
  ['passkey/recovery/verify', 'POST'],
  ['passkey/phone-transfer/options', 'POST'],
  ['passkey/phone-transfer/verify', 'POST']
]);
const securityHeaders = {
  'Cache-Control': 'no-store, private', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
function reply(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { ...securityHeaders, ...extra } });
}
async function readBody(request, maxBytes = 8192) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length')) > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}
export async function consumeCounter(db, key, now, windowMs, limit = Number.MAX_SAFE_INTEGER) {
  // Atomic UPSERT, not read-then-write: parallel requests cannot all bypass the limit.
  const row = await db.prepare(`INSERT INTO auth_attempts(key,count,expiresAt) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN expiresAt<=? THEN 1 ELSE count+1 END,
    expiresAt=CASE WHEN expiresAt<=? THEN excluded.expiresAt ELSE expiresAt END
    WHERE expiresAt<=? OR count<?
    RETURNING count,expiresAt`).bind(key, now + windowMs, now, now, now, limit).first();
  return row ? row.count : limit + 1;
}
function publicUser(user) {
  return user ? { id: user.id, username: user.username, createdAt: user.createdAt } : null;
}
function safeResponse(source, data, status = source.status) {
  const headers = new Headers(securityHeaders);
  // Preserve multiple cookie headers independently; never expose session tokens in JSON.
  for (const value of source.headers.getSetCookie()) headers.append('Set-Cookie', value);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}
export async function handleAuth({ request, env }, services = {}) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
  // Public registration is intentionally hard-closed during passkey migration.
  // A legacy environment flag cannot accidentally enable password signup.
  if (/^(register|signup)(\/|$)/.test(route) || (route.startsWith('sign-up/') && route !== 'sign-up/email')) return reply({ message: 'Not found.' }, 404);
  if (route === 'sign-up/email') return reply({ code: 'REGISTRATION_CLOSED', message: 'Registration is not open yet.' }, 403);
  const passkeysOn = passkeyConfigured(env) && await passkeyStorageReady(env.AUTH_DB);
  const primaryStorageReady = passkeysOn && await primaryPasskeyStorageReady(env.AUTH_DB);
  const signupRoute = (route === 'passkey-signup/options' || route === 'passkey-signup/verify') && env.PUBLIC_SIGNUP_ENABLED === 'true' && primaryStorageReady;
  const passkeyRoute = passkeysOn && passkeyRoutes.has(route);
  if (route !== 'config' && !routes.has(route) && !passkeyRoute && !signupRoute) return reply({ message: 'Not found.' }, 404);
  const expectedMethod = route === 'config' ? 'GET' : (signupRoute ? 'POST' : passkeyRoute ? passkeyRoutes.get(route) : routes.get(route));
  if (request.method !== expectedMethod) return reply({ message: 'Method not allowed.' }, 405, { Allow: expectedMethod });
  const base = env.BETTER_AUTH_URL || 'https://eloscanner.com';
  const origin = request.headers.get('Origin');
  if (url.origin !== base || (origin && origin !== base) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return reply({ message: 'Request not allowed.' }, 403);
  }
  if (request.method === 'POST' && origin !== base) return reply({ message: 'Request not allowed.' }, 403);
  const configured = !!env.AUTH_DB && typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32;
  if (route === 'config') {
    let signupReady = false;
    if (configured && primaryStorageReady && env.PUBLIC_SIGNUP_ENABLED === 'true' && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY) {
      try { const row = await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='auth_passkey_signup_attempt'").first(); signupReady = Number(row?.count) === 1; } catch {}
    }
    let recoveryCodesReady = false;
    let phoneTransferReady = false;
    if (configured && primaryStorageReady) {
      try {
        const schema = await env.AUTH_DB.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('auth_recovery_code','auth_recovery_attempt','auth_primary_transfer_gate')"
        ).first();
        recoveryCodesReady = Number(schema?.count) === 3;
        const transferSchema = await env.AUTH_DB.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='auth_primary_phone_transfer_attempt'"
        ).first();
        phoneTransferReady = Number(transferSchema?.count) === 1;
      } catch {}
    }
    return reply({ registrationOpen: signupReady, loginConfigured: configured, passkeyReady: configured && passkeysOn, recoveryCodesReady, phoneTransferReady, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
  }
  if (!configured) return reply({ message: 'Account services are not available yet.' }, 503);
  try {
    const now = (services.now || Date.now)();
    const fetcher = services.fetch || fetch;
    const isLocal = url.hostname === 'localhost' && url.protocol === 'http:';
    const rawIp = request.headers.get('CF-Connecting-IP');
    // Trust only Cloudflare's overwritten connecting-IP header. Collapse IPv6
    // privacy addresses to /64 and mapped IPv4 to its canonical IPv4 form.
    let ip = isLocal ? 'local-test' : null;
    if (!isLocal && rawIp && ipaddr.isValid(rawIp)) {
      const address = ipaddr.process(rawIp);
      ip = address.kind() === 'ipv6'
        ? address.parts.slice(0, 4).map(part => part.toString(16)).join(':') + '::/64'
        : address.toString();
    }
    if (!ip) return reply({ message: 'Account services are temporarily unavailable.' }, 503);
    const keyFor = async (kind, value) => bytesToHex(await keyedDigest(env.BETTER_AUTH_SECRET, `rate-${kind}`, value));
    // No raw IP or username in abuse counters. Pseudonymous counters expire after
    // at most 10 minutes; cleanup is bounded and indexed. Cloudflare has its own logs.
    await env.AUTH_DB.prepare('DELETE FROM auth_attempts WHERE key IN (SELECT key FROM auth_attempts WHERE expiresAt<=? LIMIT 100)').bind(now).run();
    await env.AUTH_DB.prepare('DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt<=? LIMIT 100)').bind(new Date(now).toISOString()).run();
    if (passkeysOn) await env.AUTH_DB.prepare('DELETE FROM auth_passkey_stepup WHERE sessionId IN (SELECT sessionId FROM auth_passkey_stepup WHERE expiresAt<=? LIMIT 100)').bind(now).run();
    const sourceKey = await keyFor('source', ip);
    if (await consumeCounter(env.AUTH_DB, sourceKey, now, 60000, 60) > 60) return reply({ message: 'Too many requests. Please wait a minute.' }, 429, { 'Retry-After': '60' });
    // Keep WebAuthn ceremony costs separate from password/other account traffic.
    // These D1-backed limits are enforced before challenges or signatures are processed.
    if (passkeyRoute && (route === 'passkey/generate-authenticate-options' ||
        route === 'passkey/verify-authentication')) {
      const limit = route === 'passkey/generate-authenticate-options' ? 20 : 30;
      const key = await keyFor('passkey-' + route, ip);
      if (await consumeCounter(env.AUTH_DB, key, now, 60000, limit) > limit)
        return reply({ message: 'Too many passkey requests. Try again shortly.' }, 429, { 'Retry-After': '60' });
    }
    const data = request.method === 'POST' ? await readBody(request, passkeyRoute || signupRoute ? 16384 : 8192) : null;
    if (request.method === 'POST' && !data) return reply({ message: 'Invalid request.' }, 400);
    if (signupRoute) {
      // Do not silently switch identities when somebody is already signed in.
      // An existing member must explicitly log out before creating a separate account.
      const existing = await (services.createAuth || createAuth)(env).api.getSession({ headers: request.headers });
      if (existing?.user?.id) return reply({
        code: 'ALREADY_SIGNED_IN',
        message: 'You are already signed in. Log out before creating another account.'
      }, 409);
    }
    if (signupRoute && route === 'passkey-signup/options') {
      // This endpoint only starts a WebAuthn ceremony. No user, passkey or
      // session is created until a separate attestation-verification step exists.
      if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Registration security check unavailable.' }, 503);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply({ message: 'Invalid username.' }, 400);
      const compact = username.replace(/_/g, '');
      if (/^(?:eloscanner(?:support|staff|admin|mod|team)?|admin(?:istrator)?|moderator|mod|staff|support(?:team|desk)?|system)$/.test(compact))
        return reply({ message: 'This username is reserved.' }, 400);
      const limit = await consumeCounter(env.AUTH_DB, await keyFor('passkey-signup', ip), now, 3600000, 10);
      if (limit > 10) return reply({ message: 'Too many signup requests.' }, 429, { 'Retry-After': '3600' });
      if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048)
        return reply({ code: 'CHALLENGE_REQUIRED', message: 'Complete the security check.' }, 403);
      const check = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: data.turnstileToken }),
        signal: AbortSignal.timeout(5000)
      });
      if (!check.ok) return reply({ message: 'Security check unavailable.' }, 503);
      const verdict = await check.json();
      if (verdict.success !== true || verdict.hostname !== url.hostname || verdict.action !== 'signup')
        return reply({ code: 'CHALLENGE_REQUIRED', message: 'Security check failed.' }, 403);
      const existing = await env.AUTH_DB.prepare('SELECT id FROM "user" WHERE username=? LIMIT 1').bind(username).first();
      if (existing) return reply({ message: 'Username unavailable.' }, 409);
      const ready = await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='auth_passkey_signup_attempt'").first();
      if (Number(ready?.count) !== 1) return reply({ message: 'Registration storage unavailable.' }, 503);
      await env.AUTH_DB.prepare('DELETE FROM auth_passkey_signup_attempt WHERE id IN (SELECT id FROM auth_passkey_signup_attempt WHERE expiresAt<=? LIMIT 100)').bind(now).run();
      const challenge = generateSignupChallenge();
      const sourceDigest = await signupSourceDigest(env.BETTER_AUTH_SECRET, ip);
      const attempt = await createSignupAttempt(env.AUTH_DB, env.BETTER_AUTH_SECRET, { username, challenge, sourceDigest }, now);
      return reply({
        attemptId: attempt.id, expiresAt: attempt.expiresAt,
        publicKey: {
          challenge, rp: { id: env.PASSKEY_RP_ID, name: 'EloScanner' },
          // WebAuthn userHandle must decode to the same durable ID stored in D1.
          user: { id: btoa(attempt.id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), name: username, displayName: username },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 120000, attestation: 'none',
          // Registration UI runs only on the phone. Prefer the integrated phone
          // passkey provider; desktop visitors scan a separate navigation QR.
          // WebAuthn cannot cryptographically attest that a client is a phone.
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
          hints: ['client-device']
        }
      });
    }
    if (signupRoute && route === 'passkey-signup/verify') {
      if (typeof data.attemptId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.attemptId) ||
          typeof data.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.challenge) ||
          !data.credential || typeof data.credential !== 'object' || Array.isArray(data.credential))
        return reply({ message: 'Invalid registration response.' }, 400);
      const sourceDigest = await signupSourceDigest(env.BETTER_AUTH_SECRET, ip);
      const row = await env.AUTH_DB.prepare('SELECT username,challengeDigest,expiresAt,consumedAt,sourceDigest FROM auth_passkey_signup_attempt WHERE id=?')
        .bind(data.attemptId).first();
      const expectedDigest = bytesToHex(await keyedDigest(env.BETTER_AUTH_SECRET, 'passkey-signup-challenge', data.challenge));
      if (!row || row.challengeDigest !== expectedDigest || row.sourceDigest !== sourceDigest ||
          row.consumedAt !== null || row.expiresAt <= now)
        return reply({ message: 'Registration expired. Start again.' }, 403);
      let verified;
      try {
        verified = await (services.verifyRegistrationResponse || verifyRegistrationResponse)({
          response: data.credential, expectedChallenge: data.challenge,
          expectedOrigin: base, expectedRPID: env.PASSKEY_RP_ID,
          requireUserVerification: true
        });
      } catch {
        return reply({ message: 'Passkey verification failed.' }, 403);
      }
      const info = verified?.registrationInfo;
      if (!verified?.verified || !info?.credential?.id || !info.credential.publicKey)
        return reply({ message: 'Passkey verification failed.' }, 403);
      const id = data.attemptId;
      const iso = new Date(now).toISOString();
      const keyBytes = info.credential.publicKey;
      const publicKey = btoa(String.fromCharCode(...keyBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const credentialId = info.credential.id;
      try {
        // D1 batch executes in a single transaction: a failed unique constraint,
        // consumed attempt or passkey insert rolls back the entire signup.
        await env.AUTH_DB.batch([
          env.AUTH_DB.prepare('UPDATE auth_passkey_signup_attempt SET consumedAt=? WHERE id=? AND consumedAt IS NULL AND expiresAt>? AND challengeDigest=? AND sourceDigest=?')
            .bind(now, id, now, expectedDigest, sourceDigest),
          env.AUTH_DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,username,displayUsername) SELECT id,username,id || \'@accounts.invalid\',0,?,?,username,username FROM auth_passkey_signup_attempt WHERE id=? AND consumedAt=?')
            .bind(iso, iso, id, now),
          env.AUTH_DB.prepare('INSERT INTO passkey (id,name,publicKey,userId,credentialID,counter,deviceType,backedUp,transports,createdAt,aaguid) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            .bind(crypto.randomUUID(), 'Phone passkey', publicKey, id, credentialId, info.credential.counter || 0,
              info.credentialDeviceType || 'singleDevice', info.credentialBackedUp ? 1 : 0,
              Array.isArray(data.credential.response?.transports) ? JSON.stringify(data.credential.response.transports) : null,
              iso, info.aaguid || null)
        ]);
      } catch {
        return reply({ message: 'Account could not be created. Try again.' }, 409);
      }
      // Only this server-side call can reach the internal Better Auth endpoint;
      // the public gateway rejects its route. The account ID is the verified
      // attempt ID, not a user-selected credential from a second passkey prompt.
      try {
        const auth = (services.createAuth || createAuth)(env);
        const sessionResponse = await auth.api.completeVerifiedPasskeySignup({
          body: { userId: id }, headers: request.headers, asResponse: true
        });
        const sessionData = await sessionResponse.clone().json();
        if (sessionResponse.ok && sessionData.user?.id === id &&
            sessionData.user?.username === row.username && sessionResponse.headers.getSetCookie().length) {
          // Successful phone credential registration is a fresh verified
          // assertion of control for this *new* primary credential. Bind
          // the proof to the server-issued session, never to client input.
          // The internal verified-signup API may return a user and cookie
          // without a session object. This account was just created and has
          // exactly one session; only then is it safe to bind primary proof.
          const issued = await env.AUTH_DB.prepare(
            'SELECT id FROM session WHERE userId=? LIMIT 2'
          ).bind(id).all();
          if (issued.results?.length === 1) {
            await env.AUTH_DB.prepare(
              'INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?) ON CONFLICT(sessionId) DO UPDATE SET userId=excluded.userId,verifiedAt=excluded.verifiedAt'
            ).bind(issued.results[0].id,id,now).run();
          }
          return safeResponse(sessionResponse, {
            success: true, username: row.username, loggedIn: true,
            user: publicUser(sessionData.user)
          }, 201);
        }
      } catch {
        // The user/passkey transaction already committed. Do not claim login
        // succeeded, and do not replay registration after a session failure.
      }
      return reply({ success: true, username: row.username, loggedIn: false }, 201);
    }
    const authEnv = passkeysOn ? env : { ...env, PASSKEY_LOGIN_ENABLED: 'false' };
    const auth = (services.createAuth || createAuth)(authEnv);
    let securityChangeUserId = null;
    if (passkeysOn && route === 'revoke-sessions') {
      // Capture the identity BEFORE the library revokes/rotates the session.
      const before = await auth.api.getSession({ headers: request.headers });
      securityChangeUserId = before?.user?.id || null;
    }
    if (passkeyRoute && (route === 'passkey/phone-transfer/options' || route === 'passkey/phone-transfer/verify')) {
      if (!primaryStorageReady) return reply({ message:'Phone transfer is unavailable.' },503);
      const schema=await env.AUTH_DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('auth_primary_phone_transfer_attempt','auth_primary_transfer_gate')"
      ).first();
      if(Number(schema?.count)!==2) return reply({ message:'Phone transfer is unavailable.' },503);
      const session=await auth.api.getSession({headers:request.headers});
      if(!session?.user?.id||!session?.session?.id)return reply({message:'Sign in using your primary passkey.'},401);
      const count=await consumeCounter(env.AUTH_DB,await keyFor('phone-transfer',session.user.id),now,3600000,6);
      if(count>6)return reply({message:'Too many transfer attempts.'},429,{'Retry-After':'3600'});
      const sourceDigest=await keyFor('phone-transfer-source',ip);
      if(route==='passkey/phone-transfer/options'){
        const attempt=await startPhoneTransfer(env.AUTH_DB,env.BETTER_AUTH_SECRET,{
          userId:session.user.id,sessionId:session.session.id,sourceDigest
        },now);
        if(!attempt)return reply({message:'Verify your primary passkey again before transferring.'},403);
        const username=session.user.username;
        return reply({attemptId:attempt.id,challenge:attempt.challenge,publicKey:{
          challenge:attempt.challenge,rp:{id:env.PASSKEY_RP_ID,name:'EloScanner'},
          user:{id:btoa(attempt.userId).split('+').join('-').split('/').join('_').replace(/=+$/,''),name:username,displayName:username},
          pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
          timeout:120000,attestation:'none',
          authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},
          hints:['client-device']
        }});
      }
      if(typeof data.attemptId!=='string'||typeof data.challenge!=='string'||!data.credential||typeof data.credential!=='object')
        return reply({message:'Invalid transfer response.'},400);
      let verified;
      try{
        verified=await (services.verifyRegistrationResponse||verifyRegistrationResponse)({
          response:data.credential,expectedChallenge:data.challenge,expectedOrigin:base,
          expectedRPID:env.PASSKEY_RP_ID,requireUserVerification:true
        });
      }catch{return reply({message:'New phone passkey verification failed.'},403);}
      if(!verified?.verified||!verified.registrationInfo?.credential?.publicKey)
        return reply({message:'New phone passkey verification failed.'},403);
      const success=await completePhoneTransfer(env.AUTH_DB,env.BETTER_AUTH_SECRET,{
        attemptId:data.attemptId,challenge:data.challenge,sourceDigest,sessionId:session.session.id,
        credential:data.credential,registrationInfo:verified.registrationInfo
      },now);
      return success?reply({success:true,message:'New primary passkey installed. Sign in again and save new recovery codes.'})
        :reply({message:'Phone transfer expired or failed. Start again.'},403);
    }
    if (passkeyRoute && (route === 'passkey/recovery/options' || route === 'passkey/recovery/verify')) {
      if (!primaryStorageReady) return reply({ message: 'Recovery is unavailable.' }, 503);
      const schema = await env.AUTH_DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('auth_recovery_code','auth_recovery_attempt','auth_primary_transfer_gate')"
      ).first();
      if (Number(schema?.count) !== 3) return reply({ message: 'Recovery is unavailable.' }, 503);
      const counter = await consumeCounter(env.AUTH_DB, await keyFor('recovery-ceremony', ip), now, 3600000, 8);
      if (counter > 8) return reply({ message: 'Too many recovery attempts. Try again later.' }, 429, { 'Retry-After': '3600' });
      const sourceDigest = await keyFor('recovery-source', ip);
      if (route === 'passkey/recovery/options') {
        const username=typeof data.username==='string'?data.username.trim().toLowerCase():'';
        const attempt=await startRecovery(env.AUTH_DB,env.BETTER_AUTH_SECRET,{
          username,code:data.code,sourceDigest
        },now);
        if (!attempt) return reply({ message: 'Invalid recovery credentials.' }, 403);
        return reply({
          attemptId:attempt.id,challenge:attempt.challenge,
          publicKey:{
            challenge:attempt.challenge,rp:{id:env.PASSKEY_RP_ID,name:'EloScanner'},
            user:{id:btoa(attempt.userId).split('+').join('-').split('/').join('_').replace(/=+$/,''),name:username,displayName:username},
            pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
            timeout:120000,attestation:'none',
            authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},
            hints:['client-device']
          }
        });
      }
      if (typeof data.attemptId!=='string' || typeof data.challenge!=='string' ||
          !data.credential || typeof data.credential!=='object' || Array.isArray(data.credential))
        return reply({ message:'Invalid recovery response.' },400);
      let verified;
      try {
        verified=await (services.verifyRegistrationResponse||verifyRegistrationResponse)({
          response:data.credential,expectedChallenge:data.challenge,expectedOrigin:base,
          expectedRPID:env.PASSKEY_RP_ID,requireUserVerification:true
        });
      } catch { return reply({ message:'Recovery verification failed.' },403); }
      if (!verified?.verified || !verified.registrationInfo?.credential?.publicKey)
        return reply({ message:'Recovery verification failed.' },403);
      const success=await completeRecovery(env.AUTH_DB,env.BETTER_AUTH_SECRET,{
        attemptId:data.attemptId,challenge:data.challenge,sourceDigest,
        credential:data.credential,registrationInfo:verified.registrationInfo
      },now);
      return success?reply({ success:true,message:'Primary passkey replaced. Sign in with your new passkey. All previous sessions and recovery codes have been revoked.' })
        :reply({ message:'Recovery expired or could not be completed. Start again.' },403);
    }
    if (passkeyRoute && route === 'passkey/recovery-codes/rotate') {
      if (!primaryStorageReady) return reply({ message: 'Recovery storage is unavailable.' }, 503);
      const schema = await env.AUTH_DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('auth_recovery_code','auth_recovery_attempt','auth_primary_transfer_gate')"
      ).first();
      if (Number(schema?.count) !== 3) return reply({ message: 'Recovery storage is unavailable.' }, 503);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.session?.id || !session?.user?.id) return reply({ message: 'Please log in.' }, 401);
      const count = await consumeCounter(env.AUTH_DB, await keyFor('recovery-rotate', session.user.id), now, 3600000, 3);
      if (count > 3) return reply({ message: 'Too many recovery changes. Try again later.' }, 429, { 'Retry-After': '3600' });
      const proof = await env.AUTH_DB.prepare(
        'SELECT 1 AS valid FROM auth_primary_passkey_proof WHERE sessionId=? AND userId=? AND verifiedAt>? LIMIT 1'
      ).bind(session.session.id, session.user.id, now - 5 * 60 * 1000).first();
      if (!proof) return reply({ message: 'Verify your primary passkey before generating recovery codes.' }, 403);
      // One-time plaintext disclosure only; response has no-store headers.
      // Rotation invalidates all prior codes atomically.
      const result = await rotateRecoveryCodes(env.AUTH_DB, env.BETTER_AUTH_SECRET, session.user.id, now);
      return reply({ codes: result.codes, message: 'Save these codes now. They will not be shown again.' });
    }
    if (passkeyRoute && route === 'passkey/remove-secondary') {
      if (!primaryStorageReady) return reply({ message: 'Passkey management is unavailable.' }, 503);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.session?.id || !session?.user?.id) return reply({ message: 'Please log in.' }, 401);
      const credentialId = data?.passkeyId;
      if (typeof credentialId !== 'string' || credentialId.length < 1 || credentialId.length > 128 ||
          !/^[a-zA-Z0-9_-]+$/.test(credentialId))
        return reply({ message: 'Invalid passkey identifier.' }, 400);
      const count = await consumeCounter(env.AUTH_DB, await keyFor('passkey-remove', session.user.id), now, 600000, 5);
      if (count > 5) return reply({ message: 'Too many passkey changes. Try again later.' }, 429, { 'Retry-After': '600' });
      const proof = await env.AUTH_DB.prepare(
        'SELECT 1 AS valid FROM auth_primary_passkey_proof WHERE sessionId=? AND userId=? AND verifiedAt>? LIMIT 1'
      ).bind(session.session.id, session.user.id, now - 10 * 60 * 1000).first();
      if (!proof) return reply({ message: 'Verify your primary passkey before changing passkeys.' }, 403);
      // SQL guards against deletion of the primary credential, even if the
      // client submits its ID or a concurrently modified account mapping.
      const removed = await env.AUTH_DB.prepare(
        'DELETE FROM passkey WHERE id=? AND userId=? AND NOT EXISTS (SELECT 1 FROM auth_primary_passkey m WHERE m.userId=? AND m.passkeyId=passkey.id) RETURNING id'
      ).bind(credentialId, session.user.id, session.user.id).first();
      if (!removed) return reply({ message: 'Passkey cannot be removed.' }, 409);
      return reply({ success: true });
    }
    if (passkeyRoute && route === 'passkey/step-up') {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return reply({ message: 'Please log in.' }, 401);
      const attempts = await consumeCounter(env.AUTH_DB, await keyFor('passkey-stepup', session.user.id), now, 600000, 5);
      if (attempts > 5) return reply({ message: 'Too many attempts. Try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      if (activeCredentialRequests >= 1) return reply({ code: 'AUTH_BUSY', message: 'Authentication is busy. Try again.' }, 429, { 'Retry-After': '2' });
      activeCredentialRequests++;
      let confirmed = false;
      try { confirmed = await grantPasskeyStepup(env.AUTH_DB, env.BETTER_AUTH_SECRET, session, data.currentPassword, now); }
      finally { activeCredentialRequests--; }
      return confirmed ? reply({ success: true }) : reply({ message: 'Password confirmation failed.' }, 403);
    }
    // A completed WebAuthn login creates a fresh Better Auth session. Proof
    // tied to its exact session ID is required for passwordless account actions.
    const hasFreshPasskeyLogin = async (session, maxAge = 10 * 60 * 1000) => {
      const proof = await env.AUTH_DB.prepare(
        'SELECT 1 AS valid FROM auth_passkey_login_proof WHERE sessionId=? AND userId=? AND verifiedAt>? LIMIT 1'
      ).bind(session.session.id, session.user.id, now - maxAge).first();
      return !!proof;
    };
    if (passkeyRoute && ['passkey/password-status', 'passkey/remove-password', 'passkey/delete-account'].includes(route)) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user?.id || !session?.session?.id) return reply({ message: 'Please log in.' }, 401);
      const account = await env.AUTH_DB.prepare(
        "SELECT id,password FROM account WHERE userId=? AND providerId='credential' LIMIT 1"
      ).bind(session.user.id).first();
      const keys = await env.AUTH_DB.prepare(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN backedUp=1 THEN 1 ELSE 0 END) AS synced FROM passkey WHERE userId=?'
      ).bind(session.user.id).first();
      const fresh = await hasFreshPasskeyLogin(session);
      const backupReady = Number(keys?.total) >= 2 || Number(keys?.synced) >= 1;
      if (route === 'passkey/password-status') return reply({
        passwordEnabled: !!account?.password,
        passkeyCount: Number(keys?.total) || 0,
        backupReady,
        recentPasskeyLogin: fresh
      });
      if (route === 'passkey/remove-password') {
        if (!account?.password) return reply({ message: 'Password already disabled.' }, 409);
        if (!backupReady) return reply({ message: 'Add a backed-up passkey or two distinct passkeys before removing your password.' }, 409);
        if (!fresh) return reply({ message: 'Sign out and sign in with your passkey first, then return within ten minutes.' }, 403);
        if (data.confirm !== 'REMOVE_PASSWORD' || typeof data.currentPassword !== 'string' ||
            data.currentPassword.length < 1 || data.currentPassword.length > 128)
          return reply({ message: 'Confirm your current password and the irreversible action.' }, 400);
        const attempts = await consumeCounter(env.AUTH_DB, await keyFor('remove-password', session.user.id), now, 600000, 5);
        if (attempts > 5) return reply({ message: 'Too many password confirmation attempts.' }, 429, { 'Retry-After': '600' });
        if (activeCredentialRequests >= 1) return reply({ code: 'AUTH_BUSY', message: 'Authentication is busy.' }, 429, { 'Retry-After': '2' });
        activeCredentialRequests++;
        let verified = false;
        try {
          verified = await passwordFunctions(env.BETTER_AUTH_SECRET).verify({
            password: data.currentPassword.normalize('NFC'), hash: account.password
          });
        } finally { activeCredentialRequests--; }
        if (!verified) return reply({ message: 'Current password is incorrect.' }, 403);
        const result = await env.AUTH_DB.prepare(
          "UPDATE account SET password=NULL WHERE id=? AND userId=? AND providerId='credential' AND password=? RETURNING id"
        ).bind(account.id, session.user.id, account.password).first();
        if (!result) return reply({ message: 'Password changed in another session. Refresh and retry.' }, 409);
        // Revoke all other sessions so they must authenticate with a passkey.
        await env.AUTH_DB.prepare('DELETE FROM session WHERE userId=? AND id<>?')
          .bind(session.user.id, session.session.id).run();
        await env.AUTH_DB.prepare('DELETE FROM auth_passkey_stepup WHERE userId=?')
          .bind(session.user.id).run();
        return reply({ success: true, passwordEnabled: false });
      }
      if (account?.password) return reply({ message: 'Use the password-confirmed account deletion while a password exists.' }, 409);
      if (!fresh || !(await hasFreshPasskeyLogin(session, 2 * 60 * 1000)))
        return reply({ message: 'Sign out and sign in again with your passkey before deleting your account.' }, 403);
      if (data.confirm !== 'DELETE_MY_ACCOUNT') return reply({ message: 'Explicit account deletion confirmation required.' }, 400);
      const signedOut = await auth.api.signOut({ headers: request.headers, asResponse: true });
      if (!signedOut.ok) return reply({ message: 'Could not sign out safely.' }, 503);
      await env.AUTH_DB.prepare('DELETE FROM "user" WHERE id=?').bind(session.user.id).run();
      return safeResponse(signedOut, { success: true });
    }
    let passkeySession = null;
    if (passkeyRoute && (route === 'passkey/generate-register-options' || route === 'passkey/verify-registration' || route === 'passkey/list-user-passkeys')) {
      passkeySession = await auth.api.getSession({ headers: request.headers });
      if (!passkeySession) return reply({ message: 'Please log in.' }, 401);
    }
    if (passkeyRoute && route === 'passkey/generate-register-options') {
      // Existing password users may complete the verified migration step-up.
      // Passwordless users must have signed in with their *primary* passkey,
      // not a secondary key or a stolen browser session.
      const primaryProof = primaryStorageReady ? await env.AUTH_DB.prepare(
        'SELECT 1 AS valid FROM auth_primary_passkey_proof WHERE sessionId=? AND userId=? AND verifiedAt>? LIMIT 1'
      ).bind(passkeySession.session.id, passkeySession.user.id, now - 10 * 60 * 1000).first() : null;
      const count = await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM passkey WHERE userId=?').bind(passkeySession.user.id).first();
      if ((count?.count || 0) >= 5) return reply({ message: 'Maximum of five passkeys per account.' }, 409);
      if (!(await consumePasskeyStepup(env.AUTH_DB, passkeySession, now)) && !primaryProof)
        return reply({ message: 'Confirm your current password or sign in with your primary passkey within ten minutes.' }, 403);
    }
    let body;
    if (route === 'sign-up/email') {
      if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Registration security check unavailable.' }, 503);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply({ message: 'Use 3–24 letters, digits or underscores for your username.' }, 400);
      // A newly registered account must not impersonate official site operators.
      const compactName = username.replace(/_/g, '');
      if (/^(?:eloscanner(?:support|staff|admin|mod|team)?|admin(?:istrator)?|moderator|mod|staff|support(?:team|desk)?|system)$/.test(compactName))
        return reply({ message: 'This username is reserved. Choose another.' }, 400);
      const signupCount = await consumeCounter(env.AUTH_DB, await keyFor('signup-source', ip), now, 3600000, 10);
      if (signupCount > 10) return reply({ message: 'Too many registration attempts. Try again later.' }, 429, { 'Retry-After': '3600' });
      if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) return reply({ code: 'CHALLENGE_REQUIRED', message: 'Complete the security check.' }, 403);
      const challengeResponse = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:data.turnstileToken}),signal:AbortSignal.timeout(5000) });
      if (!challengeResponse.ok) return reply({ message: 'Security check unavailable.' }, 503);
      const challenge = await challengeResponse.json();
      if (challenge.success !== true || challenge.hostname !== url.hostname || challenge.action !== 'signup') return reply({ code: 'CHALLENGE_REQUIRED', message: 'Security check failed. Try again.' }, 403);
      const error = await checkNewPassword(data.password, username, fetcher);
      if (error) return reply({ message: error }, 400);
      body = { email: crypto.randomUUID() + '@accounts.invalid', name: username, username, password: data.password.normalize('NFC') };
    } else if (route === 'sign-in/username') {
      const name = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(name) || typeof data.password !== 'string' || !data.password.length || data.password.length > 128) {
        return reply({ message: 'Username or password is incorrect.' }, 401);
      }
      const [accountKey, loginSourceKey] = await Promise.all([keyFor('account', name), keyFor('login-source', ip)]);
      const sourceCount = await consumeCounter(env.AUTH_DB, loginSourceKey, now, 600000, 100);
      if (sourceCount > 100) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      const accountCount = await consumeCounter(env.AUTH_DB, accountKey, now, 600000, 30);
      if (accountCount > 30 || sourceCount > 100) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      if (accountCount > 5 || sourceCount > 5) {
        if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply({ message: 'Security check unavailable. Please try again later.' }, 503);
        if (typeof data.turnstileToken !== 'string' || !data.turnstileToken.length || data.turnstileToken.length > 2048) {
          return reply({ code: 'CHALLENGE_REQUIRED', message: 'Please complete the security check.' }, 403);
        }
        const check = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: data.turnstileToken }), signal: AbortSignal.timeout(5000)
        });
        if (!check.ok) return reply({ message: 'Security check unavailable.' }, 503);
        const result = await check.json();
        if (result.success !== true || result.hostname !== url.hostname || result.action !== 'login') {
          return reply({ code: 'CHALLENGE_REQUIRED', message: 'Please try the security check again.' }, 403);
        }
      }
      body = { username: name, password: data.password.normalize('NFC'), rememberMe: data.rememberMe === true };
    } else if (route === 'change-password' || route === 'delete-user') {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return reply({ message: 'Please log in.' }, 401);
      if (passkeysOn && route === 'change-password') securityChangeUserId = session.user.id;
      const count = await consumeCounter(env.AUTH_DB, await keyFor('sensitive', session.user.id), now, 600000, 5);
      if (count > 5) return reply({ message: 'Too many attempts. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
      const current = route === 'change-password' ? data.currentPassword : data.password;
      if (typeof current !== 'string' || !current.length || current.length > 128) return reply({ message: 'Enter your current password.' }, 400);
      if (route === 'change-password') {
        const error = await checkNewPassword(data.newPassword, session.user.username, fetcher);
        if (error) return reply({ message: error }, 400);
        body = { currentPassword: current.normalize('NFC'), newPassword: data.newPassword.normalize('NFC'), revokeOtherSessions: true };
      } else body = { password: current.normalize('NFC') };
    } else if (passkeyRoute && (route === 'passkey/verify-registration' || route === 'passkey/verify-authentication')) {
      if (!data.response || typeof data.response !== 'object' || Array.isArray(data.response)) return reply({ message: 'Invalid passkey response.' }, 400);
      body = { response: data.response, ...(route === 'passkey/verify-registration' ? { name: String(passkeySession.user.username).slice(0, 24) } : {}) };
    } else if (request.method === 'POST') body = {};
    const headers = new Headers({ 'Origin': base, 'Content-Type': 'application/json' });
    if (request.headers.has('Cookie')) headers.set('Cookie', request.headers.get('Cookie'));
    // Pass only explicitly allowed fields and headers to the library.
    const internalURL = `${base}/api/auth/${route}` + (passkeyRoute && route === 'passkey/generate-register-options' ? `?name=${encodeURIComponent(passkeySession.user.username)}` : '');
    const internal = new Request(internalURL, {
      method: request.method, headers, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const expensive = ['sign-up/email', 'sign-in/username', 'change-password', 'delete-user'].includes(route);
    if (expensive && activeCredentialRequests >= 1) return reply({ code: 'AUTH_BUSY', message: 'Authentication is processing another request. Retrying shortly may help.' }, 429, { 'Retry-After': '2' });
    if (expensive) activeCredentialRequests++;
    let result;
    try { result = await auth.handler(internal); }
    finally { if (expensive) activeCredentialRequests--; }
    if (!result.ok) {
      if (passkeyRoute) return reply({ message: 'Passkey request could not be completed.' }, result.status >= 500 ? 503 : result.status);
      // Do not expose Better Auth's raw error bodies or internal diagnostics.
      if (route === 'sign-up/email') {
        if (result.status === 409 || result.status === 422) return safeResponse(result, { code: 'USERNAME_UNAVAILABLE', message: 'This username is unavailable. Try another username.' });
        if (result.status >= 500) return reply({ code: 'SIGNUP_UNAVAILABLE', message: 'Registration service is temporarily unavailable. Please try later.' }, 503);
        return safeResponse(result, { code: 'SIGNUP_FAILED', message: 'Account creation failed. Check your username and password, then try again.' });
      }
      return safeResponse(result, { message: route === 'sign-in/username' ? 'Username or password is incorrect.' : route === 'change-password' ? 'Password change failed. Check your current and new passwords.' : route === 'delete-user' ? 'Account deletion failed. Check your password.' : 'Account request could not be completed.' });
    }
    // A password or session security change invalidates outstanding migration
    // approvals. Never leave a five-minute passkey enrollment grant alive.
    if (passkeysOn && securityChangeUserId && ['change-password', 'revoke-sessions'].includes(route)) {
      await env.AUTH_DB.prepare('DELETE FROM auth_passkey_stepup WHERE userId=?')
        .bind(securityChangeUserId).run();
    }
    const output = await result.json();
    if (passkeyRoute) {
      if (route === 'passkey/generate-register-options') {
        // The existing Better Auth account uses a synthetic @accounts.invalid
        // placeholder. A WebAuthn device should display the actual username.
        return safeResponse(result, {
          ...output,
          user: { ...output.user, name: passkeySession.user.username, displayName: passkeySession.user.username }
        });
      }
      if (route === 'passkey/generate-authenticate-options') return safeResponse(result, output);
      if (route === 'passkey/verify-authentication') {
        // A successful assertion is not enough: bind the proof to the specific
        // HTTP-only session cookie returned by Better Auth, and same account ID.
        const cookieHeader = result.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
        if (cookieHeader && output?.user?.id) {
          const sessionHeaders = new Headers({ Cookie: cookieHeader, Origin: base });
          const session = await auth.api.getSession({ headers: sessionHeaders });
          if (session?.user?.id === output.user.id && session?.session?.id) {
            await env.AUTH_DB.prepare(`INSERT INTO auth_passkey_login_proof(sessionId,userId,verifiedAt)
              VALUES(?,?,?) ON CONFLICT(sessionId) DO UPDATE SET
              userId=excluded.userId,verifiedAt=excluded.verifiedAt`)
              .bind(session.session.id, session.user.id, now).run();
            if (primaryStorageReady && typeof data.response.id === 'string') {
              const primary = await env.AUTH_DB.prepare(
                'SELECT 1 AS valid FROM auth_primary_passkey m JOIN passkey p ON p.id=m.passkeyId WHERE m.userId=? AND p.credentialID=? LIMIT 1'
              ).bind(session.user.id, data.response.id).first();
              if (primary) await env.AUTH_DB.prepare(
                'INSERT INTO auth_primary_passkey_proof(sessionId,userId,verifiedAt) VALUES(?,?,?) ON CONFLICT(sessionId) DO UPDATE SET userId=excluded.userId,verifiedAt=excluded.verifiedAt'
              ).bind(session.session.id, session.user.id, now).run();
            }
          }
        }
        return safeResponse(result, { user: publicUser(output?.user), success: true });
      }
      if (route === 'passkey/list-user-passkeys') return safeResponse(result, Array.isArray(output) ? output.map(row => ({ id: row.id, name: row.name || null, createdAt: row.createdAt || null, backedUp: row.backedUp === true })) : []);
      return safeResponse(result, { success: true });
    }
    if (route === 'get-session') return safeResponse(result, { user: publicUser(output?.user), expiresAt: output?.session?.expiresAt || null });
    if (route === 'sign-in/username' || route === 'sign-up/email') return safeResponse(result, { user: publicUser(output.user) });
    return safeResponse(result, { success: true });
  } catch (error) {
    // Test harness may inspect failures locally. Never serialize exceptions,
    // request bodies, credentials or tokens into production responses.
    if (services.onError) services.onError(error);
    return reply({ message: 'Account services are temporarily unavailable. Please try again later.' }, 503);
  }
}
