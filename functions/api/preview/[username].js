// Retired: player reports must be generated only on the visitor's device.
// Never fetch or cache named player reports in Cloudflare or GitHub.
export function onRequestGet() {
  return new Response(JSON.stringify({error:"Player report previews are no longer stored server-side."}), {
    status:410,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}
