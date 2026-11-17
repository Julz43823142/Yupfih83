import {readBoundedJSON} from '../../lib/bounded-upstream.mjs';

// Guess the Elo uses genuine, publicly archived, rated Chess.com games only.
// Never substitute Lichess games or invented ratings when Chess.com is down.
const reply=(body,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
const API='https://api.chess.com/pub/player/';
const USER_AGENT='EloScanner-GuessTheElo/2.0 (https://eloscanner.com)';
const PLAYERS=['hikaru','gothamchess','ericrosen','chessbrah','penguingm1','anna_cramling','danielnaroditsky','chessnetwork'];
const GAME_URL=/^https:\/\/www\.chess\.com\/game\/(?:live|daily)\/[0-9]+$/;
const ID=/^[0-9]{6,20}$/;
const MONTH=/\/games\/(\d{4})\/(0[1-9]|1[0-2])$/;
const GAME_LIMIT=160;
const timeout=ms=>AbortSignal.timeout(ms);
const headers={Accept:'application/json','User-Agent':USER_AGENT};
function excludeIds(request){
 const list=new URL(request.url).searchParams.get('exclude')||'';
 return new Set(list.split(',').slice(0,40).filter(x=>ID.test(x)));
}
function eligibleGame(g){
 if(!g||g.rated!==true||g.rules!=='chess'||!['rapid','blitz','bullet'].includes(g.time_class))return false;
 if(!GAME_URL.test(g.url||'')||!ID.test(g.url.split('/').pop()))return false;
 if(typeof g.pgn!=='string'||g.pgn.length<100||g.pgn.length>22000)return false;
 const white=g.white?.rating,black=g.black?.rating;
 return Number.isInteger(white)&&white>=100&&white<=4000&&Number.isInteger(black)&&black>=100&&black<=4000;
}
function compact(g){
 return {id:g.url.split('/').pop(),link:g.url,pgn:g.pgn,
  whiteElo:g.white.rating,blackElo:g.black.rating};
}
function pick(games,excluded){
 const choices=games.filter(g=>g&&ID.test(String(g.id))&&GAME_URL.test(g.link||'')&&
  typeof g.pgn==='string'&&Number.isInteger(g.whiteElo)&&Number.isInteger(g.blackElo)&&
  !excluded.has(String(g.id)));
 if(!choices.length)return null;
 const game=choices[Math.floor(Math.random()*choices.length)];
 const side=Math.random()<.5?'white':'black';
 return {platform:'chesscom',id:game.id,link:game.link,pgn:game.pgn,
  side,elo:side==='white'?game.whiteElo:game.blackElo};
}
async function readCache(cache,key){
 if(!cache)return null;
 try{const hit=await cache.match(key);return hit?await hit.json():null}catch{return null}
}
async function saveCache(cache,key,value,seconds){
 if(!cache)return;
 try{await cache.put(key,Response.json(value,{headers:{'Cache-Control':'public,max-age='+seconds}}))}catch{}
}
async function chesscomJSON(url,ms,size){
 const response=await fetch(url,{headers,signal:timeout(ms)});
 if(!response.ok)throw Error('Chess.com returned '+response.status);
 return readBoundedJSON(response,size);
}
async function playerMonths(player,cache){
 const key=new Request('https://eloscanner.com/__guess_elo_archives_v3/'+player);
 let months=await readCache(cache,key);
 if(Array.isArray(months)&&months.length)return months;
 const data=await chesscomJSON(API+player+'/games/archives',4000,256*1024);
 months=(Array.isArray(data.archives)?data.archives:[])
   .map(link=>String(link).match(MONTH)?.slice(1,3).join('/'))
   .filter(Boolean);
 if(!months.length)throw Error('No published Chess.com archives');
 // Prefer recent online games without assuming a player played in every month.
 months=months.slice(-36);
 await saveCache(cache,key,months,3600);
 return months;
}
async function monthGames(player,month,cache){
 const key=new Request('https://eloscanner.com/__guess_elo_month_v3/'+player+'/'+month);
 const cached=await readCache(cache,key);
 if(Array.isArray(cached))return cached;
 const data=await chesscomJSON(API+player+'/games/'+month,6500,8*1024*1024);
 const games=(Array.isArray(data.games)?data.games:[])
  .filter(eligibleGame).slice(-GAME_LIMIT).map(compact);
 if(games.length)await saveCache(cache,key,games,1800);
 return games;
}
export async function onRequestGet({request}){
 const excluded=excludeIds(request);
 const cache=typeof caches!=='undefined'?caches.default:null;
 const poolKey=new Request('https://eloscanner.com/__guess_elo_verified_chesscom_pool_v3');
 // A warm server cache supplies a different verified game without an upstream
 // round trip, even when the Chess.com API is temporarily rate-limited.
 const cachedPool=await readCache(cache,poolKey);
 const fromPool=Array.isArray(cachedPool)?pick(cachedPool,excluded):null;
 if(fromPool)return reply(fromPool);
 const start=Math.floor(Math.random()*PLAYERS.length);
 const candidates=PLAYERS.slice(start).concat(PLAYERS.slice(0,start));
 const gathered=[];
 // Limit upstream requests, retain a large reusable pool, and continue across
 // players/months on 403, 429, timeouts, or empty rated archives.
 for(const player of candidates){
  try{
   const months=await playerMonths(player,cache);
   const offset=Math.floor(Math.random()*Math.min(months.length,18));
   for(let attempt=0;attempt<Math.min(3,months.length);attempt++){
    const month=months[months.length-1-((offset+attempt*7)%Math.min(months.length,24))];
    const games=await monthGames(player,month,cache);
    if(games.length)gathered.push(...games);
    const chosen=pick(gathered,excluded);
    if(chosen){
     // Cache the real full PGNs: no fake offline games and no reliance on
     // per-visitor API access. Cached entries retain their Chess.com URLs.
     await saveCache(cache,poolKey,[...(Array.isArray(cachedPool)?cachedPool:[]),...gathered].slice(-600),600);
     return reply(chosen);
    }
   }
  }catch{} // Another verified Chess.com player may still have public games.
 }
 return reply({error:'Chess.com games are temporarily unavailable. Try again shortly.'},503);
}
