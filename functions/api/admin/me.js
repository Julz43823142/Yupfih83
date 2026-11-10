// Own role lookup: only a verified session determines identity.
import { requireAdmin, adminHeaders } from '../../../lib/auth/admin-access.mjs';

export async function onRequestGet({ request, env }) {
  const access = await requireAdmin({ request, env }, {}, false);
  if (access instanceof Response) return access;
  return Response.json({ role: access.role }, { headers: adminHeaders });
}
