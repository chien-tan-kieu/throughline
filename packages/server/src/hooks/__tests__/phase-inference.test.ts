// packages/server/src/hooks/__tests__/phase-inference.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { BusEvent } from "../../bus.ts";
import { createBus } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { handleHookEvent } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

const base = {
  session_id: "phase-test-sess",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp",
  permission_mode: "default",
  hook_event_name: "PostToolUse",
  tool_name: "Skill",
  tool_response: {},
};

function collectPhaseEvents(bus: ReturnType<typeof createBus>): BusEvent[] {
  const events: BusEvent[] = [];
  bus.subscribe((e) => { if (e.type === "phase.inferred") events.push(e); });
  return events;
}

describe("phase inference from Skill tool invocations", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => db.close());

  test("brainstorming skill → phase 'brainstorm'", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:brainstorming" } }, db, bus);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "phase.inferred", data: { sessionId: "phase-test-sess", phase: "brainstorm" } });
  });

  test("writing-specs skill → phase 'spec'", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:writing-specs" } }, db, bus);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "phase.inferred", data: { phase: "spec" } });
  });

  test("writing-plans skill → phase 'plan'", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:writing-plans" } }, db, bus);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "phase.inferred", data: { phase: "plan" } });
  });

  test("executing-plans skill → phase 'implement'", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:executing-plans" } }, db, bus);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "phase.inferred", data: { phase: "implement" } });
  });

  test("subagent-driven-development skill → phase 'implement'", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:subagent-driven-development" } }, db, bus);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "phase.inferred", data: { phase: "implement" } });
  });

  test("unknown skill → no phase.inferred event", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_input: { skill: "superpowers:some-other-skill" } }, db, bus);
    expect(events).toHaveLength(0);
  });

  test("non-Skill PostToolUse → no phase.inferred event", async () => {
    const bus = createBus();
    const events = collectPhaseEvents(bus);
    await handleHookEvent("PostToolUse", { ...base, tool_name: "Bash", tool_input: {} }, db, bus);
    expect(events).toHaveLength(0);
  });
});
