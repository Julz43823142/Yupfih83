// Explicit nested Cloudflare Pages route. Gateway enforces a strict allowlist.
import { handleAuth } from '../../../../lib/auth/gateway.mjs';
export const onRequest = context => handleAuth(context);
