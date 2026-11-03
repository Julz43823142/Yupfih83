// Public puzzle proxy for EloScanner on Cloudflare Pages.
// Never stores game progress or private user information.
const upstream="https://lichess.org/api/puzzle/";
export async function onRequestGet({request}){
 const url=new URL(request.url),type=url.searchParams.get("mode")==="daily"?"daily":"next";
 const desired=Number(url.searchParams.get("target"));
 const difficulty=Number.isFinite(desired)&&desired>0?(desired<900?"easiest":desired<1300?"easier":desired<1750?"normal":desired<2200?"harder":"hardest"):null;
 const endpoint=new URL(upstream+type);
 if(type==="next"&&difficulty)endpoint.searchParams.set("difficulty",difficulty);
 const options={headers:{"Accept":"application/json","User-Agent":"EloScanner-Puzzles/1.0 (https://eloscanner.com/)"}};
 try{
  const res=await fetch(endpoint.toString(),options);
  if(!res.ok)return Response.json({error:"Puzzle provider is unavailable (HTTP "+res.status+"). Please retry."},{status:503,headers:{"Cache-Control":"no-store"}});
  const json=await res.json();
  if(!json?.puzzle||typeof json?.game?.pgn!=="string"||!Array.isArray(json.puzzle.solution))
   throw new Error("Invalid puzzle data");
  const answer={game:{pgn:json.game.pgn},puzzle:{
   id:String(json.puzzle.id||""),initialPly:Number(json.puzzle.initialPly||0),
   fen:typeof json.puzzle.fen==="string"?json.puzzle.fen:null,
   lastMove:typeof json.puzzle.lastMove==="string"?json.puzzle.lastMove:null,
   rating:Number(json.puzzle.rating||0),solution:json.puzzle.solution.slice(0,24)
  },source:"Lichess"};
  return Response.json(answer,{headers:{
   "Cache-Control":type==="daily"?"public, max-age=120, s-maxage=3600":"no-store",
   "Access-Control-Allow-Origin":"https://eloscanner.com"
  }});
 }catch(e){return Response.json({error:"Could not load a puzzle. Please try again."},{status:503,headers:{"Cache-Control":"no-store"}})}
}
