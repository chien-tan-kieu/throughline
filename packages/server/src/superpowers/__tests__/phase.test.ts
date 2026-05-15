import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { advancePhase, inferPhase } from "../phase.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("inferPhase", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    db.run(
      "INSERT INTO sessions (id, cwd, permission_mode, started_at, status) VALUES ('s1', '/proj', 'default', 0, 'active')",
    );
  });

  afterEach(() => db.close());

  function insertEvent(sessionId: string, filePath: string) {
    db.run(
      "INSERT INTO events (session_id, event_name, payload_json, ts) VALUES (?, 'InstructionsLoaded', ?, ?)",
      [sessionId, JSON.stringify({ file_path: filePath }), Date.now()],
    );
  }

  test("returns implement for executing-plans skill path", () => {
    insertEvent("s1", "/skills/executing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });

  test("returns implement for subagent-driven-development skill path", () => {
    insertEvent("s1", "/skills/subagent-driven-development/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });

  test("returns plan for writing-plans skill path", () => {
    insertEvent("s1", "/skills/writing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("plan");
  });

  test("returns brainstorm for brainstorming skill path", () => {
    insertEvent("s1", "/skills/brainstorming/SKILL.md");
    expect(inferPhase("s1", db)).toBe("brainstorm");
  });

  test("returns null when no InstructionsLoaded events", () => {
    expect(inferPhase("s1", db)).toBeNull();
  });

  test("first match wins — implement beats plan when both present", () => {
    insertEvent("s1", "/skills/writing-plans/SKILL.md");
    insertEvent("s1", "/skills/executing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });
});

describe("advancePhase", () => {
  test("returns next phase when current is null", () => {
    expect(advancePhase(null, "spec")).toBe("spec");
  });

  test("advances to a higher phase", () => {
    expect(advancePhase("brainstorm", "plan")).toBe("plan");
    expect(advancePhase("plan", "implement")).toBe("implement");
  });

  test("stays at current when next is lower", () => {
    expect(advancePhase("implement", "brainstorm")).toBe("implement");
    expect(advancePhase("plan", "spec")).toBe("plan");
  });

  test("stays at current when next equals current", () => {
    expect(advancePhase("spec", "spec")).toBe("spec");
  });
});
