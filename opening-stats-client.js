// Shared, read-only opening statistics client.
// Prefer EloScanner's cache; fall back to the public Lichess explorer if the proxy fails.
export async function fetchOpeningStats(fen,{signal}={}){
 const query=encodeURIComponent(fen);
 let lastError;
 try{
  const r=await fetch('/api/opening-explorer?fen='+query,{signal});
  if(r.status===429)throw Error('Rate limit reached. Try again after one minute.');
  const type=r.headers.get('content-type')||'';
  if(!type.includes('json'))throw Error('Unexpected server response');
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Statistics unavailable');
  if(!Array.isArray(data.moves))throw Error('Invalid statistics');
  return data;
 }catch(e){
  if(signal?.aborted)throw e;
  lastError=e;
  if(String(e?.message||'').includes('Rate limit'))throw e;
 }
 // If the Cloudflare proxy is unavailable, try both public explorer databases.
 for(const base of ['https://explorer.lichess.org/lichess','https://explorer.lichess.org/masters']){
  const url=new URL(base);
  if(fen!=='startpos')url.searchParams.set('fen',fen);
  if(base.endsWith('/lichess')){
   url.searchParams.set('variant','standard');
   url.searchParams.set('ratings','1600,1800,2000,2200,2500');
   url.searchParams.set('speeds','blitz,rapid,classical');
  }
  url.searchParams.set('topGames','0');url.searchParams.set('recentGames','0');url.searchParams.set('moves','12');
  try{
   const r=await fetch(url.toString(),{signal,headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('Opening service unavailable ('+r.status+')');
   const raw=await r.text();let data;
   try{data=JSON.parse(raw)}catch{
    for(const line of raw.split(/\r?\n/).reverse()){try{const candidate=JSON.parse(line);if(Array.isArray(candidate.moves)){data=candidate;break}}catch{}}
   }
   if(data&&Array.isArray(data.moves))return data;
  }catch(e){if(signal?.aborted)throw e;lastError=e}
 }
 console.warn('Opening explorer sources unavailable',lastError);
 throw Error('Opening statistics are temporarily unavailable. Try again later.');
}
