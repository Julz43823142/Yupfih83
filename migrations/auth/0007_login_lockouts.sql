CREATE TABLE auth_login_lockouts (key TEXT PRIMARY KEY NOT NULL, failures INTEGER NOT NULL DEFAULT 0, tier INTEGER NOT NULL DEFAULT 0, lockedUntil INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL);
CREATE INDEX auth_login_lockouts_updated ON auth_login_lockouts(updatedAt);
