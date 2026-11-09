-- A successful, verified WebAuthn authentication is tied to the exact Better Auth
-- session it created. Password removal and passwordless deletion require proof
-- from THIS session, never merely possession of an old session cookie.
CREATE TABLE "auth_passkey_login_proof" (
  "sessionId" TEXT NOT NULL PRIMARY KEY REFERENCES "session"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verifiedAt" INTEGER NOT NULL
);
CREATE INDEX "auth_passkey_login_proof_user" ON "auth_passkey_login_proof" ("userId","verifiedAt");
