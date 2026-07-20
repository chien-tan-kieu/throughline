import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { stubBus } from "../../bus.ts";
import type { HandoffService } from "../../handoff/index.ts";
import { runMigrations } from "../../store/migrate.ts";
import { handleHookEvent } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

const basePayload = {
  session_id: "handoff-trigger-sess",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  permission_mode: "default",
};

function makeFakeHandoff(impl?: (sessionId: string) => Promise<unknown>) {
  const calls: string[] = [];
  const handoff = {
    generateForSession: (sessionId: string) => {
      calls.push(sessionId);
      return impl
        ? impl(sessionId)
        : Promise.resolve({ filePath: "/x", content: "" });
    },
  } as unknown as HandoffService;
  return { calls, handoff };
}

function countEvents(db: Database, sessionId: string): number {
  return (
    db
      .query<{ c: number }, [string]>(
        "SELECT COUNT(*) as c FROM events WHERE session_id = ?",
      )
      .get(sessionId)?.c ?? 0
  );
}

describe("hook-dispatch handoff trigger", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  test("SessionEnd triggers generateForSession with the session id", async () => {
    const { handoff, calls } = makeFakeHandoff();
    const payload = { ...basePayload, hook_event_name: "SessionEnd" };
    const res = await handleHookEvent(
      "SessionEnd",
      payload,
      db,
      stubBus,
      undefined,
      handoff,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
    expect(calls).toContain(basePayload.session_id);
  });

  test("PreCompact triggers; PostToolUse does not", async () => {
    const { handoff, calls } = makeFakeHandoff();

    await handleHookEvent(
      "PreCompact",
      { ...basePayload, hook_event_name: "PreCompact" },
      db,
      stubBus,
      undefined,
      handoff,
    );
    expect(calls).toContain(basePayload.session_id);

    const before = calls.length;
    await handleHookEvent(
      "PostToolUse",
      {
        ...basePayload,
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: {},
        tool_response: {},
      },
      db,
      stubBus,
      undefined,
      handoff,
    );
    expect(calls.length).toBe(before);
  });

  test("rejection from generateForSession is swallowed; event still persisted", async () => {
    const { handoff } = makeFakeHandoff(() =>
      Promise.reject(new Error("boom")),
    );
    const payload = { ...basePayload, hook_event_name: "SessionEnd" };
    const res = await handleHookEvent(
      "SessionEnd",
      payload,
      db,
      stubBus,
      undefined,
      handoff,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
    // allow the rejected microtask to settle — must not throw
    await new Promise((r) => setTimeout(r, 0));
    expect(countEvents(db, basePayload.session_id)).toBeGreaterThan(0);
  });

  test("undefined handoff degrades gracefully", async () => {
    const payload = { ...basePayload, hook_event_name: "SessionEnd" };
    const res = await handleHookEvent("SessionEnd", payload, db, stubBus);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
    expect(countEvents(db, basePayload.session_id)).toBeGreaterThan(0);
  });
});
