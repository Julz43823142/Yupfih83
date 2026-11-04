// Same-origin image proxy: visitors never request Chess.com avatar CDN directly.
export async function onRequestGet({request}) {
  const input = new URL(request.url).searchParams.get("url");
  if (!input || input.length > 1500) return new Response("Invalid avatar URL", {status:400});
  let url;
  try { url = new URL(input); } catch { return new Response("Invalid avatar URL", {status:400}); }
  if (url.protocol !== "https:" || url.hostname !== "images.chesscomfiles.com" || url.port || url.username || url.password) {
    return new Response("Avatar host not allowed", {status:403});
  }
  try {
    const response = await fetch(url.toString(), {redirect:"manual", headers:{Accept:"image/*"}});
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\/(png|jpeg|webp|gif)$/i.test(type.split(";")[0].trim())) {
      return new Response("Avatar unavailable", {status:502});
    }
    return new Response(response.body, {headers:{"Content-Type":type,"Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff"}});
  } catch { return new Response("Avatar unavailable", {status:502}); }
}
