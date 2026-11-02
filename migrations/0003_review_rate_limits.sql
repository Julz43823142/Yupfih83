CREATE TABLE IF NOT EXISTS review_rate_limits (client TEXT NOT NULL, bucket INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(client,bucket));
CREATE INDEX IF NOT EXISTS idx_review_rate_limits_bucket ON review_rate_limits(bucket);
