import {rateLimit} from './online/security.mjs';
// Fixed global budgets for anonymous game creation. Two rows, no visitor IDs,
// IP addresses or account data. This bounds accepted writes, not edge traffic.
const schemas = new WeakMap();
export async function consumeGameStart(db, game, now = Date.now()) {
  if (!['puzzle', 'knight-maze', 'arcade'].includes(game)) throw Error('Unknown game');
  if (!schemas.has(db)) {
    schemas.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS game_start_limits (
      game TEXT PRIMARY KEY, minute INTEGER NOT NULL, minute_count INTEGER NOT NULL,
      day INTEGER NOT NULL, day_count INTEGER NOT NULL
    )`).run().catch(error => { schemas.delete(db); throw error; }));
  }
  await schemas.get(db);
  const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
  const row = await db.prepare(`INSERT INTO game_start_limits VALUES (?, ?, 1, ?, 1)
    ON CONFLICT(game) DO UPDATE SET
      minute=excluded.minute, day=excluded.day,
      minute_count=CASE WHEN minute=excluded.minute THEN minute_count+1 ELSE 1 END,
      day_count=CASE WHEN day=excluded.day THEN day_count+1 ELSE 1 END
    WHERE (minute!=excluded.minute OR minute_count<60)
      AND (day!=excluded.day OR day_count<3000)
    RETURNING game`).bind(game, minute, day).first();
  return !!row;
}

// Layer a per-source budget over the existing global capacity limit so one
// scripted client cannot starve everyone else of the daily game allowance.
// Existing anonymous games remain playable if the optional AUTH_DB binding is
// unavailable: consumeGameStart still enforces the global abuse ceiling.
export async function allowGameStartSource(env,request,game){
 if(!['puzzle','knight-maze','arcade'].includes(game))throw Error('Unknown game');
 if(!env.AUTH_DB||typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return true;
 try{
  const minute=await rateLimit(env,request,'game-start-'+game+'-minute',12,60000);
  if(!minute)return false;
  return await rateLimit(env,request,'game-start-'+game+'-day',180,86400000);
 }catch{return false}
}
