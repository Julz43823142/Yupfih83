-- One-time desktop login challenges. The QR carries only an unguessable public
-- request identifier; the desktop's redemption secret never leaves the PC.
CREATE TABLE IF NOT EXISTS auth_qr_login (
  id TEXT NOT NULL PRIMARY KEY,
  claimDigest TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  approvedUserId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  approvedAt INTEGER,
  approvedSessionId TEXT,
  consumedAt INTEGER
);
CREATE INDEX IF NOT EXISTS auth_qr_login_expires_idx ON auth_qr_login(expiresAt);
-- Atomic one-approval-per-passkey-session protection, including concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS auth_qr_login_session_once_idx ON auth_qr_login(approvedSessionId);
