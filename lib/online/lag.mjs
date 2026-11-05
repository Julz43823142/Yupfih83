// 3+0 unrated transport allowance. Client RTT is only a hint: never trust it
// as proof of real network latency. The server enforces both independent caps.
// A player can receive at most 1.2 seconds of total allowance in a game,
// even when they deliberately delay or forge network measurements.
export const MAX_LAG_PER_MOVE_MS=80;
export const MAX_LAG_PER_GAME_MS=1200;
export function lagCredit(elapsed,remainingBudget,claimedRtt){
 if(!Number.isFinite(elapsed)||elapsed<=0||!Number.isFinite(remainingBudget)||remainingBudget<=0)return 0;
 if(!Number.isFinite(claimedRtt)||claimedRtt<0||claimedRtt>2000)return 0;
 return Math.min(Math.floor(elapsed),Math.max(0,Math.floor(remainingBudget)),
   MAX_LAG_PER_MOVE_MS,Math.floor(claimedRtt/2));
}
export function lagGrace(used){
 return Number.isFinite(used)&&used<MAX_LAG_PER_GAME_MS?MAX_LAG_PER_MOVE_MS:0;
}
