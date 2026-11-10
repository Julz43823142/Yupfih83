-- Role assignments are keyed by immutable user ID, never by mutable display name.
-- Future roles can be added through a reviewed migration.
CREATE TABLE IF NOT EXISTS auth_member_role (
  userId TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  assignedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS auth_member_role_role_idx ON auth_member_role(role);
-- Bootstrap only the pre-existing account; no public role assignment endpoint.
INSERT INTO auth_member_role (userId, role)
SELECT id, 'admin' FROM "user" WHERE lower(username) = 'sharkmeister'
ON CONFLICT(userId) DO UPDATE SET role='admin';
