-- Latest completed analysis priority for players in the SUS leaderboard.
CREATE TABLE IF NOT EXISTS sus_recent_reviews (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  priority TEXT NOT NULL CHECK(priority IN ('LOW','MODERATE','HIGH','VERY HIGH')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
