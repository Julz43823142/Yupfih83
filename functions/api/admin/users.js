// Admin-only member directory. Never return email, password, session or passkey data.
import { requireAdmin, adminHeaders, adminReply } from '../../../lib/auth/admin-access.mjs';
export async function onRequestGet({ request, env }) {
  const access = await requireAdmin({ request, env });
  if (access instanceof Response) return access;
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim();
    if (search.length > 24 || (search && !/^[a-zA-Z0-9_]+$/.test(search)))
      return Response.json({ message: 'Invalid search.' }, { status: 400, headers: adminHeaders });
    const rawPage = url.searchParams.get('page') || '0';
    if (!/^(0|[1-9][0-9]{0,4})$/.test(rawPage))
      return Response.json({ message: 'Invalid page.' }, { status: 400, headers: adminHeaders });
    const page = Math.min(Number(rawPage), 1000), limit = 25, offset = page * limit;
    const condition = search ? "WHERE lower(u.username) LIKE ? ESCAPE '\\'" : '';
    const filter = search ? '%' + search.toLowerCase().replace(/[_%\\]/g, '\\$&') + '%' : null;
    const countQuery = env.AUTH_DB.prepare('SELECT COUNT(*) AS total FROM "user" u ' + condition);
    const listQuery = env.AUTH_DB.prepare('SELECT u.username, u.createdAt, COALESCE(r.role, \'member\') AS role FROM "user" u LEFT JOIN auth_member_role r ON r.userId=u.id ' + condition + ' ORDER BY u.createdAt DESC, u.username ASC LIMIT ? OFFSET ?');
    const count = await (search ? countQuery.bind(filter) : countQuery).first();
    const result = await (search ? listQuery.bind(filter, limit, offset) : listQuery.bind(limit, offset)).all();
    return Response.json({
      total: count?.total || 0,
      page,
      pageSize: limit,
      users: (result.results || []).map(row => ({
        username: row.username,
        joinedAt: row.createdAt,
        role: row.role === 'admin' ? 'admin' : 'member'
      }))
    }, { headers: adminHeaders });
  } catch {
    return Response.json({ message: 'Member directory unavailable.' }, { status: 503, headers: adminHeaders });
  }
}
