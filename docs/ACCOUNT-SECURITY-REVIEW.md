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

## Remaining limits after the first pass (see second-pass updates below)

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

## Second pass: site boundaries and game APIs

This pass widened the review to the active public APIs, retired report/vote routes,
client rendering sinks, static publication rules, and account access from the same
origin. Checks used local synthetic data. Nothing was sent to the real nickname
report/mail service; its Google Apps Script implementation is outside this repository.

### Reproduced and fixed

- **Puzzle score race:** twelve parallel proofs for different public puzzles could
  all pass the same pre-write pacing check and increase the score from zero to twelve
  immediately. Proof insertion now rechecks pacing, expiry, submission and score limits
  in the database statement. A SQLite trigger increments the score in that same
  transaction. The same twelve-request test now accepts one proof, score one. A
  concurrent submit cannot acquire a stale score or accept newly arriving proofs.
  Duplicate proofs cannot double count. This protects game integrity, not passwords.
- **Unbounded anonymous run creation and retained proof history:** start calls had
  no shared capacity limit, and expired puzzle runs/solves were never removed.
  Each game family now has a global budget of 60 starts per UTC minute and 3,000 per
  UTC day, enforced atomically in two fixed database rows, without visitor identifiers.
  Rejected increments do not keep writing. Active games can continue when new starts
  are refused. Puzzle history older than 24 hours plus one minute is deleted on
  accepted starts, at most 500 proofs and 100 now-childless runs per call, using an
  expiry index. Public rankings are retained. Cleanup is traffic-driven, not scheduled
  or instant erasure; existing backlogs may require several calls.

### Additional hardening

- Every built HTML page now receives its own CSP before any scripts. Only same-origin
  scripts, Cloudflare's challenge origin and hashes of that page's static inline code
  are allowed. Inline event handlers, arbitrary injected scripts and string eval are
  blocked in documents; WebAssembly remains available. Dedicated workers retain their
  own response policy, allowing Pyodide's required dynamic compilation. Header-based
  anti-framing and stricter account-page controls remain. This is defense in depth;
  no exploitable application XSS was demonstrated. Same-origin script compromise is
  still serious, and CSP does not replace safe DOM rendering.
- The public builder rejects hidden files and symlinks recursively, common secret,
  backup, database and private-key filenames, source maps, and nested vendor HTML
  demos. The previously shipped Pyodide developer console (which loaded external
  JavaScript) is no longer published. Runtime Python/WASM/ZIP assets remain available.
  This prevents specific accidental publication paths; an innocently named file can
  still contain a secret, so this is not an exhaustive content secret scanner.
- HTTPS cookies now use the actual **__Host-** prefix, Secure, HttpOnly, Path=/,
  SameSite=Lax, and no Domain. Better Auth's automatic __Secure- prefix is disabled
  only so its supported custom cookie prefix can be used; Secure is explicitly set.
  Older __Secure- cookies are not accepted, so existing testers must log in again.
  This reduces sibling-domain cookie injection risk; it is not a server-compromise fix.

- Legacy `/engine/` JavaScript/WASM routes now serve bundled deployment assets;
  they no longer proxy executable code from external CDNs at request time. The
  unused ASM proxy returns 410. All three active engine entry paths are exercised
  in Chromium. This reduces a runtime supply-chain dependency, without claiming
  that third-party bundled code is inherently safe.
- Nickname-report failures log generic event text rather than upstream exception
  objects, avoiding accidental propagation of request/context details into logs.

### Evidence and limits

- Regression tests exercise real SQL/Better Auth, parallel state changes, duplicate
  proofs, fabricated scores, unknown run IDs, cleanup and start-budget boundaries.
- Chromium exercises login/logout/closed signup and the main tool pages through the
  local Cloudflare runtime. A malicious nickname is shown as text, injected scripts
  and event handlers are blocked, Stockfish and the Pyodide analysis worker start,
  and server files/developer-console URLs return 404.
- A separate local game D1 binding tests the actual Workers trigger, valid puzzle
  submission, fabricated-score rejection, replay rejection and illegal maze moves.
- npm audit again found zero known dependency advisories. A limited scan of locally
  available Git history found no matching PEM-private-key or GitHub-token patterns.
  This does not inspect Cloudflare secret values or certify absence of all secrets.
- Public puzzle solutions remain downloadable. Bots can still produce human-paced
  valid proofs; these public rankings are not suitable for prizes or paid competition.
  Nicknames do not establish account ownership. Random run IDs act as bearer
  capabilities; possession permits use of that run, not access to an EloScanner account.
- Global game budgets trade availability for bounded creation: an attacker can exhaust
  a shared allowance and deny new games to others. They do not stop request/read quotas,
  expensive repeated reads, or distributed DoS. Cloudflare edge configuration and
  monitoring must supplement application limits. Current limits are conservative
  defaults, not a measured maximum audience capacity.
- A live authenticated production check and Cloudflare configuration/CPU review remain
  outstanding. Earlier direct production requests from this environment received
  Cloudflare 403/1010. Local tests and a successful deployment are not substitutes.
- Public registration remains closed. No password/email/2FA/recovery policy changed.

### Additional research

- Perry et al., *Do Users Write More Insecure Code with AI Assistants?*, ACM CCS 2023:
  https://arxiv.org/abs/2211.03622 . This older Codex-based user study found security
  mistakes and overconfidence; it does not establish a failure percentage for today's
  models. It supports checking actual behavior independently of reassuring prose.
- OWASP Authorization Cheat Sheet: deny by default, check every request, test access
  control logic: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Content Security Policy Cheat Sheet: CSP as an additional defense, not a cure
  for XSS: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- OWASP REST Security Cheat Sheet: resource/operation authorization and rate limits:
  https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
  The three OWASP pages were read from their official CheatSheetSeries GitHub source
  because direct page requests were blocked in this environment.
