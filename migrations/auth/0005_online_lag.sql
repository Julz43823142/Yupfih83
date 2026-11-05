-- Server-authoritative accounting of the strictly bounded network allowance.
-- Must run on isolated preview D1 before enabling this branch.
ALTER TABLE online_games ADD COLUMN white_lag_used_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE online_games ADD COLUMN black_lag_used_ms INTEGER NOT NULL DEFAULT 0;
