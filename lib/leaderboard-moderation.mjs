// Shared server-side tombstones: historical backfills cannot restore removed scores.
import { IDs as arcadeModes } from '../arcade-rules.mjs';
export const boards = Object.freeze({
  puzzle: { table: 'puzzle_score_entries', mode: true },
  maze: { table: 'knight_maze_score_entries', mode: false },
  arcade: { table: 'arcade_score_entries', mode: true }
});
export async function ensureModerationTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS leaderboard_removed_scores (board TEXT NOT NULL, entry_id INTEGER NOT NULL, removed_at INTEGER NOT NULL, PRIMARY KEY(board, entry_id))').run();
}
export async function findScores(db, board, search, page = 0, mode = '') {
  const config = boards[board];
  if (!config) throw Error('Unsupported leaderboard');
  if (board === 'arcade' && !arcadeModes.has(mode)) throw Error('Unsupported arcade mode');
  const filters = ['NOT EXISTS (SELECT 1 FROM leaderboard_removed_scores r WHERE r.board=? AND r.entry_id=s.id)'];
  const params = [board];
  if (board === 'arcade') { filters.push('s.mode=?'); params.push(mode); }
  if (search) {
    filters.push("lower(s.nickname) LIKE ? ESCAPE '\\'");
    params.push('%' + search.toLowerCase().replace(/[%_\\]/g, '\\$&') + '%');
  }
  const base = 'FROM ' + config.table + ' s WHERE ' + filters.join(' AND ');
  const count = await db.prepare('SELECT COUNT(*) AS total ' + base).bind(...params).first();
  const columns = 's.id,s.nickname,s.score,s.created_at AS createdAt,s.source_type AS sourceType' + (config.mode ? ',s.mode' : '');
  const result = await db.prepare('SELECT ' + columns + ' ' + base + ' ORDER BY s.created_at DESC,s.id DESC LIMIT 25 OFFSET ?').bind(...params,page*25).all();
  return { total: count?.total || 0, page, entries: result.results || [] };
}
export async function removeScore(db, board, id) {
  const config = boards[board];
  if (!config || !Number.isSafeInteger(id) || id < 1) return false;
  const found = await db.prepare('SELECT id FROM ' + config.table + ' WHERE id=? LIMIT 1').bind(id).first();
  if (!found) return false;
  await db.prepare('INSERT OR IGNORE INTO leaderboard_removed_scores(board,entry_id,removed_at) VALUES(?,?,?)')
    .bind(board,id,Date.now()).run();
  return true;
}
