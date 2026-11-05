-- Online chess: 3+0 unrated. Apply to AUTH_DB before enabling multiplayer.
CREATE TABLE IF NOT EXISTS online_games (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','active','finished')),
 kind TEXT NOT NULL CHECK(kind IN ('random','invite')),
 white_token TEXT NOT NULL,
 black_token TEXT,
 white_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
 black_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
 invited_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS online_games_white_user ON online_games(white_user_id,updated_at);
CREATE INDEX IF NOT EXISTS online_games_black_user ON online_games(black_user_id,updated_at);
CREATE TRIGGER IF NOT EXISTS online_anonymize_user BEFORE DELETE ON "user" BEGIN
 UPDATE online_games SET white_name='Account Closed' WHERE white_user_id=OLD.id;
 UPDATE online_games SET black_name='Account Closed' WHERE black_user_id=OLD.id;
END;
