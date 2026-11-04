// Read-only opening statistics, served by EloScanner's authenticated Lichess proxy.
// The Lichess token is stored only in Cloudflare Pages secrets.
export async function fetchOpeningStats(fen,{signal}={}){
 const r=await fetch('/api/opening-explorer?fen='+encodeURIComponent(fen),{signal,cache:'no-store'});
 const type=r.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Error('Opening statistics service returned an unexpected response.');
 const data=await r.json();
 if(!r.ok)throw Error(data.error||'Opening statistics are currently unavailable.');
 if(!Array.isArray(data.moves))throw Error('Invalid opening statistics response.');
 return data;
}
