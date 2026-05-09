import type { Database } from "bun:sqlite";
import type { HookEvent } from "@cc/shared";

export function upsertSession(db: Database, event: HookEvent): void {
  db.run(
    `INSERT INTO sessions (id, cwd, permission_mode, started_at, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(id) DO NOTHING`,
    [event.session_id, event.cwd, event.permission_mode, Date.now()],
  );
}

export function endSession(db: Database, sessionId: string): void {
  db.run(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`, [
    Date.now(),
    sessionId,
  ]);
}

export function persistEvent(db: Database, event: HookEvent): void {
  upsertSession(db, event);

  const subagentId =
    event.hook_event_name === "SubagentStart" ||
    event.hook_event_name === "SubagentStop"
      ? event.subagent_id
      : null;

  db.run(
    `INSERT INTO events (session_id, subagent_id, event_name, payload_json, ts)
     VALUES (?, ?, ?, ?, ?)`,
    [
      event.session_id,
      subagentId,
      event.hook_event_name,
      JSON.stringify(event),
      Date.now(),
    ],
  );

  if (event.hook_event_name === "SessionEnd") {
    endSession(db, event.session_id);
  }
}
