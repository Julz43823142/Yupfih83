// Public, finished Lichess games only. Ratings are actual player ratings,
// not estimates or invented demonstration targets.
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
// Verified public-domain rated Lichess game from database.lichess.org's PGN sample.
// Abbot (2100) vs Costello (2000), 2017-04-01, game PpwPOZMq.
// Retain an authentic offline fallback when upstream requests are rate-limited.
const archived={id:'PpwPOZMq',link:'https://lichess.org/PpwPOZMq',whiteElo:2100,blackElo:2000,
 moves:['e2e4','c7c5','g1f3','b8c6','f1c4','e7e6','c2c3','b7b5','c4b3','c5c4','b3c2','a7a5','d2d4','c4d3','d1d3','g8f6','e4e5','f6d5','c1g5','d8c7','b1d2','h7h6','g5h4','c8a6','b2b3','d5f4']};
const fail=excluded=>{if(excluded.has(archived.id))return reply({error:'No new rated game available right now. Retry in a moment.'},503);const side=Math.random()<.5?'white':'black';return reply({...archived,side,elo:side==='white'?archived.whiteElo:archived.blackElo,archived:true})};
const timeout=()=>AbortSignal.timeout(6500);
const ratings=g=>[g?.players?.white?.rating,g?.players?.black?.rating];
async function lichessFallback({request}){
 const url=new URL(request.url);
 const excluded=new Set((url.searchParams.get('exclude')||'').split(',').slice(0,35));
 const api='https://lichess.org';
 try{
  const cache=typeof caches!=='undefined'?caches.default:null;
  const slot=Math.floor(Date.now()/600000);
  const cacheRequest=new Request('https://eloscanner.com/__elo_real_games/'+slot);
  let games;
  if(cache){const hit=await cache.match(cacheRequest);if(hit){games=await hit.json();}}
  if(!Array.isArray(games)||!games.length){
   const channelsResponse=await fetch(api+'/api/tv/channels',{headers:{Accept:'application/json'},signal:timeout()});
   if(!channelsResponse.ok)return fail(excluded);
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
   if(!games.length)return fail(excluded);
   if(cache)try{await cache.put(cacheRequest,Response.json(games,{headers:{'Cache-Control':'public,max-age=600'}}))}catch{}
  }
  const choices=games.filter(g=>!excluded.has(g.id));
  if(!choices.length)return fail(excluded);
  const game=choices[Math.floor(Math.random()*choices.length)];
  const side=Math.random()<.5?'white':'black';
  return reply({id:game.id,link:game.link,moves:game.moves,side,elo:side==='white'?game.whiteElo:game.blackElo});
 }catch{return fail(excluded)}
}

// Prefer Chess.com's documented public, read-only monthly game archives.
// Keep the older Lichess loader only as a transparent availability fallback.
export async function onRequestGet({request}){
 const url=new URL(request.url),excluded=new Set((url.searchParams.get('exclude')||'').split(',').slice(0,35));
 try{
  const names=['hikaru','gothamchess','ericrosen','chessbrah'];
  const now=new Date(),first=Math.floor(Math.random()*names.length),monthOffsets=[1,2,3,5,7,10,13,17];
  // Try distinct archived months and players, not one current-month sample.
  for(let attempt=0;attempt<3;attempt++){
   const player=names[(first+attempt)%names.length],monthOffset=monthOffsets[(Math.floor(Math.random()*monthOffsets.length)+attempt)%monthOffsets.length];
   const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-monthOffset,1));
   let monthKey=month.getUTCFullYear()+'/'+String(month.getUTCMonth()+1).padStart(2,'0');
   // Players are not active every month. Use their actual published archive
   // list to select a real month with finished games when available.
   try{
    const archivesResponse=await fetch('https://api.chess.com/pub/player/'+player+'/games/archives',{
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(3200)
    });
    if(archivesResponse.ok){
     const archives=await archivesResponse.json();
     const available=(Array.isArray(archives.archives)?archives.archives:[])
      .map(link=>String(link).match(/\/games\/(\d{4})\/(\d{2})$/)?.slice(1,3).join('/'))
      .filter(Boolean).slice(-18);
     if(available.length)monthKey=available[Math.floor(Math.random()*Math.min(available.length,12))+Math.max(0,available.length-12)];
    }
   }catch{}
   const key=new Request('https://eloscanner.com/__elo_chesscom_games/'+player+'/'+monthKey);
   const cache=typeof caches!=='undefined'?caches.default:null;
   let eligible=null;
   if(cache){try{const hit=await cache.match(key);if(hit)eligible=await hit.json()}catch{}}
   if(!Array.isArray(eligible)){
    const endpoint='https://api.chess.com/pub/player/'+player+'/games/'+monthKey;
    const result=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4500)});
    if(!result.ok)continue;
    const games=await result.json();
    eligible=(Array.isArray(games.games)?games.games:[]).filter(g=>
     g.rated===true&&g.rules==='chess'&&['rapid','blitz','bullet'].includes(g.time_class)&&
     /^https:\/\/www\.chess\.com\/game\/(?:live|daily)\/[0-9]+$/.test(g.url||'')&&
     typeof g.pgn==='string'&&g.pgn.length>=80&&g.pgn.length<22000&&
     Number.isInteger(g.white?.rating)&&Number.isInteger(g.black?.rating)&&
     g.white.rating>=100&&g.white.rating<=4000&&g.black.rating>=100&&g.black.rating<=4000).slice(-180);
    if(cache&&eligible.length)try{await cache.put(key,Response.json(eligible,{headers:{'Cache-Control':'public,max-age=1800'}}))}catch{}
   }
   const choices=eligible.filter(g=>!excluded.has(g.url.split('/').pop()));
   if(!choices.length)continue;
   const game=choices[Math.floor(Math.random()*choices.length)],side=Math.random()<.5?'white':'black';
   return reply({platform:'chesscom',id:game.url.split('/').pop(),link:game.url,pgn:game.pgn,side,elo:game[side].rating});
  }
  throw Error('Chess.com archive unavailable');
 }catch{
  const original=await lichessFallback({request});
  if(!original.ok)return original;
  const result=await original.json();
  return reply({...result,platform:'lichess'});
 }
}
