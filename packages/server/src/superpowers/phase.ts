import type { Database } from "bun:sqlite";
import type { Phase } from "@throughline/shared";

const PHASE_ORDER: Phase[] = ["brainstorm", "spec", "plan", "implement"];

export function advancePhase(current: Phase | null, next: Phase): Phase {
  if (!current) return next;
  return PHASE_ORDER.indexOf(next) > PHASE_ORDER.indexOf(current)
    ? next
    : current;
}

export function inferPhase(sessionId: string, db: Database): Phase | null {
  const rows = db
    .query<{ payload_json: string }, [string, string, number]>(
      `SELECT payload_json FROM events
       WHERE session_id = ? AND event_name = ?
       ORDER BY ts DESC LIMIT ?`,
    )
    .all(sessionId, "InstructionsLoaded", 20);

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as { file_path?: string };
      const fp = payload.file_path ?? "";
      if (
        fp.includes("executing-plans") ||
        fp.includes("subagent-driven-development")
      ) {
        return "implement";
      }
      if (fp.includes("writing-plans")) return "plan";
      if (fp.includes("brainstorming")) return "brainstorm";
    } catch {
      // skip malformed
    }
  }
  return null;
}
