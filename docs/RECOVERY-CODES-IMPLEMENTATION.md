# Offline recovery codes — implementation status (PR 81)

**Registration remains CLOSED.** This PR is stacked on PR 80 and PR 79.
No production D1 migration or public recovery redemption endpoint is enabled.

## Implemented in this PR
- Eight independent 160-bit CSPRNG-generated Base32 recovery codes per account.
- One-time display only; database stores only user-bound, domain-separated
  HMAC-SHA256 digests, never plaintext codes.
- Additive migration `0011_recovery_codes.sql`, not yet applied to production.
- Atomic regeneration invalidates the old set.
- Single-use, account-bound internal consume primitive.
- Authenticated `POST /api/auth/passkey/recovery-codes/rotate` requires
  a fresh session-bound **primary** WebAuthn assertion (five minutes).
- No-store response headers, hourly per-account rate limiting, no analytics
  or server logging of code values.
- Synthetic database tests for entropy, storage, rotation, single-use and
  denial without primary proof.

## Not yet implemented — launch blockers
1. Recovery-code **redemption must NOT be exposed yet**. Build a short-lived
   recovery transaction that atomically verifies and consumes the code,
   registers a new verified WebAuthn credential, safely replaces the primary
   credential, revokes all other sessions and invalidates remaining codes.
   The current primary-immutability triggers deliberately prevent replacement;
   no bypass has been added.
2. Finish mobile-first registration UX: show/download/copy codes once after
   verified primary signup; clearly warn that skipping storage risks permanent
   account-management loss. Do not force code re-entry.
3. Build a primary-authenticated recovery-code regeneration UI.
4. Ensure migration 0011 is applied **only after explicit production approval**,
   and that recovery UX is not advertised before redemption is secure.
5. Verify real-phone/QR flows, Cloudflare edge policy and D1 recovery rehearsal.
6. Never claim a database-only breach exposes usable codes. Conversely, theft
   of an actual unused plaintext recovery code is account takeover risk.

Do not merge, deploy or open registration without owner approval.
