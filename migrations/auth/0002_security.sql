CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX auth_attempts_expiry ON auth_attempts(expiresAt);
CREATE INDEX session_expiry ON session(expiresAt);
