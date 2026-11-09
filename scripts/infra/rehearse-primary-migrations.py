#!/usr/bin/env python3
"""SQLite/D1-compatible synthetic migration + backup/restore rehearsal.

Uses disposable SQLite files and synthetic credentials only. This is NOT a
production D1 Time Travel restore, D1 backup, or permission to write production.
"""
from pathlib import Path
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "migrations" / "auth"
BASELINE = [1, 7, 8, 9]
UPGRADE = [10, 11, 12, 13]


def file_for(number):
    matches = list(MIGRATIONS.glob(f"{number:04d}_*.sql"))
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one migration {number:04d}")
    return matches[0]


def apply(conn, numbers):
    for number in numbers:
        sql = file_for(number).read_text(encoding="utf-8")
        if not sql.strip():
            raise AssertionError(f"Empty migration {number:04d}")
        conn.executescript(sql)
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise AssertionError(f"Integrity check failed after migration {number:04d}")


def names(conn):
    return {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')")}


def expect_rejected(conn, sql, params=()):
    try:
        conn.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(f"Security invariant not enforced: {sql}")


def passkey(conn, key, cred):
    conn.execute(
        'INSERT INTO "passkey" ("id","publicKey","userId","credentialID",'
        '"deviceType","backedUp") VALUES (?,?,?,?,?,?)',
        (key, "synthetic-public-key", "synthetic-user", cred, "singleDevice", 0),
    )


def run(tmp):
    original = sqlite3.connect(tmp / "original.sqlite")
    backup = sqlite3.connect(tmp / "pre-migration-backup.sqlite")
    restored = sqlite3.connect(tmp / "restored.sqlite")
    for conn in (original, backup, restored):
        conn.execute("PRAGMA foreign_keys=ON")
    apply(original, BASELINE)
    original.execute(
        'INSERT INTO "user" ("id","name","email","emailVerified","createdAt",'
        '"updatedAt") VALUES (?,?,?,?,?,?)',
        ("synthetic-user", "Synthetic", "synthetic@example.invalid", 0, 0, 0),
    )
    passkey(original, "old-primary", "cred-old")
    original.commit()

    # Capture baseline before any upgrade, then separately prove it can be
    # restored. This simulates application-data rollback with disposable data.
    original.backup(backup)
    baseline_user_count = original.execute('SELECT COUNT(*) FROM "user"').fetchone()[0]
    baseline_key_count = original.execute('SELECT COUNT(*) FROM "passkey"').fetchone()[0]
    apply(original, UPGRADE)

    required = {
        "auth_primary_passkey", "auth_primary_passkey_proof",
        "auth_primary_passkey_assign", "auth_primary_passkey_no_delete",
        "auth_primary_passkey_no_id_change", "auth_primary_passkey_no_reassign",
        "auth_primary_passkey_no_mapping_delete",
        "auth_primary_passkey_no_user_change",
        "auth_recovery_code", "auth_recovery_attempt",
        "auth_primary_transfer_gate", "auth_primary_transfer_gate_valid",
        "auth_primary_phone_transfer_attempt",
    }
    assert not required.difference(names(original)), required.difference(names(original))
    primary = original.execute(
        'SELECT "passkeyId" FROM "auth_primary_passkey" WHERE "userId"=?',
        ("synthetic-user",),
    ).fetchone()
    assert primary == ("old-primary",), "Existing primary was not backfilled"
    assert original.execute('SELECT COUNT(*) FROM "user"').fetchone()[0] == baseline_user_count
    assert original.execute('SELECT COUNT(*) FROM "passkey"').fetchone()[0] == baseline_key_count

    passkey(original, "new-primary", "cred-new")
    expect_rejected(original,
        'UPDATE "auth_primary_passkey" SET "passkeyId"=? WHERE "userId"=?',
        ("new-primary", "synthetic-user"))
    expect_rejected(original, 'DELETE FROM "passkey" WHERE "id"=?', ("old-primary",))
    expect_rejected(original, 'UPDATE "passkey" SET "userId"=? WHERE "id"=?',
        ("other-user", "old-primary"))
    expect_rejected(original, 'UPDATE "passkey" SET "id"=? WHERE "id"=?',
        ("changed-id", "old-primary"))

    # A synthetic, unconsumed offline code permits a gated primary transfer.
    original.execute(
        'INSERT INTO "auth_recovery_code" '
        '("userId","generation","digest","createdAt") VALUES (?,?,?,?)',
        ("synthetic-user", "synthetic-gen", "synthetic-digest", 100),
    )
    original.execute(
        'INSERT INTO "auth_recovery_attempt" '
        '("id","userId","challengeDigest","codeDigest","sourceDigest",'
        '"createdAt","expiresAt") VALUES (?,?,?,?,?,?,?)',
        ("synthetic-attempt", "synthetic-user", "challenge", "synthetic-digest",
         "source", 100, 100000),
    )
    expect_rejected(original,
        'INSERT INTO "auth_primary_transfer_gate" '
        '("userId","oldPasskeyId","newPasskeyId","attemptId","nowMs") '
        'VALUES (?,?,?,?,?)',
        ("synthetic-user", "old-primary", "new-primary", "wrong-attempt", 200))
    original.execute(
        'INSERT INTO "auth_primary_transfer_gate" '
        '("userId","oldPasskeyId","newPasskeyId","attemptId","nowMs") '
        'VALUES (?,?,?,?,?)',
        ("synthetic-user", "old-primary", "new-primary", "synthetic-attempt", 200),
    )
    original.execute(
        'UPDATE "auth_primary_passkey" SET "passkeyId"=? WHERE "userId"=?',
        ("new-primary", "synthetic-user"),
    )
    original.execute('DELETE FROM "auth_primary_transfer_gate"')
    original.execute('DELETE FROM "passkey" WHERE "id"=?', ("old-primary",))
    expect_rejected(original, 'DELETE FROM "passkey" WHERE "id"=?', ("new-primary",))

    for i in range(3, 7):
        if i == 6:
            expect_rejected(original,
                'INSERT INTO "passkey" ("id","publicKey","userId",'
                '"credentialID","deviceType","backedUp") VALUES (?,?,?,?,?,?)',
                (f"secondary-{i}", "synthetic", "synthetic-user",
                 f"cred-secondary-{i}", "singleDevice", 0))
        else:
            passkey(original, f"secondary-{i}", f"cred-secondary-{i}")
    original.commit()
    assert original.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not original.execute("PRAGMA foreign_key_check").fetchall()

    # Real restore into a separate empty SQLite file, never onto production.
    backup.backup(restored)
    assert restored.execute('SELECT COUNT(*) FROM "user"').fetchone()[0] == baseline_user_count
    assert restored.execute('SELECT COUNT(*) FROM "passkey"').fetchone()[0] == baseline_key_count
    assert "auth_primary_passkey" not in names(restored), "Restore retained post-backup DDL"
    assert restored.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not restored.execute("PRAGMA foreign_key_check").fetchall()
    for conn in (original, backup, restored):
        conn.close()
    print("PASS: 0010→0011→0012→0013 on disposable SQLite with synthetic users")
    print("PASS: backfill, primary immutability, transfer gate, 5-key ceiling, integrity")
    print("PASS: independent pre-upgrade SQLite backup restored and verified")
    print("NOT VERIFIED: Cloudflare D1 Time Travel restore, production D1 rights or schema")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="eloscanner-migration-rehearsal-") as folder:
        run(Path(folder))
