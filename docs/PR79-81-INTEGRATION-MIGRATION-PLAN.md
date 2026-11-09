# PR 79–81 integration and production D1 migration plan

Status: PREPARED, NOT EXECUTED. Public registration must remain CLOSED.
Date: 2026-11-09.

## Verified branch topology and checks
- PR 79 head is an ancestor of PR 80; PR 80 head is an ancestor of PR 81.
- All three target main and are unmerged at the time of review.
- PR 81 head d7d37b402 passed recovery/phone-transfer security,
  Passkey plugin compatibility, and security/performance regression workflows.
- Review exact current head SHAs again immediately before any merge.
- Merge in numerical order using normal merge commits (not squash) to
  preserve ancestry; wait for main checks between each merge. Stop on
  conflict, failed check, deployment event or unexpected signup state.
- Merging changes main and may affect production via an active Git deployment
  integration. Do NOT assume that closed signup means a merge is inert.
  Verify Cloudflare Pages native production/preview Git deployment switches
  are disabled and protected manual release controls remain enforced.

## Pre-migration requirements (all mandatory)
1. Confirm production Pages project fairplaychess, branch main, production
   AUTH_DB 82e07afa-79eb-47e5-aa77-5bac6fb5bbdf, preview AUTH_DB
   e1d84922-0f74-414f-8fe5-2c3ac48f7884; refuse mismatch.
2. Confirm PUBLIC_SIGNUP_ENABLED is exactly false, password signup is 403
   and passkey-signup/options is 404. Preserve these assertions throughout.
3. Confirm an independent D1 Time Travel bookmark and retention window.
   Rehearse a restore on a disposable isolated D1 before modifying production.
4. Inspect existing sqlite_master objects and baseline user/passkey/session
   integrity. Check for conflicting table or trigger names. Capture only
   schema and aggregate counts; never log credentials, codes or cookies.
5. Apply SQL migrations in strict order: 0010_primary_passkey.sql,
   0011_recovery_codes.sql, 0012_recovery_transfer.sql,
   0013_phone_transfer.sql. Do not skip or reorder. These files use CREATE,
   DROP and trigger replacement; they are NOT idempotent. Do not blindly rerun.
6. Existing manual production workflow passkey-primary-production-schema.yml
   covers only an equivalent subset of 0010; it DOES NOT apply 0011–0013
   and must not be treated as a complete release mechanism. In particular,
   rerunning its initial no-reassign trigger after 0012 could invalidate
   the intended authorized transfer mechanism. Review/replace the workflow
   before any production schema operation.
7. After migration, assert all four recovery tables, primary mapping and
   both transfer authorization/owner-change triggers, as well as the original
   immutable primary and five-key cap triggers. Verify all existing passkey
   owners have exactly one primary mapping and all mappings reference
   existing same-owner passkeys.
8. Verify full recovery readiness, fresh-primary proof and replay controls
   against isolated HTTPS preview and disposable synthetic accounts first.
9. Keep PUBLIC_SIGNUP_ENABLED=false until separately authorized, even after
   schema and code deployment. Verify public config.registrationOpen=false.

## Rollback / recovery
- Application rollback: revert the main release commit or redeploy a known
  good build using protected manual production publish workflow. Keep
  registration disabled. This does not reverse database migrations.
- Schema rollback: do not run ad hoc DROP statements on production. The
  0010 backfill and 0012–0013 trigger replacement are not trivially reversible.
  Use a separately approved, tested D1 Time Travel restore plan with
  clearly understood point-in-time data loss. Restore is disruptive and
  may overwrite user activity after the bookmark. Stop all writes first.
- If a migration fails midway, immediately stop, leave registration closed,
  inspect sqlite_master and database integrity, and devise an explicit
  forward-fix or recovery plan; do not rerun the entire script blindly.
- Verify backup, Cloudflare API permissions, protected environment and
  rollback ownership before any production write.

## Security review notes
- WebAuthn registration verification checks challenge, expected origin,
  RP ID and user verification. Challenge is stored as a keyed digest.
- Recovery codes are 8 independent 160-bit codes, persisted as keyed
  user-scoped digests; old codes and sessions are invalidated in a D1 batch.
- The primary transfer gate uses DB triggers, but server-side authorization
  and real D1 batch semantics remain part of the trusted computing base.
- Current phone transfer requires a fresh primary assertion in the SAME
  authenticated browser session that creates the new phone credential.
  This is NOT yet a proven old-phone-to-new-phone handoff for non-synced
  credentials. A physical-device transfer usability/security test is mandatory
  before claiming this specific user journey is supported.
- A synchronized Passkey is not a cryptographic proof of one physical phone.
- An account without the primary passkey AND without an unused offline
  recovery code cannot be recovered by a secondary credential alone.
- Cloudflare zone-level WAF, team 2FA, least-privilege and alerts have not
  been independently verified with current permissions.

## Launch gate
Merge authorization is distinct from production deployment, D1 writes, and
opening signup. No automatic production migration or signup enablement.
