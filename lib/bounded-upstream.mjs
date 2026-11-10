// Strict resource budget for responses from fixed external providers.
// Content-Length is advisory: enforce the limit while streaming, before
// allocating strings, parsing JSON or writing untrusted content to D1.
export async function readBoundedText(response,maxBytes){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16777216)throw Error('Invalid upstream read limit');
 const lengthHeader=response.headers?.get('Content-Length');
 if(lengthHeader!==null&&/^\d+$/.test(lengthHeader)&&Number(lengthHeader)>maxBytes)throw Error('Upstream response exceeds size limit');
 if(!response.body)return '';
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error('Invalid upstream response chunk');
   size+=value.byteLength;
   if(size>maxBytes){
    await reader.cancel().catch(()=>{});
    throw Error('Upstream response exceeds size limit');
   }
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function readBoundedJSON(response,maxBytes){
 return JSON.parse(await readBoundedText(response,maxBytes));
}
