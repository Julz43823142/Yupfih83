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
