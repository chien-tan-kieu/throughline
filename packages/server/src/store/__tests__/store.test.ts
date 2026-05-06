import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../migrate.ts";
import { endSession, persistEvent, upsertSession } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

const base = {
  session_id: "sess-store-1",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  hook_event_name: "SessionStart" as const,
  permission_mode: "default" as const,
};

describe("store", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  test("upsertSession creates a session row", () => {
    upsertSession(db, base);

    const row = db
      .query<{ id: string; status: string }, []>("SELECT id, status FROM sessions")
      .get();

    expect(row?.id).toBe("sess-store-1");
    expect(row?.status).toBe("active");
  });

  test("upsertSession is idempotent (ON CONFLICT DO NOTHING)", () => {
    upsertSession(db, base);
    upsertSession(db, base);

    const count = db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions")
      .get()!.c;

    expect(count).toBe(1);
  });

  test("persistEvent inserts event row with correct fields", () => {
    persistEvent(db, { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} });

    const row = db
      .query<{ session_id: string; event_name: string; payload_json: string }, []>(
        "SELECT session_id, event_name, payload_json FROM events"
      )
      .get();

    expect(row?.session_id).toBe("sess-store-1");
    expect(row?.event_name).toBe("PreToolUse");
    const payload = JSON.parse(row!.payload_json);
    expect(payload.tool_name).toBe("Bash");
  });

  test("persistEvent promotes subagent_id column for SubagentStop", () => {
    persistEvent(db, {
      ...base,
      hook_event_name: "SubagentStop",
      agent_type: "general-purpose",
      subagent_id: "sub-xyz",
      stop_reason: "completed",
      output: "done",
    });

    const row = db
      .query<{ subagent_id: string | null }, []>("SELECT subagent_id FROM events")
      .get();

    expect(row?.subagent_id).toBe("sub-xyz");
  });

  test("persistEvent sets subagent_id to null for non-subagent events", () => {
    persistEvent(db, base);

    const row = db
      .query<{ subagent_id: string | null }, []>("SELECT subagent_id FROM events")
      .get();

    expect(row?.subagent_id).toBeNull();
  });

  test("SessionEnd event sets sessions.status to 'ended'", () => {
    upsertSession(db, base);
    persistEvent(db, { ...base, hook_event_name: "SessionEnd" });

    const row = db
      .query<{ status: string; ended_at: number | null }, []>(
        "SELECT status, ended_at FROM sessions WHERE id = ?"
      )
      .get("sess-store-1");

    expect(row?.status).toBe("ended");
    expect(row?.ended_at).not.toBeNull();
  });
});
