ALTER TABLE sync_queue ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE sync_queue ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE sync_queue ADD COLUMN dead_lettered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_queue ADD COLUMN resolved_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_sync_queue_ready ON sync_queue(status, dead_lettered, next_attempt_at, created_at);
