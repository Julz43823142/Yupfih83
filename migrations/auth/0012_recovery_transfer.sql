-- Recovery transfer is authorized only inside a single D1 batch transaction.
-- Normal primary mapping mutations and primary deletion remain prohibited.
CREATE TABLE "auth_recovery_attempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "challengeDigest" TEXT NOT NULL,
  "codeDigest" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "consumedAt" INTEGER
);
CREATE INDEX "auth_recovery_attempt_expiry" ON "auth_recovery_attempt"("expiresAt");
CREATE TABLE "auth_primary_transfer_gate" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "oldPasskeyId" TEXT NOT NULL,
  "newPasskeyId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL UNIQUE,
  "nowMs" INTEGER NOT NULL
);
CREATE TRIGGER "auth_primary_transfer_gate_valid"
BEFORE INSERT ON "auth_primary_transfer_gate"
WHEN NOT EXISTS (
  SELECT 1 FROM "auth_recovery_attempt" a
  JOIN "auth_recovery_code" c ON c."userId"=a."userId" AND c."digest"=a."codeDigest" AND c."consumedAt" IS NULL
  JOIN "auth_primary_passkey" p ON p."userId"=a."userId"
  WHERE a."id"=NEW."attemptId" AND a."userId"=NEW."userId"
    AND a."consumedAt" IS NULL AND a."expiresAt">NEW."nowMs"
    AND p."passkeyId"=NEW."oldPasskeyId"
)
BEGIN
  SELECT RAISE(ABORT,'invalid recovery authorization');
END;
DROP TRIGGER "auth_primary_passkey_no_reassign";
CREATE TRIGGER "auth_primary_passkey_no_reassign"
BEFORE UPDATE ON "auth_primary_passkey"
WHEN OLD."passkeyId"<>NEW."passkeyId" AND NOT EXISTS (
  SELECT 1 FROM "auth_primary_transfer_gate" g
  WHERE g."userId"=OLD."userId" AND g."oldPasskeyId"=OLD."passkeyId"
    AND g."newPasskeyId"=NEW."passkeyId" AND NEW."userId"=OLD."userId"
)
BEGIN
  SELECT RAISE(ABORT,'primary passkey cannot be reassigned');
END;
CREATE TRIGGER "auth_primary_passkey_no_user_change"
BEFORE UPDATE OF "userId" ON "auth_primary_passkey"
WHEN OLD."userId"<>NEW."userId"
BEGIN SELECT RAISE(ABORT,'primary owner cannot change'); END;
DROP TRIGGER "auth_primary_passkey_no_delete";
CREATE TRIGGER "auth_primary_passkey_no_delete"
BEFORE DELETE ON "passkey"
WHEN EXISTS (
  SELECT 1 FROM "auth_primary_passkey" m JOIN "user" u ON u."id"=m."userId"
  WHERE m."passkeyId"=OLD."id" AND m."userId"=OLD."userId"
)
BEGIN SELECT RAISE(ABORT,'primary passkey cannot be deleted'); END;
CREATE TRIGGER "auth_primary_transfer_gate_cleanup"
AFTER DELETE ON "auth_primary_transfer_gate"
BEGIN SELECT 1; END;
