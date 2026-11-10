import { requireAdmin, adminHeaders, adminReply } from '../../../lib/auth/admin-access.mjs';
import { boards, ensureModerationTable, findScores, removeScore } from '../../../lib/leaderboard-moderation.mjs';
const reply = (data,status=200) => Response.json(data,{status,headers:adminHeaders});
function select(request) {
  const url = new URL(request.url),board = url.searchParams.get('board');
  return { url, board };
}
export async function onRequestGet({request,env}) {
  const access = await requireAdmin({request,env});
  if(access instanceof Response)return access;
  if(!env.SUS_DB)return adminReply('Leaderboard database unavailable.',503);
  const {url,board}=select(request);
  if(!boards[board])return adminReply('Invalid leaderboard.',400);
  const search=(url.searchParams.get('search')||'').trim();
  const rawPage=url.searchParams.get('page')||'0';
  if(search.length>24 || (search&&!/^[A-Za-z0-9 _-]+$/.test(search)) ||
    !/^(0|[1-9][0-9]{0,3})$/.test(rawPage))return adminReply('Invalid filters.',400);
  const page=Number(rawPage);
  if(page>1000)return adminReply('Invalid page.',400);
  try{
    await ensureModerationTable(env.SUS_DB);
    return reply(await findScores(env.SUS_DB,board,search,page));
  }catch{return adminReply('Leaderboard lookup unavailable.',503)}
}
export async function onRequestPost({request,env}) {
  // Require an explicit same-origin browser request even when Fetch Metadata is absent.
  if(request.headers.get('Origin')!==new URL(request.url).origin ||
     request.headers.get('Sec-Fetch-Site')==='cross-site')return adminReply('Forbidden.',403);
  const access=await requireAdmin({request,env});
  if(access instanceof Response)return access;
  if(!env.SUS_DB)return adminReply('Leaderboard database unavailable.',503);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json') ||
     Number(request.headers.get('Content-Length')||0)>1024)return adminReply('Invalid request.',400);
  let data;
  try{
    const raw=await request.text();
    if(raw.length>1024)return adminReply('Invalid request.',400);
    data=JSON.parse(raw);
  }catch{return adminReply('Invalid request.',400)}
  if(!data||typeof data!=='object'||Array.isArray(data) ||
    !boards[data.board]||!Number.isSafeInteger(data.id)||data.id<1 ||
    typeof data.confirm!=='string'||data.confirm!=='REMOVE')return adminReply('Invalid removal request.',400);
  try{
    await ensureModerationTable(env.SUS_DB);
    const removed=await removeScore(env.SUS_DB,data.board,data.id);
    if(!removed)return adminReply('Score not found.',404);
    return reply({ok:true});
  }catch{return adminReply('Score moderation unavailable.',503)}
}
