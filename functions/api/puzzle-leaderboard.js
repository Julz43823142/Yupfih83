// Retired: remove public voting, identifier storage, and IP-based review quotas.
const gone=()=>Response.json({error:"This endpoint has been retired for privacy."},{status:410,headers:{"Cache-Control":"no-store"}});
export const onRequestGet=gone;
export const onRequestPost=gone;
export const onRequestDelete=gone;
