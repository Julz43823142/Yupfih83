# Recovery and primary phone replacement — PR 81

**Status: draft, not deployed, registration remains CLOSED.**
Stacked on draft PRs 79 and 80. No production database migration has been applied.

## Implemented (pending complete CI and device verification)
- Eight 160-bit CSPRNG Base32 emergency codes; plaintext shown once, only
  user-bound domain-separated keyed SHA-256 digests stored in D1.
- Generate/rotate codes only from a signed-in session with fresh primary
  WebAuthn proof. Download/copy/dismiss UI; onboarding prompts new registrants
  to generate and save codes after a verified primary signup.
- Lost-phone recovery: enter username and unused code; generate a short-lived
  IP-bound, one-time WebAuthn challenge; verify origin, RP ID, UV and public
  credential; commit replacement in one D1 transaction.
- Phone transfer while the original primary credential remains available:
  require a fresh session-bound primary assertion and new WebAuthn registration.
- Both replacement paths atomically revoke all old passkeys (including optional
  passkeys), sessions and recovery codes. The recovered account has one new
  primary credential and must generate eight new recovery codes.
- DB triggers continue to block ordinary primary reassignment/deletion.
  An authorization gate is accepted only for an active, unexpired, unconsumed
  recovery attempt with unused code or an active primary-verified transfer.
- Strict per-source and per-account rate limits, CSRF/origin checks, no-store
  responses, single-use attempts and credential uniqueness constraints.
- Synthetic tests cover replay, expiry, wrong source/challenge, wrong owner,
  missing/expired primary proof, five-passkey replacement, code revocation
  and transaction rollback. Virtual WebAuthn browser recovery test added.

## Still required before production
- Latest CI must pass completely; focused WebAuthn browser test must run green.
- Real Android/iPhone device, desktop-to-phone QR and cross-device WebAuthn
  testing cannot be substituted by a virtual authenticator.
- Production Cloudflare WAF and privileged access review is not possible
  with the current read-only preview token.
- Test a real D1 Time Travel restore on a disposable, isolated database;
  read-only bookmarks and local SQLite backup tests are not equivalent.
- Explicit owner authorization to merge PRs 79, 80 and 81, apply migrations
  0010–0013 and enable registration. No automatic merge/deployment.
- Complete a security review of WebAuthn credential enrollment and primary
  proof freshness, including plugin and Cloudflare D1 compatibility.

Important: the server cannot cryptographically prove that a credential is
stored on a physical phone, and synchronized passkeys can exist on several
devices. Never promise otherwise.
