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
