// Explicit Cloudflare Pages route; avoids relying on optional catch-all matching.
import { handleAuth } from '../../../lib/auth/gateway.mjs';
export const onRequest = context => handleAuth(context);
