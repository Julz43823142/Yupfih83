import { handleAuth } from '../../../lib/auth/gateway.mjs';
export const onRequest = context => handleAuth(context);
