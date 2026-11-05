// Dedicated Cloudflare Worker Durable Object, bound to Pages as ONLINE_ROOM.
// The public Worker entrypoint deliberately exposes no game room endpoint.
// Only authenticated Pages Functions may reach this class through the binding.
export default {
 async fetch(){return new Response('Not found',{status:404})}
};

const publicFields=['id','kind','status','white','black','fen','moves','turn','whiteMs','blackMs','lastMoveAt','updatedAt','result','serverTime'];

export class OnlineChessRoom {
 constructor(state){this.state=state}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/connect'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
   const side=request.headers.get('X-Authorized-Side');
   if(side!=='w'&&side!=='b')return new Response('Forbidden',{status:403});
   // Bound the number of idle sockets per player, including abandoned tabs.
   const sockets=this.state.getWebSockets();
   if(sockets.filter(ws=>ws.deserializeAttachment()?.side===side).length>=3||sockets.length>=6)
    return new Response('Too many connections',{status:429});
   const pair=new WebSocketPair();
   const [client,server]=Object.values(pair);
   this.state.acceptWebSocket(server);
   server.serializeAttachment({side});
   return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'elo-chess-v1'}});
  }
  if(url.pathname==='/notify'&&request.method==='POST'){
   const body=await request.json().catch(()=>null);
   if(!body||typeof body!=='object'||!Array.isArray(body.moves)||typeof body.fen!=='string'||typeof body.id!=='string')
    return new Response('Invalid game state',{status:400});
   // Explicit allowlist: the room cannot relay IPs, seat tokens, cookies or account ids.
   const game=Object.fromEntries(publicFields.filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
   const message=JSON.stringify({type:'state',game});
   for(const socket of this.state.getWebSockets()){
    try{socket.send(message)}catch{try{socket.close(1011,'Delivery error')}catch{}}
   }
   return new Response(null,{status:204});
  }
  return new Response('Not found',{status:404});
 }
 async webSocketMessage(socket){
  // Clients never submit moves on this channel: all moves use authorized POST /move.
  try{socket.close(1008,'Read-only game updates')}catch{}
 }
 async webSocketClose(socket,code,reason){try{socket.close(code,reason)}catch{}}
 async webSocketError(socket){try{socket.close(1011,'Connection error')}catch{}}
}
