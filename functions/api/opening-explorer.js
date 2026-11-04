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
 // Try the Lichess games database first; the Masters database is a
 // separate public upstream and remains usable when the first is rate-limited.
 for(const endpoint of [(()=>{const u=new URL('https://explorer.lichess.org/masters');if(fen!=='startpos')u.searchParams.set('fen',fen);u.searchParams.set('topGames','0');u.searchParams.set('recentGames','0');u.searchParams.set('moves','12');return u.toString()})(),target.toString()]){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const upstream=await fetch(endpoint,{headers:{Accept:'application/json'},signal:controller.signal});
   if(!upstream.ok){lastError='HTTP '+upstream.status;continue}
   const raw=await upstream.text();
   try{parsed=JSON.parse(raw)}catch{
    for(const line of raw.split(/\r?\n/).reverse()){try{const item=JSON.parse(line);if(Array.isArray(item.moves)){parsed=item;break}}catch{}}
   }
   if(parsed&&Array.isArray(parsed.moves))break;
   parsed=null;
   lastError='Invalid opening response';
  }catch(e){lastError=String(e?.message||e)}
  finally{clearTimeout(timer)}
 }
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
