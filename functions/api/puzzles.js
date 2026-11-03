// Rate-limit-aware public puzzle pool for EloScanner (Cloudflare Pages).
// Share cached puzzles across visitors instead of requesting Lichess on every move.
const reply=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function init(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS puzzle_pool (id TEXT PRIMARY KEY, rating INTEGER, json TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS puzzle_pool_rating ON puzzle_pool(rating)").run();
}
function shape(json){
 if(!json?.puzzle||typeof json?.game?.pgn!=="string"||!Array.isArray(json.puzzle.solution)||!json.puzzle.solution.length)return null;
 return {game:{pgn:json.game.pgn},puzzle:{
  id:String(json.puzzle.id||""),initialPly:Number(json.puzzle.initialPly||0),
  fen:typeof json.puzzle.fen==="string"?json.puzzle.fen:null,
  lastMove:typeof json.puzzle.lastMove==="string"?json.puzzle.lastMove:null,
  rating:Number(json.puzzle.rating||0),solution:json.puzzle.solution.slice(0,24)
 },source:"Lichess"};
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),daily=url.searchParams.get("mode")==="daily";
 const target=Number(url.searchParams.get("target"));
 const desired=Number.isFinite(target)&&target>=100&&target<=4000?target:null;
 const difficulty=desired===null?null:desired<900?"easiest":desired<1300?"easier":desired<1750?"normal":desired<2200?"harder":"hardest";
 let db=env.SUS_DB||null;
 if(db){try{await init(db)}catch{db=null}}
 // Most puzzles should come from our own shared, rotating pool, not Lichess.
 // Occasionally refill it; no rapid 3x-per-visitor polling.
 if(!daily&&db){
  try{
   const count=await db.prepare("SELECT COUNT(*) n FROM puzzle_pool").first();
   if(Number(count?.n||0)>0){
    const shouldRefill=Number(count.n)<12||Math.random()<.06;
    if(!shouldRefill){
     const exclude=(url.searchParams.get("exclude")||"").slice(0,150);
     const query=desired!==null?
      "SELECT json FROM puzzle_pool WHERE id != ? ORDER BY ABS(rating-?) ASC, RANDOM() LIMIT 1":
      "SELECT json FROM puzzle_pool WHERE id != ? ORDER BY RANDOM() LIMIT 1";
     let row=await db.prepare(query).bind(...(desired!==null?[exclude,desired]:[exclude])).first();
     if(!row)row=await db.prepare("SELECT json FROM puzzle_pool ORDER BY RANDOM() LIMIT 1").first();
     if(row)return reply(JSON.parse(row.json));
    }
   }
  }catch{}
 }
 const type=daily?"daily":"next",endpoint=new URL("https://lichess.org/api/puzzle/"+type);
 if(!daily&&difficulty)endpoint.searchParams.set("difficulty",difficulty);
 const cache=typeof caches!=="undefined"?caches.default:null;
 const cacheRequest=new Request("https://eloscanner.com/__puzzle_cache/"+type+(difficulty?"-"+difficulty:""));
 if(daily&&cache){try{const hit=await cache.match(cacheRequest);if(hit)return hit}catch{}}
 try{
  const upstream=await fetch(endpoint.toString(),{headers:{"Accept":"application/json","User-Agent":"EloScanner/1.0"}});
  if(!upstream.ok)throw Error("HTTP "+upstream.status);
  const data=shape(await upstream.json());
  if(!data)throw Error("Puzzle format unavailable");
  if(db){
   try{
    await db.prepare("INSERT OR REPLACE INTO puzzle_pool(id,rating,json,created_at) VALUES(?,?,?,?)").bind(data.puzzle.id,data.puzzle.rating,JSON.stringify(data),Math.floor(Date.now()/1000)).run();
    // Bound the shared cache so the D1 table doesn't grow indefinitely.
    await db.prepare("DELETE FROM puzzle_pool WHERE id NOT IN (SELECT id FROM puzzle_pool ORDER BY created_at DESC LIMIT 600)").run();
   }catch{}
  }
  if(daily&&cache){try{await cache.put(cacheRequest,new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json","Cache-Control":"public,max-age=21600"}}))}catch{}}
  return reply(data);
 }catch{
  if(db){
   try{
    const exclude=(url.searchParams.get("exclude")||"").slice(0,150);
    const query=desired!==null?
     "SELECT json FROM puzzle_pool WHERE id != ? ORDER BY ABS(rating-?) ASC,RANDOM() LIMIT 1":
     "SELECT json FROM puzzle_pool WHERE id != ? ORDER BY RANDOM() LIMIT 1";
    let row=await db.prepare(query).bind(...(desired!==null?[exclude,desired]:[exclude])).first();
    if(!row)row=await db.prepare("SELECT json FROM puzzle_pool ORDER BY RANDOM() LIMIT 1").first();
    if(row)return reply({...JSON.parse(row.json),cached:true});
   }catch{}
  }
  return reply({error:"Puzzle source is temporarily rate-limited. Please try again in a moment."},503);
 }
}
