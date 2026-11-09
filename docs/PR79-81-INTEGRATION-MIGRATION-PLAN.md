# PR 79–81 integration and production D1 migration plan

## Protected D1 credential required for next live step
- Create a Cloudflare API token scoped to the **HBAN account** with **D1 Write** permission (which also permits the required D1 reads), without changing the existing Pages token.
- Add its value as the GitHub **production environment** secret `CLOUDFLARE_PRODUCTION_D1_WRITE_TOKEN`. Never send it in chat.
- The read-only production D1 audit authenticates Pages with the existing Pages token and D1 with the separate D1 token.
- The disposable Time Travel rehearsal creates, tests restoration of, and deletes **only** a new EU-jurisdiction database containing synthetic data. It must pass before any production migrations.
- The protected workflows cannot run successfully until this secret exists. Public signup remains disabled; D1 production writes and site publication remain forbidden until recovery proof and whole-chain migration safety are confirmed.

## Live D1 audit outcome — 2026-11-09
- PR 83 was merged to main with all PR checks green, including synthetic 0010–0013 SQLite migration and independent SQLite backup/restore rehearsal.
- Protected automatic read-only production audit run 42659548917 failed with HTTP 401. No D1 queries, migration statements or restore operations were executed.
- The Cloudflare production API token was sufficient for the earlier Pages deployment-control change but D1 access is **not** established. The audit now identifies which endpoint denied access without exposing secrets.
- Cloudflare D1 bookmark lookup requires **D1 Read** or **D1 Write** for the account. Creating a disposable D1 restoration rehearsal database requires **D1 Write**. Use narrowly scoped credentials in the protected GitHub production environment. Do not paste token values in chat or logs.
- STOP: production migration and publication remain blocked until D1 credentials work and a genuine Cloudflare D1 Time Travel restore on a disposable database has succeeded. The local SQLite rehearsal is not sufficient by itself.

## Current execution record — 2026-11-09 (supersedes earlier historical blocker)
- PR 79, 80, 81, and 82 have been merged to `main`.
- Cloudflare production release preflight run 42654829949 (attempt 2) succeeded and disabled native Git production/preview auto-deployments.
- Read-only production merge safety gate run 42654419521 (attempt 2) passed with signup closed, isolated D1 bindings and native auto-deploy disabled.
- Final main security/performance regression run 42657065060 passed after PR 81.
- PR 82 replaced the old partial primary-schema write workflow with a read-only audit. No production D1 write or application deploy followed those PR merges.
- The synthetic SQLite ordered migration-and-restore rehearsal exercises 0010–0013 but **does not** establish a Cloudflare production D1 Time Travel restore or production D1 permissions.
- **STOP:** Do not apply production 0010–0013 or deploy new Passkey code until a current live D1 audit, disposable D1 Time Travel recovery rehearsal, and compatible whole-chain migration executor are verified. Public signup remains CLOSED.
- The older status/blocker text below is an immutable *historical preflight record*, not the current Cloudflare state.


Status: PREPARED, NOT EXECUTED. Public registration must remain CLOSED.

**Confirmed blocker, 2026-11-09:** read-only Cloudflare Pages API returned
`source.type=github`, `production_deployments_enabled=true` and
`preview_deployment_setting=all`. A merge to main CAN automatically deploy
production code. The read-only production merge safety gate correctly FAILED.
DO NOT MERGE until a separately approved Cloudflare configuration change
has disabled native Git production and preview deployments and the gate passes.
The production release preflight workflow is available but was NOT executed.
This check made no Cloudflare changes.
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
   and must not be treated as a complete release mechanism. Its existing
   preflight expects precisely the original seven 0010 objects, and its
   IF NOT EXISTS statements cannot upgrade the authorization triggers.
   Review/replace the workflow before any production schema operation.
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
