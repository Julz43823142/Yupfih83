// Retired: player avatar URLs are no longer sent through EloScanner servers.
export function onRequestGet() {
  return new Response("Retired", {status:410,headers:{"Cache-Control":"no-store"}});
}
