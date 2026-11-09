-- Offline recovery codes: never persist plaintext. No public recovery route is enabled.
-- All codes for a user share a generation; rotation invalidates older codes.
CREATE TABLE "auth_recovery_code" (
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "generation" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "consumedAt" INTEGER,
  PRIMARY KEY ("userId","digest")
);
CREATE INDEX "auth_recovery_code_generation" ON "auth_recovery_code"("userId","generation","consumedAt");
