-- Pending draw offers for active 3+0 online games.
CREATE TABLE IF NOT EXISTS online_draw_offers (
 game_id TEXT PRIMARY KEY REFERENCES online_games(id) ON DELETE CASCADE,
 offered_by TEXT NOT NULL CHECK(offered_by IN ('w','b')),
 created_at INTEGER NOT NULL
);
