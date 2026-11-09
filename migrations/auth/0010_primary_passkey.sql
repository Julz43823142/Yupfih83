-- Primary phone-first credential invariant. Additive, no existing credentials removed.
-- The earliest existing key becomes primary for migrated accounts; this does
-- NOT prove that an existing credential was created on a phone.
CREATE TABLE "auth_primary_passkey" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "passkeyId" TEXT NOT NULL UNIQUE
);
INSERT INTO "auth_primary_passkey" ("userId","passkeyId")
SELECT p."userId",p."id" FROM "passkey" p
WHERE p."id" = (
  SELECT q."id" FROM "passkey" q WHERE q."userId"=p."userId"
  ORDER BY COALESCE(q."createdAt",''),q."id" LIMIT 1
);

-- The first enrolled credential is primary, atomically inside the insert.
CREATE TRIGGER "auth_primary_passkey_assign"
AFTER INSERT ON "passkey"
WHEN NOT EXISTS (SELECT 1 FROM "auth_primary_passkey" WHERE "userId"=NEW."userId")
BEGIN
  INSERT INTO "auth_primary_passkey" ("userId","passkeyId") VALUES (NEW."userId",NEW."id");
END;

-- No API, plugin or direct SQL statement may delete the primary key while
-- the account still exists. Full account deletion remains possible.
CREATE TRIGGER "auth_primary_passkey_no_delete"
BEFORE DELETE ON "passkey"
WHEN EXISTS (
  SELECT 1 FROM "auth_primary_passkey" m
  JOIN "user" u ON u."id"=m."userId"
  WHERE m."passkeyId"=OLD."id" AND m."userId"=OLD."userId"
)
BEGIN
  SELECT RAISE(ABORT, 'primary passkey cannot be deleted');
END;
CREATE TRIGGER "auth_primary_passkey_no_id_change"
BEFORE UPDATE OF "id" ON "passkey"
WHEN OLD."id" <> NEW."id"
BEGIN
  SELECT RAISE(ABORT, 'passkey ID cannot be changed');
END;
CREATE TRIGGER "auth_primary_passkey_no_reassign"
BEFORE UPDATE ON "auth_primary_passkey"
BEGIN
  SELECT RAISE(ABORT, 'primary passkey cannot be reassigned');
END;
CREATE TRIGGER "auth_primary_passkey_no_mapping_delete"
BEFORE DELETE ON "auth_primary_passkey"
WHEN EXISTS (SELECT 1 FROM "user" WHERE "id"=OLD."userId")
BEGIN
  SELECT RAISE(ABORT, 'primary mapping cannot be deleted');
END;

-- A recent successful assertion *by the primary credential*, not just
-- possession of an active session or any secondary passkey.
CREATE TABLE "auth_primary_passkey_proof" (
  "sessionId" TEXT NOT NULL PRIMARY KEY REFERENCES "session"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verifiedAt" INTEGER NOT NULL
);
