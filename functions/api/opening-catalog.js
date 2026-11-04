import {onRequestGet as getStats} from './opening-explorer.js';
// Full CC0 opening names from lichess-org/chess-openings, cached at the edge.
export async function onRequestGet({request,env,context}){
 if(new URL(request.url).searchParams.has('fen'))return getStats({request,env,context});
 const cache=caches.default,key=new Request(new URL('/api/opening-catalog',request.url).toString());
 const cached=await cache.match(key);if(cached)return cached;
 try{
  const groups=['a','b','c','d','e'];
  const files=await Promise.all(groups.map(async letter=>{
   const sources=[
    'https://cdn.jsdelivr.net/gh/lichess-org/chess-openings@master/'+letter+'.tsv',
    'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'+letter+'.tsv'
   ];
   for(const source of sources){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
     const r=await fetch(source,{headers:{Accept:'text/plain'},signal:controller.signal});
     if(r.ok){const body=await r.text();if(body.startsWith('eco\tname\tpgn'))return body}
    }catch{}finally{clearTimeout(timer)}
   }
   throw Error('Opening catalogue unavailable');
  }));
  const rows=files.flatMap(t=>t.trim().split(/\r?\n/).slice(1).map(line=>{const [eco,name,pgn]=line.split('\t');return {eco,name,pgn}}).filter(x=>x.name&&x.pgn));
  if(rows.length<100)throw Error('Incomplete catalogue');
  const response=Response.json(rows,{headers:{'Cache-Control':'public, max-age=86400, s-maxage=604800'}});
  try{await cache.put(key,response.clone())}catch{}
  return response;
 }catch{return Response.json({error:'Opening names temporarily unavailable.'},{status:503})}
}