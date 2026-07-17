CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT    PRIMARY KEY,
  cwd             TEXT    NOT NULL,
  model           TEXT,
  agent_type      TEXT,
  permission_mode TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  status          TEXT    NOT NULL DEFAULT 'active',
  inferred_phase  TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT    NOT NULL,
  subagent_id  TEXT,
  event_name   TEXT    NOT NULL,
  payload_json TEXT    NOT NULL,
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name, ts);
