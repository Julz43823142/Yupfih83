# Primary-phone passkey replacement and lost-device recovery — decision-ready design

Status: PROPOSAL ONLY. No recovery bypass has been deployed. Signup stays closed.

## Security invariants
1. The primary credential cannot be removed by the ordinary delete API.
2. A normal login with a secondary credential never grants permission to
   replace the primary credential.
3. A stolen session, email address, username, phone number, helpdesk request,
   IP address or device fingerprint is insufficient to recover an account.
4. Every credential replacement requires a *new verified WebAuthn registration*
   and an atomic database transition. Never accept client-supplied public keys
   without verifying challenge, origin, RP ID and user verification.
5. Revoke other sessions and all outstanding primary-step-up proofs after a
   successful primary replacement. Audit event timestamps and credential IDs
   without recording public-key material or authentication challenges.

## Path A — owner still has their old primary passkey (recommended to implement)
- Start a short-lived, single-use phone-transfer ceremony from an authenticated
  session. Verify an assertion from the **currently mapped primary credential**.
- Register a new platform credential with a new server-generated challenge,
  short expiry and strict origin/RP/user-verification checks.
- Atomically install the new credential, replace the primary mapping and
  retire the old primary credential *only* inside a tightly controlled transfer
  transaction. Ordinary primary deletion/reassignment triggers must remain
  enabled for all other operations. A narrowly scoped internal operation must
  prove the active transfer token and account ownership.
- Invalidate all other sessions and proofs. Record the event. If any step
  fails, keep the old primary mapping and old credential fully usable.
- Test replay, double-submit, concurrent transfer, account mixup, rollback,
  stolen session, wrong credential and wrong origin.

## Path B — primary phone permanently lost (requires owner policy decision)
**Option B1: no remote recovery.** Existing secondary credentials may permit
login, but cannot replace the primary. A user who loses all copies of their
primary credential cannot fully manage the account. Document this clearly
before signup; do not advertise recoverability.

**Option B2: high-entropy offline recovery codes, created only after a primary
assertion.** Generate multiple random one-time codes on-device/server with
at least 128 bits of entropy per code, show only once, store only salted
keyed hashes server-side, and use a narrowly scoped recovery flow with strict
rate limits, anti-replay, fresh verified WebAuthn registration, account
notifications when possible, and immediate invalidation of all sessions and
remaining codes. A secondary passkey alone is insufficient. If codes are
lost too, recovery is impossible. Requires separate design, implementation,
abuse tests and explicit owner approval before signup.

Do NOT offer SMS, email-link recovery, human support overrides, or secondary
passkey-only promotion as an undocumented fallback. These would weaken the
primary-phone requirement.

## UX and truthful language
- Explain that WebAuthn cannot reliably prove a credential lives on a phone
  and that synchronized passkeys may exist on multiple devices.
- State that the website can prevent server-side deletion of the primary
  credential, but cannot prevent the device owner or password manager from
  deleting a local/synced copy.
- Warn users to set up additional passkeys and, if B2 is approved, save offline
  recovery codes. Do not claim additional passkeys replace the primary.
- Never open public registration until an explicit lost-phone policy is chosen.

## Implementation state
- Primary mapping and delete guards exist in PR 80.
- Secondary key management requires a recent primary assertion.
- Neither A nor B is implemented. Implement them in reviewed PRs with
  synthetic D1 and browser WebAuthn tests, without weakening the existing
  immutable-primary trigger outside the special transfer transaction.
