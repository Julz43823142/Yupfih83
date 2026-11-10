// Deterministic chess crossing rules, shared by collision, rendering, and tests.
// The difficulty tier belongs to the world row, so walking backwards never rerolls a lane.
export function createPawnDashModel(seed){
 let hash=2166136261;
 for(const c of String(seed))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const random=n=>{
  let x=(hash^Math.imul(n+19,2654435761))>>>0;
  x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;
  x=Math.imul(x,3266489909);x^=x>>>16;
  return (x>>>0)/4294967296;
 };
 const difficulty=row=>row>=750?3:row>=500?2:row>=100?1:0;
 const lane=row=>{
  // A readable rhythm of safe meadow, stone avenues, battlements and bridges.
  if(row<=1||row%6===0)return 'meadow';
  if(row%9===7)return 'river';
  if(row%5===0)return 'court';
  return 'road';
 };
 const bridgeStart=row=>Math.floor(random(row*67+13)*6);
 const isBridge=(row,x)=>x>=bridgeStart(row)&&x<bridgeStart(row)+3;
 const enemyCount=row=>{
  const kind=lane(row),tier=difficulty(row);
  if(kind==='meadow'||kind==='river')return 0;
  // Early game deliberately easier than before. New obstacle pressure starts at milestones.
  return kind==='court'?Math.min(4,2+Math.floor(tier/2)):Math.min(4,1+tier);
 };
 const enemyKind=(row,index)=>{
  const pieces=['pawn','knight','rook','bishop','queen'];
  const tier=difficulty(row);
  const pool=tier===0?4:5;
  return pieces[Math.floor(random(row*53+index*139+7)*pool)];
 };
 const enemyX=(row,index,time)=>{
  const tier=difficulty(row);
  const speed=(.54+random(row*31+index*7)*.48+tier*.14)*(random(row*19+1)>.5?1:-1);
  const count=enemyCount(row);
  const gap=count===1?0:count===2?5.4:count===3?3.8:2.8;
  const span=18;
  const phase=random(row*71+6)*span+index*gap;
  return ((phase+speed*time)%span+span)%span-4.5;
 };
 const enemyRadius=(row,index)=>{
  const kind=enemyKind(row,index);
  return kind==='rook'||kind==='queen'?.49:.42;
 };
 const collision=(x,row,time)=>{
  const type=lane(row);
  if(type==='river')return !isBridge(row,x);
  for(let k=0;k<enemyCount(row);k++)
   if(Math.abs(enemyX(row,k,time)-x)<enemyRadius(row,k))return true;
  return false;
 };
 return {random,difficulty,lane,bridgeStart,isBridge,enemyCount,enemyKind,enemyX,enemyRadius,collision};
}
