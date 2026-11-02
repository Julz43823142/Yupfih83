// Serve the unmodified GPLv3 Stockfish 19.0.1 browser engine from a same-origin URL.
export async function onRequestGet(){
 const upstream=await fetch("https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/stockfish-19-lite-single.js");
 if(!upstream.ok)return new Response("Engine asset unavailable",{status:502});
 return new Response(upstream.body,{headers:{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"public, max-age=86400","Access-Control-Allow-Origin":"*"}});
}
