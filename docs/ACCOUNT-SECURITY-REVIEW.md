# Account security review — 5 November 2026

## Scope and method

Reviewed the EloScanner username/password gateway, Better Auth configuration,
password hashing, account frontend, public build output and installed dependencies.
Used synthetic accounts, SQLite through the real Better Auth D1 adapter, and the
local Cloudflare Workers runtime with Chromium. No production password guessing,
load test, account deletion or data extraction was performed. This is an engineering
review, not an independent penetration-test certificate or a guarantee of security.

## Reproduced and fixed

1. **IPv6 source-limit evasion (abuse resistance).** Six different addresses in one
   IPv6 /64 targeting six different usernames each received a password attempt
   without a challenge. Per-account limits still applied; this did not bypass a
   known account's password. Source limits now use canonical IPv4 or an IPv6 /64;
   mapped IPv4 addresses normalize to IPv4. Invalid connecting-IP values fail closed.
   Only CF-Connecting-IP is trusted; caller-supplied X-Forwarded-For is ignored.
   A shared /64 may share a cooldown; unrelated networks can still evade a source
   limit, so account limits and edge protections remain necessary.

2. **Database writes continued after throttling (resource consumption).** Rejected
   requests incremented counters indefinitely; login requests also created username
   counters before checking the login-source limit. Counters now saturate atomically
   at their threshold, without extending the window or writing rejected increments.
   Login-source rejection precedes creation of username counters. Both regressions
   failed before the fix and passed afterward. Requests still use Cloudflare and
   some database reads/cleanup; this is NOT immunity from quota exhaustion or DDoS.

## Attack checks

- Public signup and alternative/encoded/unlisted library routes cannot create users.
- Wrong passwords, forged cookies, cross-site writes and missing origins are rejected.
- SQL/role/userId/email/callback fields are not forwarded to authentication; supplying
  another userId does not log in as that user or redirect to an external URL.
- Missing/failed/wrong-host/wrong-action Turnstile verification cannot reach hashing
  after the challenge threshold. Actual token single-use enforcement belongs to
  Cloudflare's siteverify service; mocked tests do not prove a real CAPTCHA unbreakable.
- Concurrent rate increments are atomic; per-isolate expensive-work concurrency is
  bounded. Expired cooldowns recover; attempted login failures do not revoke sessions.
- Password changes require the current password and revoke other sessions; deletion
  requires the password. Logout-all, expiry and tampering invalidate access.
- Browser JSON does not return session tokens, password hashes, internal email IDs
  or secret values. Exception text is replaced by generic errors.
- Salts differ; wrong passwords and wrong peppers cannot verify the stored hash.
  Corrupt hash parameters cannot request arbitrary memory allocations.
- HIBP lookup sends only the SHA-1 prefix; breached passwords and service outages
  block password changes. SHA-1 is not used for password storage.
- Account UI uses textContent for usernames and messages, not HTML interpolation.
- Built output excludes lib, tests, scripts, node_modules, package metadata and dotfiles.
  A limited tracked-source pattern scan found no matching GitHub tokens, AWS access
  key IDs or PEM private keys. This does not audit Git history or Cloudflare secrets.
- npm audit reported zero known advisories in the installed tree at review time.
  Better Auth 1.7.17 is newer than the 1.7.16 fixes in the sampled November advisories;
  unused OAuth, email-OTP, admin and Electron plugins are not exposed by this gateway.

## Research used

- OWASP Authentication Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Credential Stuffing Prevention (CAPTCHA is not sufficient alone):
  https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
- OWASP Session Management:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- RFC 9106, Argon2 design, test vectors and security considerations:
  https://www.rfc-editor.org/rfc/rfc9106.html
- Published Better Auth security advisories:
  https://github.com/better-auth/better-auth/security/advisories

Primary guidance and published advisories are used rather than treating forum
recommendations, popularity or a lack of reported CVEs as proof of safety.
RFC 9106 does not certify this deployment or our exact parameter choice.

## Remaining limits and follow-up

- Password-only login cannot distinguish an attacker who has the actual password.
  Phishing, malware and a compromised origin/server remain outside password hashing's
  protection. HTTPS/HttpOnly do not make a compromised browser or origin safe.
- This is not a complete review of every chess engine, legacy tool or third-party
  script on the same origin. An XSS flaw elsewhere could affect account actions.
  Account-page CSP is stricter than the site's general policy. Origin separation and
  a full client-side audit are worthwhile before paid accounts or broad public signup.
- Cookies are signed, Secure on HTTPS, HttpOnly, SameSite=Lax, and no Domain is set.
  OWASP additionally recommends __Host- names; Better Auth currently prepends
  __Secure-. Do not blindly concatenate prefixes and assume __Host- enforcement.
  A supported cookie-name migration should be reviewed before changing this.
- Cloudflare settings, WAF rules, secret contents, backups and production request
  bodies/logs are not accessible from this review. Production Cloudflare blocked
  earlier direct audit requests; a successful deploy is not a live penetration test.
- Distributed attacks can still exhaust CPU/request/D1 limits. Use adequate compute,
  edge controls, monitoring and a tested incident response plan. The Argon2 settings
  must not be weakened merely to fit the Free plan.
- Counter expiry is not scheduled erasure: cleanup occurs on later account traffic.
  Secret loss/rotation needs planning because the secret also derives the pepper.
- Public registration remains closed. No invitation or recovery bypass was added.
