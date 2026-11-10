-- One-time desktop login challenges. The QR carries only an unguessable public
-- request identifier; the desktop's redemption secret never leaves the PC.
CREATE TABLE IF NOT EXISTS auth_qr_login (
  id TEXT NOT NULL PRIMARY KEY,
  claimDigest TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  approvedUserId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  approvedAt INTEGER,
  consumedAt INTEGER
);
CREATE INDEX IF NOT EXISTS auth_qr_login_expires_idx ON auth_qr_login(expiresAt);
