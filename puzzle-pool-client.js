// Optional 500,000-puzzle Lichess CC0 bank. No full-bank download in browsers.
export function createPuzzlePool(){
 let manifestPromise=null;
 const loaded=new Map();
 async function manifest(){
  if(!manifestPromise){
   manifestPromise=fetch('/assets/puzzle-pool/manifest.json?v=1',{cache:'force-cache'})
    .then(async response=>{
     if(!response.ok)return null;
     const data=await response.json();
     return data?.version===1&&data.total===500000&&Array.isArray(data.shards)&&data.shards.length?data:null;
    }).catch(()=>null);
  }
  return manifestPromise;
 }
 async function shard(id){
  if(loaded.has(id))return loaded.get(id);
  const promise=fetch('/assets/puzzle-pool/'+String(id).padStart(4,'0')+'.json?v=1',{cache:'force-cache'})
   .then(async response=>{
    if(!response.ok)throw Error('Puzzle shard unavailable');
    const rows=await response.json();
    if(!Array.isArray(rows))throw Error('Invalid shard');
    return rows;
   });
  loaded.set(id,promise);
  if(loaded.size>10)loaded.delete(loaded.keys().next().value);
  try{return await promise}catch(e){loaded.delete(id);throw e}
 }
 async function pick(which,target,{seen,seenPositions,recentSet,ratingFloor}){
  const index=await manifest();
  if(!index)return null;
  const desired=Number.isFinite(target)&&target>=100?Math.min(3500,target):null;
  const floor=which==='sprint'||which==='survival'?ratingFloor:0;
  let shards=index.shards.filter(item=>item.max>=floor);
  if(desired!==null){
   const nearby=shards.filter(item=>item.max>=desired-260&&item.min<=desired+260);
   if(nearby.length)shards=nearby;
   else{
    shards.sort((a,b)=>Math.max(a.min-desired,desired-a.max,0)-Math.max(b.min-desired,desired-b.max,0));
    shards=shards.slice(0,25);
   }
  }else if(which==='random'){
   const bands=[...new Set(shards.map(item=>item.band))];
   if(bands.length){
    const band=bands[Math.floor(Math.random()*bands.length)];
    shards=shards.filter(item=>item.band===band);
   }
  }
  const tried=new Set();
  for(let attempt=0;attempt<Math.min(7,shards.length);attempt++){
   const choices=shards.filter(item=>!tried.has(item.id));
   if(!choices.length)break;
   const total=choices.reduce((sum,item)=>sum+item.count,0);
   let ticket=Math.random()*total,selected=choices[choices.length-1];
   for(const item of choices){ticket-=item.count;if(ticket<0){selected=item;break}}
   tried.add(selected.id);
   let rows;
   try{rows=await shard(selected.id)}catch{continue}
   let candidates=rows.filter(row=>!seen.has(String(row[0]))&&!recentSet.has(String(row[0]))&&
    !seenPositions.has(row[1]+'|'+String(row[2]).split(' ')[0])&&row[3]>=floor);
   if(desired!==null&&candidates.length){
    const competitive=which==='sprint'||which==='survival';
    const minimum=competitive?Math.max(floor,desired-35):Math.max(400,desired-200);
    let close=candidates.filter(row=>row[3]>=minimum&&(competitive||row[3]<=desired+200));
    if(!close.length)close=candidates.filter(row=>Math.abs(row[3]-desired)<=350);
    if(close.length)candidates=close;
   }
   for(let tries=0;tries<Math.min(12,candidates.length);tries++){
    const row=candidates.splice(Math.floor(Math.random()*candidates.length),1)[0];
    if(row&&row.length===4&&typeof row[0]==='string')return {row,shard:selected.id};
   }
  }
  return null;
 }
 return {pick};
}
