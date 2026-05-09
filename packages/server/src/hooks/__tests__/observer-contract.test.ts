import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { stubBus } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { handleHookEvent } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

const ALL_EVENTS: Array<[string, Record<string, unknown>]> = [
  ["SessionStart", {}],
  ["SessionEnd", {}],
  ["UserPromptSubmit", { prompt: "hello" }],
  ["UserPromptExpansion", {}],
  ["PreToolUse", { tool_name: "Bash", tool_input: {} }],
  ["PostToolUse", { tool_name: "Bash", tool_input: {}, tool_response: {} }],
  ["PostToolUseFailure", { tool_name: "Bash", tool_input: {}, error: "oops" }],
  [
    "SubagentStart",
    {
      agent_type: "general-purpose",
      prompt: "go",
      subagent_id: "s1",
      parent_session_id: "p1",
    },
  ],
  [
    "SubagentStop",
    {
      agent_type: "general-purpose",
      subagent_id: "s1",
      stop_reason: "completed",
      output: "done",
    },
  ],
  ["Stop", {}],
  ["Notification", { message: "hi" }],
  [
    "InstructionsLoaded",
    { file_path: "/tmp/f", memory_type: "Managed", load_reason: "startup" },
  ],
  ["PreCompact", {}],
  ["PostCompact", {}],
];

const basePayload = {
  session_id: "observer-test-sess",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  permission_mode: "default",
};

describe("observer contract — every handler returns exactly {}", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  for (const [eventName, extra] of ALL_EVENTS) {
    test(`${eventName} handler returns 200 with body '{}'`, async () => {
      const payload = { ...basePayload, hook_event_name: eventName, ...extra };
      const res = await handleHookEvent(eventName, payload, db, stubBus);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("{}");
    });
  }
});

describe("handleHookEvent error cases", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  test("malformed payload returns 400", async () => {
    const res = await handleHookEvent(
      "PreToolUse",
      { not_valid: true },
      db,
      stubBus,
    );
    expect(res.status).toBe(400);
  });

  test("unknown event name returns 400", async () => {
    const res = await handleHookEvent(
      "NotAnEvent",
      { ...basePayload, hook_event_name: "NotAnEvent" },
      db,
      stubBus,
    );
    expect(res.status).toBe(400);
  });
});
