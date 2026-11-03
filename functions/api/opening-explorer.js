// Cloudflare Pages Function: publicly documented Lichess Opening Explorer.
// Cache commonly viewed FENs to reduce traffic to the volunteer-run API.
export async function onRequestGet({request}) {
 const url=new URL(request.url),fen=url.searchParams.get('fen')||'startpos';
 if(fen.length>110 || (fen!=='startpos' && !/^[pnbrqkPNBRQK1-8\/]+ [wb] (?:-|[KQkq]{1,4}) (?:-|[a-h][36]) \d+ \d+$/.test(fen)))
  return Response.json({error:'Invalid position'},{status:400});
 const target=new URL('https://explorer.lichess.org/lichess');
 target.searchParams.set('variant','standard');
 if(fen!=='startpos')target.searchParams.set('fen',fen);
 target.searchParams.set('speeds','blitz,rapid,classical');
 target.searchParams.set('ratings','1600,1800,2000,2200,2500');
 target.searchParams.set('topGames','0');target.searchParams.set('recentGames','0');
 target.searchParams.set('moves','12');
 const key=new Request('https://eloscanner-opening-cache.invalid/?'+target.searchParams.toString());
 const cache=caches.default;const hit=await cache.match(key);if(hit)return hit;
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  let upstream;
  try{upstream=await fetch(target.toString(),{headers:{Accept:'application/json','User-Agent':'EloScanner-OpeningExplorer/1.0'},signal:controller.signal})}
  finally{clearTimeout(timer)}
  if(!upstream.ok)return Response.json({error:upstream.status===429?'Lichess rate limit reached. Try again later.':'Opening database unavailable.',status:upstream.status},{status:upstream.status===429?429:502,headers:{'Cache-Control':'no-store'}});
  const result=await upstream.json();
  const safe={white:result.white||0,draws:result.draws||0,black:result.black||0,opening:result.opening||null,moves:Array.isArray(result.moves)?result.moves.slice(0,12).map(m=>({uci:m.uci,san:m.san,white:m.white||0,draws:m.draws||0,black:m.black||0,averageRating:m.averageRating||null})):[]};
  const response=Response.json(safe,{headers:{'Cache-Control':'public, max-age=1800, s-maxage=21600','Access-Control-Allow-Origin':'*'}});
  try{await cache.put(key,response.clone())}catch{}
  return response;
 }catch{return Response.json({error:'Opening database temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}