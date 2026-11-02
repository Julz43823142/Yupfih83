// Stockfish 19 ASM-JS fallback: no WebAssembly or cross-origin isolation required.
// Keep the browser Worker same-origin to avoid CDN Worker restrictions.
export async function onRequestGet(){
 const urls=[
  "https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/stockfish-19-asm.js",
  "https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-asm.js"
 ];
 for(const url of urls){
  try{
   const upstream=await fetch(url);
   if(upstream.ok)return new Response(upstream.body,{
    headers:{"Content-Type":"text/javascript; charset=utf-8",
      "Cache-Control":"public, max-age=3600",
      "X-Content-Type-Options":"nosniff"}
   });
  }catch{}
 }
 return new Response("Stockfish fallback asset unavailable",{status:502,headers:{"Content-Type":"text/plain"}});
}
