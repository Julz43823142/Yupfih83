-- Preview preparation for passwordless, cross-device registration.
-- Does not enable public signup or create users. Never store raw passkey private keys.
-- An attempt is created before WebAuthn and consumed once after verified proof.
CREATE TABLE "auth_passkey_signup_attempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL CHECK (length("username") BETWEEN 3 AND 24),
  "challengeDigest" TEXT NOT NULL UNIQUE,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "consumedAt" INTEGER,
  "sourceDigest" TEXT NOT NULL,
  CHECK ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
);
CREATE INDEX "auth_passkey_signup_attempt_expiry_idx"
  ON "auth_passkey_signup_attempt" ("expiresAt");
CREATE INDEX "auth_passkey_signup_attempt_source_idx"
  ON "auth_passkey_signup_attempt" ("sourceDigest", "createdAt");

-- Database-level replay prevention: once consumed, an attempt cannot be reset.
CREATE TRIGGER "auth_passkey_signup_no_reuse"
BEFORE UPDATE OF "consumedAt" ON "auth_passkey_signup_attempt"
WHEN OLD."consumedAt" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'registration attempt already consumed');
END;
