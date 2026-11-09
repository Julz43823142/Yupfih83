-- Authorized phone transfer while the old primary passkey is still available.
CREATE TABLE "auth_primary_phone_transfer_attempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "session"("id") ON DELETE CASCADE,
  "challengeDigest" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "consumedAt" INTEGER
);
CREATE INDEX "auth_primary_phone_transfer_expiry" ON "auth_primary_phone_transfer_attempt"("expiresAt");
DROP TRIGGER "auth_primary_transfer_gate_valid";
CREATE TRIGGER "auth_primary_transfer_gate_valid"
BEFORE INSERT ON "auth_primary_transfer_gate"
WHEN NOT (
  EXISTS (
    SELECT 1 FROM "auth_recovery_attempt" a
    JOIN "auth_recovery_code" c ON c."userId"=a."userId" AND c."digest"=a."codeDigest" AND c."consumedAt" IS NULL
    JOIN "auth_primary_passkey" p ON p."userId"=a."userId"
    WHERE a."id"=NEW."attemptId" AND a."userId"=NEW."userId"
      AND a."consumedAt" IS NULL AND a."expiresAt">NEW."nowMs"
      AND p."passkeyId"=NEW."oldPasskeyId"
  ) OR EXISTS (
    SELECT 1 FROM "auth_primary_phone_transfer_attempt" a
    JOIN "auth_primary_passkey_proof" proof ON proof."sessionId"=a."sessionId" AND proof."userId"=a."userId"
    JOIN "auth_primary_passkey" p ON p."userId"=a."userId"
    WHERE a."id"=NEW."attemptId" AND a."userId"=NEW."userId"
      AND a."consumedAt" IS NULL AND a."expiresAt">NEW."nowMs"
      AND proof."verifiedAt">NEW."nowMs"-300000
      AND p."passkeyId"=NEW."oldPasskeyId"
  )
)
BEGIN SELECT RAISE(ABORT,'invalid recovery authorization'); END;
