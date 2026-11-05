-- Online chess: 3+0 unrated. Apply to AUTH_DB before enabling multiplayer.
CREATE TABLE IF NOT EXISTS online_games (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','active','finished')),
 kind TEXT NOT NULL CHECK(kind IN ('random','invite')),
 white_token TEXT NOT NULL,
 black_token TEXT,
 white_name TEXT NOT NULL,
 black_name TEXT,
 fen TEXT NOT NULL,
 moves TEXT NOT NULL DEFAULT '[]',
 turn TEXT NOT NULL DEFAULT 'w',
 white_ms INTEGER NOT NULL DEFAULT 180000,
 black_ms INTEGER NOT NULL DEFAULT 180000,
 last_move_at INTEGER,
 result TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS online_games_queue ON online_games(kind,status,created_at);
CREATE INDEX IF NOT EXISTS online_games_updated ON online_games(updated_at);
