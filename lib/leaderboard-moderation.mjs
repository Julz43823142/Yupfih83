// Shared, server-enforced tombstones: a legacy backfill cannot resurrect removed scores.
export const boards = Object.freeze({
  puzzle: { table: 'puzzle_score_entries', mode: true },
  maze: { table: 'knight_maze_score_entries', mode: false }
});
export async function ensureModerationTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS leaderboard_removed_scores (board TEXT NOT NULL, entry_id INTEGER NOT NULL, removed_at INTEGER NOT NULL, PRIMARY KEY(board, entry_id))').run();
}
export async function findScores(db, board, search, page = 0) {
  const config = boards[board];
  if (!config) throw Error('Unsupported leaderboard');
  const where = search ? 'AND lower(s.nickname) LIKE ? ESCAPE \'\\\'' : '';
  const filter = search ? '%' + search.toLowerCase().replace(/[%_\\]/g, '\\$&') + '%' : null;
  const base = 'FROM ' + config.table + " s WHERE NOT EXISTS (SELECT 1 FROM leaderboard_removed_scores r WHERE r.board=? AND r.entry_id=s.id) " + where;
  const count = await (search
    ? db.prepare('SELECT COUNT(*) AS total ' + base).bind(board,filter)
    : db.prepare('SELECT COUNT(*) AS total ' + base).bind(board)).first();
  const columns = 's.id,s.nickname,s.score,s.created_at AS createdAt,s.source_type AS sourceType' + (config.mode ? ',s.mode' : '');
  const query = db.prepare('SELECT ' + columns + ' ' + base + ' ORDER BY s.created_at DESC,s.id DESC LIMIT 25 OFFSET ?');
  const result = await (search ? query.bind(board,filter,page*25) : query.bind(board,page*25)).all();
  return { total: count?.total || 0, page, entries: result.results || [] };
}
export async function removeScore(db, board, id) {
  const config = boards[board];
  if (!config || !Number.isSafeInteger(id) || id < 1) return false;
  const found = await db.prepare('SELECT id FROM ' + config.table + ' WHERE id=? LIMIT 1').bind(id).first();
  if (!found) return false;
  // A tombstone hides the precise entry from all public modes, including
  // deduplicated views. No accounts or other nickname entries are touched.
  await db.prepare('INSERT OR IGNORE INTO leaderboard_removed_scores(board,entry_id,removed_at) VALUES(?,?,?)')
    .bind(board,id,Date.now()).run();
  return true;
}
