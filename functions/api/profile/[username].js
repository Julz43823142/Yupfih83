// Public, intentionally minimal profile metadata. No email, user ID or sessions.
export async function onRequestGet({params,env}) {
 const name=params.username;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(typeof name!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(name))return Response.json({message:'Not found'},{status:404,headers});
 if(!env.AUTH_DB)return Response.json({message:'Profiles unavailable'},{status:503,headers});
 try {
  const row=await env.AUTH_DB.prepare('SELECT u.username, u.createdAt, COALESCE(r.role, \'member\') AS role FROM "user" u LEFT JOIN auth_member_role r ON r.userId=u.id WHERE lower(u.username)=lower(?) LIMIT 1').bind(name).first();
  if(!row)return Response.json({message:'Profile not found'},{status:404,headers});
  return Response.json({username:row.username,joinedAt:row.createdAt,role:row.role==='admin'?'admin':'member'},{headers});
 }catch{return Response.json({message:'Profiles unavailable'},{status:503,headers});}
}
