import {GAME_CATALOG} from '../../arcade-rules.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({params,env}){
 const username=params.username;
 if(typeof username!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(username))return json({error:'Not found'},404);
 if(!env.AUTH_DB||!env.SUS_DB)return json({error:'Records unavailable'},503);
 try{
  const account=await env.AUTH_DB.prepare('SELECT id FROM "user" WHERE lower(username)=lower(?) LIMIT 1').bind(username).first();
  if(!account)return json({error:'Not found'},404);
  const records=[];
  for(const [table,board,modeExpr,modes] of [
   ['arcade_score_entries','arcade','mode',GAME_CATALOG.map(x=>x.id)],
   ['puzzle_score_entries','puzzle',"CASE WHEN mode IN ('sprint3','sprint5') THEN 'sprint' ELSE mode END",['sprint','survival']]
  ]){
   // Rank against the public non-moderated leaderboard; only use verified account IDs.
   const query=`WITH ranked AS (SELECT account_id,source_type,score,${modeExpr} AS mode,ROW_NUMBER() OVER (PARTITION BY ${modeExpr} ORDER BY score DESC,created_at ASC,id ASC) AS rank FROM ${table} e WHERE NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores removed WHERE removed.board=? AND removed.entry_id=e.id)), mine AS (SELECT mode,score,rank,ROW_NUMBER() OVER(PARTITION BY mode ORDER BY rank) AS own_rank FROM ranked WHERE source_type='account' AND account_id=?) SELECT mode,score,rank FROM mine WHERE own_rank=1`;
   const result=await env.SUS_DB.prepare(query).bind(board,account.id).all();
   for(const item of result.results||[])if(modes.includes(item.mode))records.push({mode:item.mode,score:item.score,rank:item.rank});
  }
  return json({username,records});
 }catch{return json({error:'Personal records temporarily unavailable'},503)}
}
