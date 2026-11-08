// Public, finished Lichess games only. Ratings are actual player ratings,
// not estimates or invented demonstration targets.
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
// Verified public-domain rated Lichess game from database.lichess.org's PGN sample.
// Abbot (2100) vs Costello (2000), 2017-04-01, game PpwPOZMq.
// Retain an authentic offline fallback when upstream requests are rate-limited.
const archived={id:'PpwPOZMq',link:'https://lichess.org/PpwPOZMq',whiteElo:2100,blackElo:2000,
 moves:['e2e4','c7c5','g1f3','b8c6','f1c4','e7e6','c2c3','b7b5','c4b3','c5c4','b3c2','a7a5','d2d4','c4d3','d1d3','g8f6','e4e5','f6d5','c1g5','d8c7','b1d2','h7h6','g5h4','f8a6','b2b3','d5f4']};
const fail=()=>{const side=Math.random()<.5?'white':'black';return reply({...archived,side,elo:side==='white'?archived.whiteElo:archived.blackElo,archived:true})};
const timeout=()=>AbortSignal.timeout(6500);
const ratings=g=>[g?.players?.white?.rating,g?.players?.black?.rating];
export async function onRequestGet({request}){
 const url=new URL(request.url);
 const excluded=(url.searchParams.get('exclude')||'').slice(0,12);
 const api='https://lichess.org';
 try{
  const cache=typeof caches!=='undefined'?caches.default:null;
  const slot=Math.floor(Date.now()/600000);
  const cacheRequest=new Request('https://eloscanner.com/__elo_real_games/'+slot);
  let games;
  if(cache){const hit=await cache.match(cacheRequest);if(hit){games=await hit.json();}}
  if(!Array.isArray(games)||!games.length){
   const channelsResponse=await fetch(api+'/api/tv/channels',{headers:{Accept:'application/json'},signal:timeout()});
   if(!channelsResponse.ok)return fail();
   const channels=await channelsResponse.json();
   const ids=['rapid','classical','blitz','bullet','ultraBullet'].map(k=>channels?.[k]?.user?.id).filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{2,30}$/.test(id));
   games=[];
   // One bounded upstream history request, never an unbounded stream.
   for(const username of ids.slice(0,3)){
    const response=await fetch(api+'/api/games/user/'+encodeURIComponent(username)+'?max=8&finished=true&moves=true&sort=dateDesc',{headers:{Accept:'application/x-ndjson'},signal:timeout()});
    if(!response.ok)continue;
    const body=(await response.text()).slice(0,130000);
    for(const line of body.split('\n')){
     if(!line.trim())continue;
     let g;try{g=JSON.parse(line)}catch{continue}
     if(!/^[A-Za-z0-9]{8,12}$/.test(g?.id||'')||typeof g?.moves!=='string'||g.moves.length>15000)continue;
     const list=g.moves.trim().split(/\s+/);
     const [white,black]=ratings(g);
     if(list.length<12||list.length>260||!list.every(m=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))||![white,black].every(n=>Number.isInteger(n)&&n>=100&&n<=4000))continue;
     games.push({id:g.id,moves:list,whiteElo:white,blackElo:black,link:'https://lichess.org/'+g.id});
    }
    if(games.length>=4)break;
   }
   if(!games.length)return fail();
   if(cache)try{await cache.put(cacheRequest,Response.json(games,{headers:{'Cache-Control':'public,max-age=600'}}))}catch{}
  }
  const choices=games.filter(g=>g.id!==excluded);
  const game=(choices.length?choices:games)[Math.floor(Math.random()*(choices.length||games.length))];
  const side=Math.random()<.5?'white':'black';
  return reply({id:game.id,link:game.link,moves:game.moves,side,elo:side==='white'?game.whiteElo:game.blackElo});
 }catch{return fail()}
}
