# EloScanner prelaunch security gates — 9 November 2026

Public registration: **CLOSED**. Neither this branch nor the read-only
workflows deploys the application, migrates production D1, or changes secrets.

## Account policy selected by the owner
- Exactly one *primary* passkey, assigned automatically to the first enrolled credential.
- Up to four additional passkeys, with a database-enforced maximum of five total.
- Primary passkey cannot be deleted or reassigned through normal account controls,
  the Better Auth plugin, or direct D1 DELETE/UPDATE while the account exists.
- Extra passkey enrollment for passwordless accounts requires recent actual
  authentication by the primary credential. Legacy password holders may still
  use current-password verification during the migration.
- The owner approved eight one-time offline recovery codes. PR 81 implements
  primary-phone transfer and lost-phone recovery as draft code, with one-time
  WebAuthn challenges, transactional primary replacement, old-session/passkey
  revocation and recovery-code invalidation. None is deployed or approved for
  public registration.
- A verified WebAuthn passkey does **not** prove the authenticator is physically
  a smartphone. User-agent checks, mobile UI and platform authenticator hints
  cannot offer that guarantee. The product must not claim cryptographic phone
  attestation or enable signup until the owner accepts the limitation.
- If the primary passkey is lost, a user needs an unused offline recovery code.
  Without a primary passkey or recovery code, account management cannot be
  restored; secondary passkeys do not authorize primary replacement.

## Implementation scope
- Migrations `0010_primary_passkey.sql` through `0013_phone_transfer.sql` must be applied to the *intended*
  D1 environment **after independent backup/recovery approval**, not implicitly
  by this PR. The migration backfills the oldest existing credential as primary,
  which does not prove a legacy credential was registered from a phone.
- Signup fails closed unless the primary-key D1 table/triggers exist.
- Database triggers block primary deletion/reassignment and enforce the existing
  five-key cap. The public gateway exposes only `POST /api/auth/passkey/remove-secondary`, which requires a fresh primary-passkey proof, checks account ownership, and excludes the primary credential in SQL. No primary-key deletion route exists.
- Primary-key authentication is tied to the new exact Better Auth session via
  `auth_primary_passkey_proof`; ordinary secondary-key login does not authorize
  new passkey enrollment. The existing-account password migration remains supported.

## Backups and recovery
Cloudflare D1's Time Travel facility is automatic for databases on the
production storage backend. Its retention depends on the Workers plan; Cloudflare
currently documents 7 days (Free) or 30 days (Paid). A **read-only** workflow
checks a production Time Travel bookmark and the exact isolated production/preview
D1 bindings. Do not publish bookmarks or account data in Actions logs.

**A bookmark check is not a restore rehearsal.** Before launch, rehearse a
restore only on a separate synthetic test database and record a successful
rollback. Never restore production as a test: Cloudflare's restore operation
overwrites data and cancels in-flight requests. Preserve restoration credentials
outside public logs. Backup coverage and quota should be verified separately.

References:
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/

## Cloudflare / abuse checks
- Proven earlier by read-only production audit: distinct D1 bindings,
  production branch `main`, required auth schema/triggers, signup disabled,
  Passkey login enabled, auth secret and Turnstile configuration present.
- A token successfully reading Pages/D1 does **not** certify least privilege,
  team 2FA, API token scope, WAF/rate limiting, alerting, secrets rotation,
  account recovery or restore. Inspect those settings with sufficiently scoped
  Cloudflare access and record evidence without revealing secret values.
- Before launch repeat: registration from mobile/desktop, cross-device QR,
  duplicate/replayed challenge, CSRF/origin, account linking, concurrent
  enrollment, five-key cap, proof expiration, secondary-key privilege escalation,
  revoked cookies, stolen sessions and expired challenges.
- Use synthetic accounts for any active tests. No live load test or guessing
  real user credentials. The default-off signup flag must stay false.

## Release sequence
1. Review CI, branch compatibility and PRs. PR 80 is stacked on unmerged PR 79;
   PR 81 is stacked on unmerged PR 80.
2. Obtain explicit permission before either merge, deployment or production D1 change.
3. Verify recovery and Cloudflare policy; run real phone tests on an isolated
   HTTPS preview using a separate D1 binding.
4. Verify PR 81's implemented transfer/recovery mechanisms, real phone
   compatibility, credential freshness and atomic D1 behavior. Do not activate
   signup until security review and owner approval.
5. After owner approval only, stage and apply `0010`–`0013` to the chosen D1 and
   inspect triggers, backfill and readiness. Re-run smoke/abuse tests.
6. A **separate owner approval** is needed to enable public registration.
