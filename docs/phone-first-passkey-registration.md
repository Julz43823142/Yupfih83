# Phone-first passwordless registration — Preview design

Status: design only; NOT implemented or enabled. Keep Production/main unchanged.

## Desired flow
1. On desktop, select Create account and choose a username.
2. Show phone instructions and start a short-lived registration attempt.
3. Complete WebAuthn cross-device registration on a phone through the browser/OS QR interface.
4. Verify the signed WebAuthn response server-side before creating the user and credential in an atomic database operation.
5. Sign the new user in; session lifetime is 30 days.
6. Later desktop sign-in uses cross-device passkey QR; phone sign-in uses the phone passkey.

## Security and compatibility requirements
- Public signup is currently hard-closed; do not open it until the entire registration flow passes tests.
- Current Better Auth passkey enrollment requires an existing session. A dedicated, secure signup protocol is required.
- Generate unpredictable single-use challenges with short expiry; validate origin, RP ID, user verification, and credential uniqueness. Atomically consume challenges.
- Request cross-platform attachment for desktop signup and reject platform attachment when identifiable. Important limitation: WebAuthn cannot cryptographically prove the authenticator is a smartphone rather than a roaming security key. The browser controls QR UI.
- Require abuse prevention, origin/CSRF protection, rate limits, and challenge verification. Avoid orphan accounts and username races.
- Keep this feature behind a separate default-off registration flag. A deployment must never implicitly enable public signup.
- Preserve existing user IDs, usernames, Sharkmeister IDs, scores and password sign-in during migration.
- Define and test lost-phone recovery before requiring passkeys for existing members.
- Do not alter Production or merge PR #75 without explicit approval.

## Acceptance criteria
- Desktop registration with phone-based cross-device passkey succeeds; cancellation creates no account.
- Desktop-local Windows Hello enrollment is rejected by the desktop phone-first signup policy.
- Expired/replayed challenges, invalid origin/RP, missing user verification, duplicate usernames and concurrent registrations are rejected.
- New passkey works on phone and through desktop QR sign-in.
- Existing account login and scores remain intact.
- Session lifetime is 30 days on Preview; Production requires a separate approved rollout.
- Validate Android, iOS, Windows, macOS and supported browsers; QR availability is browser/OS dependent.
