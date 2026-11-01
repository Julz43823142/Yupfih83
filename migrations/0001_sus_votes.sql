-- Run once against the Cloudflare D1 database bound to this Pages project as SUS_DB.
CREATE TABLE IF NOT EXISTS sus_votes (
  username TEXT NOT NULL COLLATE NOCASE,
  voter_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (username,voter_id)
);
CREATE INDEX IF NOT EXISTS sus_votes_player_idx ON sus_votes(username);
