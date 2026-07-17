-- packages/server/migrations/002_superpowers.sql
ALTER TABLE sessions ADD COLUMN active_story_id  TEXT;
ALTER TABLE sessions ADD COLUMN active_plan_path  TEXT;

CREATE TABLE IF NOT EXISTS stories (
  id               TEXT    PRIMARY KEY,
  file_path        TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  size             TEXT,
  status           TEXT    NOT NULL DEFAULT 'backlog',
  linked_spec_path TEXT,
  linked_plan_path TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path   TEXT    NOT NULL,
  task_index  INTEGER NOT NULL,
  task_title  TEXT    NOT NULL,
  files_json  TEXT,
  ts          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_steps (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path         TEXT    NOT NULL,
  task_index        INTEGER NOT NULL,
  step_index        INTEGER NOT NULL,
  step_label        TEXT    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'todo',
  completed_at      INTEGER,
  inferred_event_id INTEGER,
  ts                INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_path ON plan_tasks(plan_path);
CREATE INDEX IF NOT EXISTS idx_plan_steps_path ON plan_steps(plan_path, task_index);
CREATE INDEX IF NOT EXISTS idx_stories_status  ON stories(status);
