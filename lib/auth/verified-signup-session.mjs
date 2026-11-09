import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

// This endpoint is deliberately not part of the public gateway route allowlist.
// Only the gateway may invoke it AFTER WebAuthn attestation has been verified and
// the new user and passkey were committed in one D1 transaction.
export function verifiedSignupSessionPlugin() {
  return {
    id: 'eloscanner-verified-signup-session',
    endpoints: {
      completeVerifiedPasskeySignup: createAuthEndpoint(
        '/__internal/verified-passkey-signup-session',
        { method: 'POST', requireHeaders: true },
        async ctx => {
          const userId = ctx.body?.userId;
          if (typeof userId !== 'string' || !/^[a-f0-9-]{36}$/.test(userId))
            return ctx.json({ message: 'Invalid signup session.' }, { status: 400 });
          const user = await ctx.context.adapter.findOne({
            model: 'user', where: [{ field: 'id', value: userId }]
          });
          if (!user?.id || user.id !== userId || !user.username)
            return ctx.json({ message: 'Account not found.' }, { status: 404 });
          const session = await ctx.context.internalAdapter.createSession(user.id, false);
          if (!session?.token) return ctx.json({ message: 'Session unavailable.' }, { status: 503 });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { id: user.id, username: user.username, createdAt: user.createdAt } });
        }
      )
    }
  };
}
