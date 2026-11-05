# EloScanner accounts: closed registration

This change adds real username/password login, not mock authentication. **Public
registration is permanently denied in this release.** There is no invitation API,
shared signup code, public provisioning endpoint or environment switch that opens it.
A later reviewed change is required to open registration. No production databases
or Cloudflare settings are modified by the repository's build or tests.

## Architecture

- Pages Functions `/api/auth/[[path]]` exposes only config, session lookup, username
  login, logout, logout everywhere, password change and password-confirmed deletion.
- Better Auth 1.7.17 manages credential verification, signed cookies and database
  sessions. The library's own signup is disabled in the request-serving configuration.
- `@noble/hashes` Argon2id: 32 MiB, 3 passes, parallelism 1, random 16-byte salt and
  32-byte output. Stored hashes use a strict versioned format. Passwords use NFC.
- A domain-separated HMAC of the password with `BETTER_AUTH_SECRET` supplies a pepper.
  **Do not replace this secret casually:** existing hashes require the original key.
  Losing it makes password login impossible. A rotation/migration design is required
  before key replacement; password resets are deliberately not exposed here.
- No real email is collected. The library's required email column contains a random
  UUID at reserved `accounts.invalid`. Email login, verification, linking and recovery
  routes are not exposed. Browser responses omit these identifiers and session tokens.
- Cookies are Secure on HTTPS, HttpOnly, SameSite=Lax and host-only. No localStorage
  tokens, cross-subdomain cookies, cookie session caches or sliding sessions. Maximum
  session lifetime is seven days; unchecked “keep signed in” uses a browser-session
  cookie (a browser may restore it). Password change revokes other sessions.
- Passwords are not recoverable. No recovery codes or 2FA are implemented, per scope.
  Password change requires the current password. Deletion removes library user,
  account, sessions and associated records; existing anonymous leaderboard entries
  are not automatically claimed by a same-named account.
- Existing chess tools remain available without login. This change does not claim
  historical leaderboard scores or add puzzle rating/progress synchronization.

## Abuse controls and privacy

Atomic shared D1 counters prevent parallel read/increment races. Source addresses are canonicalized (IPv6 /64, mapped IPv4 normalized).
Counters stop incrementing at their limit; blocked login sources do not allocate
new account counters. Source requests
are capped at 60/minute. Login attempts are capped at 30/account and 30/source in
10 minutes; attempts after the first five require a server-verified Turnstile token.
Counters count all attempts, not only failed ones, to gate hashing before it happens.
Successful challenges do not bypass hard limits. Verify `success`, exact hostname
and action `login`; Turnstile provides single-use token/replay validation.
Expensive credential handlers are limited to one in-flight request per isolate to
bound Argon2 memory use; additional requests receive a short retry response, not a
queue retaining passwords. This is a memory safeguard, not distributed rate limiting.
Account cooldowns are temporary; existing sessions are not revoked by login failures.
A distributed attacker can still cause temporary denial of login. Configure additional
Cloudflare edge protections before opening registration. No CAPTCHA guarantees protection.

IP/username counter keys are domain-separated HMACs, not plain hashes. They are
pseudonymous data, not anonymous. They expire within 10 minutes and indexed bounded
cleanup runs on account activity. Expired session rows are similarly cleaned up.
With no further activity, expired rows remain until maintenance runs. Consider a
scheduled cleanup job before public launch. D1 backup retention and Cloudflare's
request logs are separate. Raw IP/user-agent values are not stored in auth sessions.

New passwords must have at least 15 normalized code points and at most 128 UTF-16
code units, cannot contain the username, and must pass the HIBP password range check.
The server sends a five-character SHA-1 prefix, with response padding requested;
it never sends plaintext or the full lookup hash. Failed/unavailable checks block
password changes/provisioning. No password or token-bearing exceptions are logged.

## Required Cloudflare configuration (not done automatically)

