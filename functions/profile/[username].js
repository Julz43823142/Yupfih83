// Render a public profile at /profile/<username> without exposing private auth data.
export async function onRequestGet({request,params,env}) {
 const name=params.username;
 if(typeof name!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(name))return new Response('Profile not found',{status:404});
 const url=new URL('/profile.html',request.url);
 const response=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store');
 headers.set('X-Robots-Tag','noindex');
 return new Response(response.body,{status:response.status,headers});
}
