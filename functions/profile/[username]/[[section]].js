// Render profile subpages using the same public profile shell.
export async function onRequestGet({ request, params, env }) {
  const username = params.username;
  const section = params.section;
  const slug = Array.isArray(section) ? section.join('/') : section;
  const allowed = new Set(['friend-list', 'friends', 'chess-rating', 'puzzle-rating', 'personal-records', 'game-history']);
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(username) || !(slug === undefined || slug === '' || allowed.has(slug))) {
    return new Response('Page not found', { status: 404 });
  }
  const response = await env.ASSETS.fetch(new Request(new URL('/profile.html', request.url), { method: 'GET' }));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(response.body, { status: response.status, headers });
}
