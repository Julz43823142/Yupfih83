// Public directory: usernames and join dates only. Never expose email, IDs, sessions or activity.
export async function onRequestGet({env}) {
 const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
 if(!env.AUTH_DB)return Response.json({message:'Member directory unavailable.'},{status:503,headers});
 try{
  const rows=await env.AUTH_DB.prepare('SELECT username, createdAt FROM "user" WHERE username IS NOT NULL ORDER BY createdAt DESC LIMIT 100').all();
  const count=await env.AUTH_DB.prepare('SELECT COUNT(*) AS total FROM "user" WHERE username IS NOT NULL').first();
  return Response.json({members:(rows.results||[]).map(row=>({username:row.username,joinedAt:row.createdAt})),total:count?.total||0},{headers});
 }catch{return Response.json({message:'Member directory unavailable.'},{status:503,headers});}
}
