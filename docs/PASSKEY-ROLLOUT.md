# EloScanner passkey migration — security-first staging plan

Status: **schema preparation only; no passkey login is implemented or enabled**.
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
- The existing account pages use vanilla JavaScript and have no bundler-delivered
  WebAuthn client at present.

## Implementation choice

Use the **Better Auth passkey plugin** `@better-auth/passkey` with the **same
version as `better-auth`**, once separately pinned and dependency-audited.
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
required outside localhost. **The public gateway still denies every passkey
endpoint**, including when the flag is set. There is no browser client,
registration, sign-in or working credential enrollment yet.

## Safe sequencing

A. Land schema and hard-closed legacy signup, with tests (this PR).
B. Pin/integrate passkey plugin and client UI on separate review branch, still
   disabled for public signup.
C. Operator migration: sign in with existing password, reenter password,
   register passkey, sign out, test passkey sign-in, attach a second passkey.
D. Only after independently tested migration/recovery and approved release:
   remove the legacy password login for migrated accounts. Retain a safe
   method for unconverted accounts until migration policy is settled.
E. Only after a separate explicit approval open passkey-only registration.

The SQL migration is **additive** and should be applied to an isolated preview D1
only after pin/schema verification. No production database has been touched.
