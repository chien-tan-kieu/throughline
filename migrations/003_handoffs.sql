CREATE TABLE IF NOT EXISTS handoffs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id     TEXT    NOT NULL,
  file_path    TEXT    NOT NULL,
  generated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handoffs_story ON handoffs(story_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_ts    ON handoffs(generated_at DESC);
