// Own role lookup; no user-supplied identity is accepted for authorization.
import { adminHeaders, adminReply } from '../../../lib/auth/admin-access.mjs';
import { createAuth } from '../../../lib/auth/config.mjs';

export async function onRequestGet({ request, env }) {
  // Non-admin accounts may query their own role, but never an admin directory.
  if (!env.AUTH_DB || typeof env.BETTER_AUTH_SECRET !== 'string' ||
      env.BETTER_AUTH_SECRET.length < 32) return adminReply('Unavailable.', 503);
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none'))
    return adminReply('Forbidden.', 403);
  try {
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    if (!session?.user?.id) return adminReply('Unauthorized.', 401);
    const row = await env.AUTH_DB.prepare('SELECT role FROM auth_member_role WHERE userId=? LIMIT 1').bind(session.user.id).first();
    return Response.json({ role: row?.role === 'admin' ? 'admin' : 'member' }, { headers: adminHeaders });
  } catch { return adminReply('Role lookup unavailable.', 503); }
}
