// Fixed global budgets for anonymous game creation. Two rows, no visitor IDs,
// IP addresses or account data. This bounds accepted writes, not edge traffic.
const schemas = new WeakMap();
export async function consumeGameStart(db, game, now = Date.now()) {
  if (!['puzzle', 'knight-maze'].includes(game)) throw Error('Unknown game');
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
