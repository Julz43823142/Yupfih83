import {GAME_CATALOG} from '../../../arcade-rules.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
// A public profile only displays scores already tied to an authenticated account ID.
// Never infer score ownership from matching nicknames.
export async function onRequestGet({params,env}){
 const username=params.username;
 if(typeof username!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(username))return json({error:'Not found'},404);
 if(!env.AUTH_DB||!env.SUS_DB)return json({error:'Records unavailable'},503);
 try{
  const account=await env.AUTH_DB.prepare('SELECT id FROM "user" WHERE lower(username)=lower(?) LIMIT 1').bind(username).first();
  if(!account)return json({error:'Not found'},404);
  const records=[];
  const catalogs=[
   ['arcade_score_entries','arcade',GAME_CATALOG.map(x=>x.id).filter(id=>id!=='knight-maze')],
   ['knight_maze_score_entries','maze',['knight-maze']],
   ['puzzle_score_entries','puzzle',['sprint','survival']]
  ];
  for(const [table,board,modes] of catalogs){
   const modeOf=alias=>board==='maze'?"'knight-maze'":board==='puzzle'
    ?`CASE WHEN ${alias}.mode IN ('sprint3','sprint5') THEN 'sprint' ELSE ${alias}.mode END`
    :`${alias}.mode`;
   const allowed=alias=>board==='puzzle'?`AND ${alias}.mode IN ('sprint3','sprint5','survival')`:'';
   // Find personal bests FIRST. Ranking all users with a window function on
   // every profile request was costly; the correlated count needs no global sort.
   const query=`WITH owned AS (
     SELECT ${modeOf('e')} AS mode,e.score,e.created_at AS createdAt,e.id,
       ROW_NUMBER() OVER(PARTITION BY ${modeOf('e')} ORDER BY e.score DESC,e.created_at ASC,e.id ASC) AS own_order
     FROM ${table} e
     WHERE e.account_id=? AND e.source_type='account' ${allowed('e')}
       AND NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores removed WHERE removed.board=? AND removed.entry_id=e.id)
    ), best AS (SELECT mode,score,createdAt,id FROM owned WHERE own_order=1)
    SELECT best.mode,best.score,
       (SELECT COUNT(*)+1 FROM ${table} other
        WHERE ${modeOf('other')}=best.mode ${allowed('other')}
          AND (other.score>best.score OR (other.score=best.score AND
            (other.created_at<best.createdAt OR (other.created_at=best.createdAt AND other.id<best.id))))
          AND NOT EXISTS(SELECT 1 FROM leaderboard_removed_scores removed WHERE removed.board=? AND removed.entry_id=other.id)
       ) AS rank
    FROM best`;
   let result;
   try{result=await env.SUS_DB.prepare(query).bind(account.id,board,board).all()}
   catch(error){if(/no such table/i.test(String(error)))continue;throw error}
   for(const item of result.results||[])if(modes.includes(item.mode))records.push({mode:item.mode,score:item.score,rank:item.rank});
  }
  return json({username,records});
 }catch{return json({error:'Personal records temporarily unavailable'},503)}
}
