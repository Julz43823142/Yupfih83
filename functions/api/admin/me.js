// Role information for the currently authenticated member only.
// Never accept a user ID or username from the client for authorization.
import { createAuth } from '../../../lib/auth/config.mjs';
const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
export async function onRequestGet({ request, env }) {
  if (!env.AUTH_DB || !env.BETTER_AUTH_SECRET) return Response.json({ message: 'Unavailable.' }, { status: 503, headers });
  // GET is read-only; the session cookie is the authorization boundary.
  // Cloudflare's configured auth base URL may differ from the request origin
  // (e.g. www/canonical redirects), so do not reject valid same-site GETs.
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return Response.json({ message: 'Forbidden.' }, { status: 403, headers });
  try {
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ message: 'Unauthorized.' }, { status: 401, headers });
    const row = await env.AUTH_DB.prepare('SELECT role FROM auth_member_role WHERE userId=? LIMIT 1').bind(session.user.id).first();
    return Response.json({ role: row?.role === 'admin' ? 'admin' : 'member' }, { headers });
  } catch {
    return Response.json({ message: 'Role lookup unavailable.' }, { status: 503, headers });
  }
}
