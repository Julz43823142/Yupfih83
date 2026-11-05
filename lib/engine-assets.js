// Legacy engine URLs serve the reviewed files shipped with this deployment.
// Never fetch executable JavaScript from a third-party CDN on visitor requests.
export async function serveEngineAsset({request,env},file){
 const types={
  'stockfish-19-lite-single.js':'text/javascript; charset=utf-8',
  'stockfish-19-lite-single.wasm':'application/wasm'
 };
 if(!types[file]||!env?.ASSETS)return new Response('Engine unavailable',{status:503});
 try{
  const source=await env.ASSETS.fetch(new Request(new URL('/vendor/stockfish/'+file,request.url)));
  if(!source.ok)throw Error('Missing engine asset');
  return new Response(source.body,{headers:{'Content-Type':types[file],'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Engine asset unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
}
