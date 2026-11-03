// EloScanner's read-only proxy for the Lichess Opening Explorer.
// Cache responses at the edge; handle both JSON and newline-delimited JSON.
export async function onRequestGet({request,context}) {
 const url=new URL(request.url);
 const fen=url.searchParams.get('fen')||'startpos';
 if(fen.length>110||(fen!=='startpos'&&!/^[pnbrqkPNBRQK1-8\/]+ [wb] (?:-|[KQkq]{1,4}) (?:-|[a-h][36]) \d+ \d+$/.test(fen)))
  return Response.json({error:'Invalid position'},{status:400});
 const target=new URL('https://explorer.lichess.org/lichess');
 target.searchParams.set('variant','standard');
 if(fen!=='startpos')target.searchParams.set('fen',fen);
 target.searchParams.set('speeds','blitz,rapid,classical');
 target.searchParams.set('ratings','1600,1800,2000,2200,2500');
 target.searchParams.set('topGames','0');
 target.searchParams.set('recentGames','0');
 target.searchParams.set('moves','12');
 const key=new Request(new URL('/api/opening-stats-cache?'+target.searchParams.toString(),request.url).toString());
 const cache=caches.default;
 try{const hit=await cache.match(key);if(hit)return hit}catch{}
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),22000);
 try{
  const upstream=await fetch(target.toString(),{headers:{Accept:'application/json, application/x-ndjson'},signal:controller.signal});
  if(!upstream.ok){
   return Response.json({error:upstream.status===429?'Opening database rate limit. Please retry after one minute.':'Opening statistics unavailable ('+upstream.status+').'},{status:upstream.status===429?429:502,headers:{'Cache-Control':'no-store'}});
  }
  const raw=await upstream.text();
  let parsed;
  try{parsed=JSON.parse(raw)}catch{
   const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   for(let i=lines.length-1;i>=0;i--){try{parsed=JSON.parse(lines[i]);break}catch{}}
  }
  if(!parsed||!Array.isArray(parsed.moves))throw Error('Invalid database response');
  const safe={
   white:Math.max(0,Number(parsed.white)||0),draws:Math.max(0,Number(parsed.draws)||0),black:Math.max(0,Number(parsed.black)||0),
   opening:parsed.opening&&typeof parsed.opening.name==='string'?{eco:parsed.opening.eco||'',name:parsed.opening.name}:null,
   moves:parsed.moves.slice(0,12).map(m=>({uci:m.uci,san:m.san,white:Number(m.white)||0,draws:Number(m.draws)||0,black:Number(m.black)||0,averageRating:m.averageRating||null}))
  };
  const response=Response.json(safe,{headers:{'Cache-Control':'public,max-age=1800,s-maxage=21600'}});
  try{const storing=cache.put(key,response.clone());if(context?.waitUntil)context.waitUntil(storing);else await storing}catch{}
  return response;
 }catch(e){
  console.error('Opening explorer upstream error:',e&&e.message||e);
  return Response.json({error:'Opening statistics service temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }finally{clearTimeout(timer)}
}
