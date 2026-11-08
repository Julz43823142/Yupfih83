# EloScanner passkey migration — security-first staging plan

Status: **passkey implementation in an unmerged draft PR; disabled by default**.
Public registration stays closed. No production D1 migration, secret change, merge
or live deployment is authorized by this branch.

## Existing architecture verified in `main` (2026-11-08)

- Cloudflare Pages Functions + D1 `AUTH_DB`; Better Auth 1.7.17 with username
  plugin, Argon2id password authentication and host-only HttpOnly session cookies.
- The `user.id` is the stable account identity. Preserve it for **Sharkmeister**
  and every other existing account: never migrate by matching display names.
- The current `account` table stores legacy password hashes. Keep it and its
  existing credentials during the migration; never delete hashes before proven
  recovery and explicit release approval.
- The account pages use vanilla JavaScript and a bundled same-origin passkey
  client built from the official Better Auth plugin.

## Implementation choice

Use the **Better Auth passkey plugin** `@better-auth/passkey` with the **same
version as `better-auth`**, pinned to 1.7.17 and dependency-audited.
The plugin uses SimpleWebAuthn internally. This minimizes new custom crypto and
reuses Better Auth user IDs, sessions and D1. Do not independently implement
signature verification or rely on a third-party QR-code service.

Use RP ID `eloscanner.com` on production with exact origin
`https://eloscanner.com`; staging must use its **own real HTTPS RP ID/origin**
and its **own D1 database**, and credentials from staging are not portable to
production. Browser-native cross-device passkey login handles QR codes if supported.
Require user verification and discoverable/passkey credentials. Accept platform,
cross-platform and synced passkey authenticators; do not force Face ID.

## Required security gates before exposing any passkey endpoint

1. Install/pin matching Better Auth + passkey versions, verify generated D1
   schema against `0007_passkeys.sql`, and run `npm ci` and an npm security
   audit with a committed updated lockfile.
2. At the public API gateway, explicitly allowlist only required passkey routes
   and HTTP methods. Enforce exact origin/host, POST origin checks, no cache,
   bounded bodies, no reflected errors, D1-backed source/account rate limits,
   bot challenge for **new account creation**, and deny all other plugin routes.
3. Validate WebAuthn `challenge` exactly once with short expiry; bind
   registration challenge to the authenticated user and sensitive reauthentication;
   verify origin, RP ID, user verification, credential ID uniqueness and
   authenticator signatures. Preserve metadata without private key material.
4. Existing-user enrollment **must require fresh password reauthentication**
   and must attach a credential to the same `user.id`. A valid old session
   without reauthentication must not suffice to add/remove passkeys.
5. Issue/revoke normal secure Better Auth sessions on successful passkey login,
   rotate sessions on security-sensitive changes, and prevent login-method
   downgrade or forced takeover via username-based account linking.
6. Enforce a maximum of **five** passkeys per user atomically, consider concurrent
   registrations; require fresh authentication to add/remove credentials and
   block removal of the last available login method.
7. Design recovery before passkey-only launch. Multiple credentials are encouraged,
   but synchronizing one passkey across devices does **not** necessarily provide
   an independent recovery channel. If recovery codes are adopted, store only
   salted hashes, make them single-use, rate-limit them and force session revocation.
8. Public signup is a separate, reviewed feature. Never enable existing
   `sign-up/email` or Better Auth signup as a workaround for passkey enrollment.
9. Tests: database cascade and duplicate credentials; closed registration
   regardless of environment switches; origin/CSRF/replay/rate-limit challenges;
   cross-account insertion; stolen-session reauth; five-key cap and concurrent
   requests; backup/restore; browser tests on phone/desktop/QR cross-device.
10. Validate in isolated staging, review all 22 security checklist items, then
    explicitly approve a separate deployment/migration and eventual signup launch.

## Automated pre-integration evidence

The scoped GitHub Actions workflow
`.github/workflows/passkey-plugin-compatibility.yml` uses the committed
lockfile via `npm ci`, checks that the plugin matches the pinned Better Auth
version, tests its server import and runs a production-dependency security audit. The matching 1.7.17 passkey package is now pinned in both
`package.json` and `package-lock.json`. The temporary dependency-lock
workflow with write access was removed immediately after committing the
manifests. The plugin loads only if `PASSKEY_LOGIN_ENABLED=true` and
`PASSKEY_RP_ID` exactly matches the configured origin hostname, with HTTPS
required outside localhost. The public gateway allows only a narrow set of authentication, read-only list
and password-confirmed enrollment routes when the flag is set. It denies all
other passkey management routes. Public account creation is always blocked.
The browser client uses SimpleWebAuthn via the official Better Auth client.
A real WebAuthn virtual-authenticator test is included in the local CI suite;
no production or remote staging credentials are touched.

