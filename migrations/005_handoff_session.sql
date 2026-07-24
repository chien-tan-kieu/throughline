CREATE TABLE handoffs_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id     TEXT,
  session_id   TEXT,
  file_path    TEXT    NOT NULL,
  generated_at INTEGER NOT NULL
);

INSERT INTO handoffs_new (id, story_id, session_id, file_path, generated_at)
  SELECT id, story_id, NULL, file_path, generated_at FROM handoffs;

DROP TABLE handoffs;

ALTER TABLE handoffs_new RENAME TO handoffs;

CREATE INDEX IF NOT EXISTS idx_handoffs_story ON handoffs(story_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_ts    ON handoffs(generated_at DESC);
