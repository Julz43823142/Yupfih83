# EloScanner roles (phase 1)

Roles are `member` (default) and `admin`. `auth_member_role` uses the immutable Better Auth user ID. Only the existing `sharkmeister` account is bootstrapped to admin by migration 0014. No public endpoint can grant roles. The authenticated `GET /api/admin/me` endpoint reports only the caller's own role. Missing role rows are treated as member (fail closed).

## Production activation

Do not run migration until reviewed and approved. Apply migration 0014 to the production AUTH_DB D1 database via the existing controlled migration workflow, then deploy the Pages functions. Verify `sharkmeister` returns `admin` from `/api/admin/me` and another member returns `member`. Do not enable public signup. Do not delete or recreate the existing account or change passkeys/passwords.

## Not yet implemented

Admin dashboard, moderation actions, account deletion, suspensions, leaderboard controls, audit trail and future roles such as staff/owner require separately reviewed server-side authorization and security tests. This phase deliberately grants no moderation capability and exposes no role-changing endpoint.
