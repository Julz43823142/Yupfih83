-- One saved completed report per player; newer reports replace older ones.
CREATE TABLE IF NOT EXISTS sus_latest_reports (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  report_json TEXT NOT NULL,
  run_started_at TEXT NOT NULL
);
