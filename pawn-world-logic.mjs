// Deterministic, testable geometry and hazards for EloScanner's original Pawn Dash.
export function createPawnDashModel(seed){
 let hash=2166136261;
 for(const c of String(seed))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const random=n=>{
  let x=(hash^Math.imul(n+19,2654435761))>>>0;
  x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;
  x=Math.imul(x,3266489909);x^=x>>>16;
  return x/4294967296;
 };
 const lane=row=>{
  if(row<=1||row%6===0)return 'meadow';
  if(row%9===7)return 'river';
  if(row%5===0)return 'court';
  return 'road';
 };
 const bridgeStart=row=>Math.floor(random(row*67+13)*6); // 0..5, three adjoining bridge squares.
 const isBridge=(row,x)=>x>=bridgeStart(row)&&x<bridgeStart(row)+3;
 const enemyCount=row=>lane(row)==='court'?3:lane(row)==='road'?2:0;
 const enemyX=(row,index,time)=>{
  const speed=(0.88+random(row*31+index*7)*.65)*(random(row*19+1)>.5?1:-1);
  const gap=enemyCount(row)===3?3.3:4.2;
  const span=16;
  const phase=random(row*71+6)*span+index*gap;
  return ((phase+speed*time)%span+span)%span-3.5;
 };
 const collision=(x,row,time)=>{
  const type=lane(row);
  if(type==='river')return !isBridge(row,x);
  for(let k=0;k<enemyCount(row);k++)
   if(Math.abs(enemyX(row,k,time)-x)<.52)return true;
  return false;
 };
 return {random,lane,bridgeStart,isBridge,enemyCount,enemyX,collision};
}