## Cloudflare Pages configuration migration: stop before applying

The operator has created `eloscanner-auth-preview`, but its **D1 database
UUID is not yet available in the repository**, and the existing Pages dashboard
has production `AUTH_DB`, `SUS_DB`, and `ONLINE_ROOM` bindings plus secrets.
The dashboard did not expose a verified Preview/Production selector. **Do not
edit the existing `AUTH_DB` binding to point at preview.**

Cloudflare's Pages Wrangler configuration can specify `env.preview` and
`env.production` D1 bindings. However, introducing a Wrangler file to an
existing Pages project changes the configuration source and can accidentally
drop other bindings, secrets or compatibility flags. Cloudflare recommends
`npx wrangler pages download config fairplaychess` to capture the current
project configuration before switching. Download/review that output privately;
**never commit secret values or tokens**.

Before a Wrangler config can be safely committed and deployed, collect and
verify, without posting any secrets publicly:

1. The production and preview D1 **database UUIDs**, their exact names, and
   the Pages project name `fairplaychess`.
2. The current Pages config downloaded from Cloudflare, including compatibility
   date/flags, `AUTH_DB`, `SUS_DB`, `ONLINE_ROOM`, runtime variables and
   which secrets are stored in Cloudflare rather than source control.
3. A plan to preserve `SUS_DB` and `ONLINE_ROOM` in both environments
   without accidentally connecting test traffic to production game rooms.
4. Exact HTTPS preview origin and its matching `BETTER_AUTH_URL` and
   `PASSKEY_RP_ID`; no passkeys should be issued for `eloscanner.com` on
   an untrusted preview origin.
5. A preview-only migration and fixture-account strategy: the new database is
   empty and must receive the base `0001`–`0006` auth migrations before
   `0007_passkeys.sql`. Do not copy production password hashes, sessions or
   personal game history to preview just to test a passkey.

Cloudflare documentation notes that preview configuration applies to **all
preview deployments**, not only this PR branch. Verify this scope before
changing project-level preview bindings. Merely seeing a successful GitHub
preview build does not establish the runtime bindings or passkey readiness.

Do not deploy a guessed `wrangler.jsonc` containing fake UUIDs or an
incomplete replacement for the live Pages configuration. Keep the current
draft PR unmerged until the downloaded configuration and binding inventory
have been reviewed.

## Preview-only setup and test

1. Use isolated Cloudflare preview D1. Apply `0007_passkeys.sql` **only there**
   after prior migrations. Never bind preview to live production D1.
2. Configure exact `BETTER_AUTH_URL` and matching `PASSKEY_RP_ID` to the stable
   HTTPS preview host, and set `PASSKEY_LOGIN_ENABLED=true` only in preview.
   The default without these variables is OFF. The server and public config
   now check for BOTH D1 tables before enabling passkeys; password login
   continues to work if those tables are missing. A preview must use a
   different D1 database and origin from production.
3. On the account page, log in with an existing password, reenter the current
   password in Passkeys, create a passkey, log out, then log in via passkey.
4. Test Chromium virtual authenticator CI, real phone/QR flows, lost device and
   second authenticator behavior; do not assume all browsers support QR transfer.
5. Passkey deletion, credential recovery, password removal and public signup are
   intentionally **not enabled**. Build/approve them separately before launch.

## Account recovery: mandatory policy before passkey-only launch

**Present release state:** existing password login remains available during
migration. No password hashes are deleted. The current passkey enrollment path
requires the existing password; it is **not suitable** for accounts after their
passwords are disabled. Do not launch passkey-only registration yet.

Minimum launch design:

- **One passkey is enough** to enroll and log in. A second independent passkey
  is recommended, never required. Because there is no secure passwordless
  recovery flow yet, **retain the existing password** for account recovery in
  this existing-account pilot. Synced passkeys do not guarantee account access
  when the underlying cloud account or devices are lost. Display credential
  count, with an optional backup recommendation.
- For passwordless users, replacing, adding, renaming or removing a passkey
  requires a fresh **passkey-authenticated** step-up. Session possession alone
  must not suffice. The current password-confirmed step-up is for migration only.
- Decide whether to support **single-use recovery codes**. If implemented,
  generate cryptographically random high-entropy codes, reveal each only once,
  store only secret-keyed digests (never plaintext), require a proven recovery
  credential before a new passkey can be bound, rate-limit attempts and
  invalidate existing sessions after recovery. Protect code replacement with a
  fresh phishing-resistant passkey step-up. No email, username or support agent
  may unilaterally reset access.
