import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins/username';
import { passwordFunctions } from './password.mjs';

export function createAuth(env, { provision = false } = {}) {
  return betterAuth({
    appName: 'EloScanner',
    baseURL: env.BETTER_AUTH_URL || 'https://eloscanner.com',
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.AUTH_DB,
    trustedOrigins: [env.BETTER_AUTH_URL || 'https://eloscanner.com'],
    telemetry: { enabled: false },
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true, disableSignUp: !provision, requireEmailVerification: false,
      minPasswordLength: 15, maxPasswordLength: 128,
      password: passwordFunctions(env.BETTER_AUTH_SECRET)
    },
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 7, disableSessionRefresh: true, freshAge: 600, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: !(env.BETTER_AUTH_URL || '').startsWith('http://localhost:'),
      cookiePrefix: 'eloscanner',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { disableIpTracking: true }
    },
    // Our outer gateway uses atomic shared D1 counters, before expensive hashing.
    rateLimit: { enabled: false },
    databaseHooks: {
      session: { create: { before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }) } }
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 24, usernameValidator: value => /^[a-zA-Z0-9_]+$/.test(value) })]
  });
}
