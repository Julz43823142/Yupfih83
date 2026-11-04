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
 let parsed=null,lastError=null;
 // Query both public explorer pools concurrently. A slow or throttled pool
 // must not block the other one; accept only valid completed JSON responses.
 const masters=new URL('https://explorer.lichess.org/masters');
 if(fen!=='startpos')masters.searchParams.set('fen',fen);
 masters.searchParams.set('topGames','0');masters.searchParams.set('recentGames','0');masters.searchParams.set('moves','12');
 async function queryExplorer(endpoint){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const upstream=await fetch(endpoint,{headers:{Accept:'application/json'},signal:controller.signal});
   if(!upstream.ok)throw Error('Upstream HTTP '+upstream.status);
   const raw=await upstream.text();let result;
   try{result=JSON.parse(raw)}catch{
    for(const line of raw.split(/\r?\n/).reverse()){
     try{const candidate=JSON.parse(line);if(Array.isArray(candidate.moves)){result=candidate;break}}catch{}
    }
   }
   if(!result||!Array.isArray(result.moves))throw Error('Invalid explorer response');
   return result;
  }finally{clearTimeout(timer)}
 }
 const attempts=await Promise.allSettled([queryExplorer(masters.toString()),queryExplorer(target.toString())]);
 parsed=attempts.find(x=>x.status==='fulfilled')?.value||null;
 if(!parsed)lastError=attempts.map(x=>String(x.reason?.message||x.reason)).join('; ');
 if(!parsed||!Array.isArray(parsed.moves)){
  console.warn('Opening statistics upstream failed:',lastError);
  return Response.json({error:'Opening statistics temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
 try{
  const safe={
   white:Math.max(0,Number(parsed.white)||0),draws:Math.max(0,Number(parsed.draws)||0),black:Math.max(0,Number(parsed.black)||0),
   opening:parsed.opening&&typeof parsed.opening.name==='string'?{eco:parsed.opening.eco||'',name:parsed.opening.name}:null,
   moves:parsed.moves.slice(0,12).map(m=>({uci:m.uci,san:m.san,white:Number(m.white)||0,draws:Number(m.draws)||0,black:Number(m.black)||0,averageRating:m.averageRating||null}))
  };
  const response=Response.json(safe,{headers:{'Cache-Control':'public,max-age=1800,s-maxage=21600'}});
  try{const storing=cache.put(key,response.clone());if(context?.waitUntil)context.waitUntil(storing);else await storing}catch{}
  return response;
 }catch(e){
  console.error('Opening explorer response error:',e);
  return Response.json({error:'Opening statistics service temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