- On device loss, let a still-authenticated user with another passkey revoke
  the lost credential; a session without reauthentication must not revoke it.
  Test one-device loss, cloud-provider lockout, synced-copy recovery and
  malicious session reuse.
- If all authenticators and recovery methods are lost, account recovery may
  be impossible. State this plainly to users rather than creating an insecure
  staff reset shortcut.
- Old password-based deletion and password-change forms must be redesigned
  for passkey-only accounts; do **not** silently disable the last usable login
  method or allow deletion on mere session possession.

## Passkey security regression evidence (local only)

- Registration remains blocked even with the legacy signup flag and passkey
  feature enabled. Unlisted Better Auth routes, passkey deletion and update
  endpoints return 404.
- A current password is required to authorize one registration challenge; the
  short-lived grant is tied to the session and cannot be used twice or after
  logout. Password and session changes invalidate outstanding grants.
- The D1 schema enforces credential uniqueness, same-owner updates and a
  five-passkey limit. Database constraints supplement handler checks.
- A virtual Chromium WebAuthn authenticator exercises existing-account
  enrollment, signed challenge verification, logout and passkey login. The
  browser test also rejects assertion replay and wrong-origin POST requests.
- Independent D1 counters limit source attempts at obtaining passkey sign-in
  challenges (20/minute) and verifying assertions (30/minute). A network-wide
  shared IP can also encounter these limits; edge protections remain necessary.
- Build and npm audit run in GitHub CI. These checks do not establish security
  against production compromise, distributed denial-of-service or malware.

## Existing-account-only pilot: launch prerequisites

**Release scope:** only people with an existing account may register a passkey.
The Better Auth plugin requires an authenticated session and our gateway
requires a successful re-entry of the CURRENT PASSWORD before creating a
single-use enrollment challenge. Both public password signup and any
passkey-first user-registration endpoints remain blocked. The same stable
user ID (and therefore user history) is used. **One passkey suffices.**

Do not confuse changing a password with activating passkeys: `change-password`
still requires the current password and remains available. Do **not** remove
old password hashes, turn off legacy login or make public signup available
as part of the existing-account pilot.

**To activate after review and real device testing:**

1. Create a tested backup of the **production** D1 account database; verify a
   restore procedure and inspect current migrations in Cloudflare.
2. Review and merge this PR only after explicit deployment approval. Verify
   Cloudflare builds and dependency installation, and confirm which Pages
   environment binds `AUTH_DB`.
3. Apply the additive `0007_passkeys.sql` migration to the intended D1
   database only, with a tested rollback/restore plan. The application
   rejects passkey enablement until the passkey and step-up tables both exist.
4. Set `PASSKEY_LOGIN_ENABLED=true`, `PASSKEY_RP_ID=eloscanner.com`
   for the production Pages deployment only. The origin must already be
   `https://eloscanner.com`. Avoid using a preview domain or wildcard RP ID.
5. Check `/api/auth/config`: `registrationOpen=false`,
   `loginConfigured=true`, `passkeyReady=true`.
   Test `/api/auth/sign-up/email` stays at 403, and that unlisted
   plugin management routes return 404.
6. Log in as the EXISTING account on the actual browser/device, re-enter the
   old password, register ONE passkey, log out, and sign in with that passkey.
   Confirm account `user.id`, rankings and history unchanged; check that
   password-based login still works as recovery.
7. For rollback: unset `PASSKEY_LOGIN_ENABLED` (or set `false`). Passkey
   routes disappear; passwords continue to function. Do not drop the passkey
   table or rotate authentication secrets during rollback.

No GitHub checks or synthetic account tests prove access to production
Cloudflare D1, production backups, deployment settings, real mobile biometrics
or a phone-based QR ceremony. Those are explicit release gates, not inferred
from having the only account.

## Safe sequencing

A. Land schema and hard-closed legacy signup, with tests (this PR).
B. Pin/integrate passkey plugin and client UI (this unmerged review branch),
   with passkey routes opt-in and public signup hard-closed.
C. Operator migration: sign in with existing password, reenter password,
   register ONE passkey, sign out, test passkey sign-in; second passkey optional.
D. Only after independently tested migration/recovery and approved release:
   remove the legacy password login for migrated accounts. Retain a safe
   method for unconverted accounts until migration policy is settled.
E. Only after a separate explicit approval open passkey-only registration.

The SQL migration is **additive** and should be applied to an isolated preview D1
only after pin/schema verification. No production database has been touched.
