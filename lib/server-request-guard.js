// Shared, bounded parser for the public JSON endpoints.
// Origin checks reduce cross-site browser abuse; Cloudflare WAF/rate limits
// are still required for abusive non-browser traffic.
export async function readJsonPayload(request,maxBytes=2048){
 const contentType=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(contentType!=='application/json')return {status:415,error:'Content-Type must be application/json.'};
 const origin=request.headers.get('origin');
 if(origin){
  let sameOrigin=false;
  try{sameOrigin=new URL(origin).origin===new URL(request.url).origin}catch{}
  if(!sameOrigin)return {status:403,error:'Cross-origin requests are not permitted.'};
 }
 if(request.headers.get('sec-fetch-site')==='cross-site')return {status:403,error:'Cross-site requests are not permitted.'};
 const declared=Number(request.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)return {status:413,error:'Request body too large.'};
 if(!request.body)return {status:400,error:'JSON request body required.'};
 const reader=request.body.getReader();
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){
    void reader.cancel().catch(()=>{});
    return {status:413,error:'Request body too large.'};
   }
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!data||typeof data!=='object'||Array.isArray(data))return {status:400,error:'JSON object required.'};
  return {data};
 }catch{
  return {status:400,error:'Invalid JSON request.'};
 }finally{reader.releaseLock()}
}
