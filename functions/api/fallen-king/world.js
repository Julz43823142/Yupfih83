import { requireAdmin, adminHeaders } from '../../../lib/auth/admin-access.mjs';

// The playable world is returned only after a fresh server-side admin role check.
export async function onRequestGet({request,env}) {
  const access=await requireAdmin({request,env});
  if(access instanceof Response)return access;
  const width=52,height=40;
  const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>{
    const n=(x*37+y*67+x*y*13)%29;
    return n===0?'f':n===1?'g':'.';
  }));
  const fill=(x,y,w,h,t)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(i>=0&&j>=0&&i<width&&j<height)rows[j][i]=t;};
  // Forest perimeter, pond, village square, paths and fenced gardens.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<2||y<2||x>=width-2||y>=height-2)rows[y][x]='T';
  fill(3,3,11,8,'T');fill(6,6,5,3,'w');fill(15,3,6,5,'T');fill(38,3,11,9,'T');
  fill(3,28,12,9,'T');fill(38,30,11,7,'T');fill(23,33,9,4,'T');
  fill(2,18,48,3,'p');fill(24,3,4,34,'p');fill(8,11,36,2,'p');
  fill(8,20,3,13,'p');fill(40,12,3,19,'p');fill(15,25,29,2,'p');
  fill(20,15,13,12,'s');fill(24,12,4,22,'p');
  fill(23,17,7,1,'s');fill(23,22,7,1,'s');
  fill(26,19,1,3,'s');rows[20][26]='F';
  const houses=[
    {x:12,y:14,w:6,h:4,roof:'red',name:'The Bakery'},
    {x:34,y:14,w:6,h:4,roof:'blue',name:'Village Library'},
    {x:13,y:23,w:6,h:4,roof:'orange',name:'The Inn'},
    {x:33,y:23,w:6,h:4,roof:'purple',name:'The Workshop'},
    {x:21,y:5,w:10,h:5,roof:'navy',name:'Town Hall'}
  ];
  for(const h of houses)fill(h.x,h.y,h.w,h.h,'H');
  // A door tile in front of each building.
  for(const h of houses){const dx=h.x+Math.floor(h.w/2);rows[h.y+h.h-1][dx]='D';rows[h.y+h.h][dx]='p';}
  const npcs=[
    {id:'pip',x:28,y:21,piece:'P',color:'white',name:'Pip',lines:['Hello! Welcome to our village.','The bakery is on the west side of the square.']},
    {id:'baker',x:17,y:19,piece:'P',color:'white',name:'Baker Bea',lines:['Fresh bread, every morning!','We do not have a shop menu yet. Come back later.']},
    {id:'guard',x:29,y:11,piece:'R',color:'white',name:'Guard Rowan',lines:['The village is peaceful today.','Please mind the trees near the north road.']},
    {id:'scholar',x:37,y:19,piece:'B',color:'black',name:'Scholar Vesper',lines:['Every chess piece has a place in this world.','Even a king without a crown.']},
    {id:'courier',x:16,y:28,piece:'N',color:'white',name:'Courier Nox',lines:['I travel between villages.','These roads lead beyond the village, but that area is not ready yet.']},
    {id:'gardener',x:9,y:24,piece:'P',color:'black',name:'Gardener Moss',lines:['These flowers take patience.','Watch your step near the pond.']}
  ];
  return Response.json({width,height,tiles:rows.map(r=>r.join('')),houses,npcs,spawn:{x:26,y:29},version:2},{headers:adminHeaders});
}