1. Use a separate Preview/test D1 database. **Never bind Production AUTH_DB to Preview.**
   Production binding is `AUTH_DB` -> `eloscanner-auth`, already prepared by the owner.
2. Set Pages build command `npm run build` and build output `dist`. Functions stay in
   the repository root's `functions` directory. Build copies only public assets,
   not dependencies, operator scripts, SQL, tests, secrets or server modules.
3. Enable runtime compatibility flag `nodejs_compat` and a current compatibility date
   (tested with 2026-11-01). Apply for the environment being tested.
4. For each environment set:
   - `BETTER_AUTH_SECRET`: secret, 32+ characters of high-entropy randomness;
     separate values for Preview and Production.
   - `BETTER_AUTH_URL`: text, exact HTTPS origin, no trailing slash. Production
     defaults to `https://eloscanner.com`. Preview needs its exact stable origin.
   - `TURNSTILE_SITE_KEY`: text, public key for that hostname.
   - `TURNSTILE_SECRET_KEY`: secret. Use separate test/preview keys; do not use
     Cloudflare's always-pass testing keys in Production.
5. Protect the preview site with Cloudflare Access before provisioning real testers.
   Add only the exact preview hostname to its Turnstile widget. Do not accept arbitrary
   Origins/Host headers or wildcard return URLs. Local tests use localhost explicitly.
6. Apply SQL to **the intended environment only**, in order, via D1 console or Wrangler:
   `migrations/auth/0001_auth.sql`, then `migrations/auth/0002_security.sql`.
   The app never runs destructive migrations or auto-creates production accounts.
7. Do not assume the Workers Free CPU budget (10ms/request) can run this Argon2id
   setting. Local tests show hundreds of milliseconds per hash. Benchmark deployed
   test requests and select adequate compute before inviting testers; keep the
   hashing strength. Paid usage has CPU charges/limits as well as request quotas.
8. Redeploy after configuration. Verify closed registration and test using the intended
   HTTPS hostname. Missing binding/secret/schema fails closed, with no raw error output.

No Wrangler production configuration is committed because the real database IDs and
preview origin are not known. The file under tests/auth is **local-only**, with an
obviously synthetic secret and dummy DB ID; never use it for a production deployment.

## Local test and provisioning

Node 22.13+ (for node:sqlite), npm:

```
npm ci
npm run build
npm run auth:migrate:local
npm run auth:provision -- --local --fixture
npm run dev:auth
```

Visit http://localhost:8788/account. The local-only fixture is `local_tester`, password
`Local-test-only-orchard-57931!`. It never goes into the production database. To create
an operator-approved test account in a separately protected remote preview database:

```
npm run auth:provision -- --remote --database YOUR_PREVIEW_DATABASE_ID
```

The tool prompts for username, unique password and the target secret in a local
terminal. Password and secret input are hidden. It checks password safety, creates
credentials using Better Auth against an in-memory SQLite database, and imports only
user/account rows via Wrangler. No session is imported. Temporary SQL is mode 0600
inside a private temporary directory and deleted in finally. Remote provisioning
requires your authenticated Cloudflare operator account. There is no web bypass.
Production test accounts should only be created after compute and configuration are
verified, and with a unique password different from all other services.

## Verification

```
npm run test:auth
npx playwright install chromium
# with npm run dev:auth running and a local fixture provisioned:
npx playwright test
```

Tests cover real Better Auth+D1 adapter behavior, random salts, pepper mismatch,
registration denial at both layers, hidden-route denial, origin checks, byte limits,
atomic counters, challenge hostname/action, generic login errors, secure cookies,
logout/revocation, password changes and deletion. Browser tests exercise the actual
local Workers runtime, D1, responsive UI, navigation and closed signup. Local runtime
success is not a production CPU/availability guarantee or independent penetration test.

Before public registration: independent security review, production load/CPU checks,
retention scheduling, monitoring/edge protections, incident/secret-recovery procedures,
and a separately approved registration and account-recovery policy. Privacy text was
updated for the implemented test accounts; this is not a certification of GDPR compliance.
