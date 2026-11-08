-- PREPARATION ONLY. No WebAuthn endpoints or public registration enabled by this migration.
-- Matches the Better Auth passkey plugin's credential model; validate against the
-- exact pinned plugin version before enabling it in staging.
CREATE TABLE "passkey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "publicKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "credentialID" TEXT NOT NULL UNIQUE,
  "counter" INTEGER NOT NULL DEFAULT 0 CHECK ("counter" >= 0),
  "deviceType" TEXT NOT NULL,
  "backedUp" INTEGER NOT NULL CHECK ("backedUp" IN (0,1)),
  "transports" TEXT,
  "createdAt" DATE,
  "aaguid" TEXT
);
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");

-- D1/SQLite serializes writes. A DB trigger prevents concurrent ceremonies
-- bypassing the per-user 5-passkey limit, independent of handler implementation.
CREATE TRIGGER "passkey_limit_insert"
BEFORE INSERT ON "passkey"
WHEN (SELECT COUNT(*) FROM "passkey" WHERE "userId" = NEW."userId") >= 5
BEGIN
  SELECT RAISE(ABORT, 'passkey limit reached');
END;

-- Never allow moving a credential between existing accounts as an "update".
-- Re-enrollment must create a fresh credential for the authenticated account.
CREATE TRIGGER "passkey_no_owner_change"
BEFORE UPDATE OF "userId" ON "passkey"
WHEN OLD."userId" <> NEW."userId"
BEGIN
  SELECT RAISE(ABORT, 'passkey owner cannot change');
END;

-- An existing password account must reauthenticate before binding a passkey.
-- A stolen session alone is insufficient to authorize enrollment.
CREATE TABLE "auth_passkey_stepup" (
  "sessionId" TEXT NOT NULL PRIMARY KEY REFERENCES "session"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" INTEGER NOT NULL
);
CREATE INDEX "auth_passkey_stepup_expiry" ON "auth_passkey_stepup"("expiresAt");
