import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { HandoffService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

async function seedStoryFile(
  cwd: string,
  db: Database,
  opts: {
    id: string;
    title: string;
    status: string;
    body?: string;
    linkedPlan?: string;
  },
) {
  const storiesDir = join(cwd, "docs/superpowers/stories");
  await Bun.write(
    join(storiesDir, `${opts.id}.md`),
    `---\nid: ${opts.id}\ntitle: ${opts.title}\nstatus: ${opts.status}\ncreated: 2026-05-17\n---\n\n${opts.body ?? "Story body here."}`,
  );
  const filePath = join(storiesDir, `${opts.id}.md`);
  db.run(
    `INSERT INTO stories (id, file_path, title, size, status, linked_plan_path, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      opts.id,
      filePath,
      opts.title,
      opts.status,
      opts.linkedPlan ?? null,
      Date.now(),
      Date.now(),
    ],
  );
  return filePath;
}

describe("HandoffService", () => {
  let db: Database;
  let cwd: string;
  let svc: HandoffService;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-handoff-${Date.now()}`);
    await Bun.write(join(cwd, "docs/superpowers/stories/.keep"), "");
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    svc = new HandoffService(cwd, db);
  });

  afterEach(async () => {
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("generate() writes handoff file and inserts DB row", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-001",
      title: "Test Story",
      status: "in-progress",
    });
    const result = await svc.generate("US-001");
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.content).toContain("Test Story");
    const row = db
      .query<{ story_id: string }, []>("SELECT story_id FROM handoffs")
      .get();
    expect(row?.story_id).toBe("US-001");
  });

  test("generate() writes to .throughline/handoffs/<date>-<id>.md", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-002",
      title: "Path Test",
      status: "backlog",
    });
    const result = await svc.generate("US-002");
    expect(result.filePath).toContain(".throughline/handoffs");
    expect(result.filePath).toContain("US-002");
  });

  test("generate() includes story body in output", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-003",
      title: "Body Story",
      status: "in-progress",
      body: "As a developer\nI want things to work\nSo that I am happy",
    });
    const result = await svc.generate("US-003");
    expect(result.content).toContain("As a developer");
  });

  test("generate() returns null if story not found", async () => {
    const result = await svc.generate("US-NONEXISTENT");
    expect(result).toBeNull();
  });

  test("generate() succeeds when story has no linked plan", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-004",
      title: "No Plan Story",
      status: "backlog",
    });
    const result = await svc.generate("US-004");
    expect(result.content).toContain("(no plan yet)");
  });

  function seedSession(
    sessionId: string,
    activeStoryId: string | null,
    startedAt: number,
  ) {
    db.run(
      `INSERT INTO sessions (id, cwd, permission_mode, started_at, status, active_story_id)
       VALUES (?, ?, 'default', ?, 'ended', ?)`,
      [sessionId, cwd, startedAt, activeStoryId],
    );
  }

  function seedEvent(
    sessionId: string,
    eventName: string,
    payload: Record<string, unknown>,
    ts: number,
  ) {
    db.run(
      `INSERT INTO events (session_id, subagent_id, event_name, payload_json, ts)
       VALUES (?, NULL, ?, ?, ?)`,
      [
        sessionId,
        eventName,
        JSON.stringify({
          session_id: sessionId,
          hook_event_name: eventName,
          ...payload,
        }),
        ts,
      ],
    );
  }

  function seedActivity(sessionId: string, startedAt: number) {
    seedEvent(
      sessionId,
      "UserPromptSubmit",
      { prompt: "Build the feature" },
      startedAt + 1,
    );
    seedEvent(
      sessionId,
      "PostToolUse",
      { tool_name: "Edit", tool_input: { file_path: "/proj/b.ts" } },
      startedAt + 2,
    );
    seedEvent(
      sessionId,
      "PostToolUse",
      { tool_name: "Write", tool_input: { file_path: "/proj/a.ts" } },
      startedAt + 3,
    );
    seedEvent(
      sessionId,
      "PostToolUse",
      { tool_name: "Edit", tool_input: { file_path: "/proj/a.ts" } },
      startedAt + 4,
    );
    seedEvent(
      sessionId,
      "PostToolUse",
      { tool_name: "Bash", tool_input: { command: "git commit -m fix" } },
      startedAt + 5,
    );
    seedEvent(
      sessionId,
      "PostToolUse",
      { tool_name: "Bash", tool_input: { command: "bun test" } },
      startedAt + 6,
    );
    seedEvent(
      sessionId,
      "PostToolUseFailure",
      { tool_name: "Grep", tool_input: {} },
      startedAt + 7,
    );
    seedEvent(
      sessionId,
      "PostToolUseFailure",
      { tool_name: "Grep", tool_input: {} },
      startedAt + 8,
    );
    seedEvent(
      sessionId,
      "PostToolUseFailure",
      { tool_name: "Grep", tool_input: {} },
      startedAt + 9,
    );
  }

  test("generateForSession() writes session handoff with mined activity (no active story)", async () => {
    const sessionId = "sess-no-story";
    const startedAt = Date.now();
    seedSession(sessionId, null, startedAt);
    seedActivity(sessionId, startedAt);

    const result = await svc.generateForSession(sessionId);

    const dateStr = new Date().toISOString().slice(0, 10);
    expect(result.filePath).toContain(`${dateStr}-session-`);
    expect(result.filePath).toContain(".throughline/handoffs");
    expect(result.content).toContain("## This session");
    expect(result.content).toContain("/proj/a.ts");
    expect(result.content).toContain("/proj/b.ts");
    // dedupe: a.ts appears once in the files list
    expect(result.content.match(/\/proj\/a\.ts/g)?.length).toBe(1);
    expect(result.content).toContain("git commit -m fix");
    expect(result.content).toContain("bun test");
    expect(result.content).toContain("Grep");
    expect(result.content).toContain("Goal:");
    expect(result.content).toContain("Build the feature");
    expect(result.content).not.toContain("## Next Up");
    expect(result.content).not.toContain("## Story Body");

    const row = db
      .query<{ story_id: string | null; session_id: string | null }, []>(
        "SELECT story_id, session_id FROM handoffs",
      )
      .get();
    expect(row?.session_id).toBe(sessionId);
    expect(row?.story_id).toBeNull();
  });

  test("generateForSession() writes story handoff when session has active story", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/sess-plan.md");
    await Bun.write(
      planPath,
      "# Plan\n\n### Task 1: Setup\n\n- [ ] **Step 1: Do setup**\n",
    );
    const storiesDir = join(cwd, "docs/superpowers/stories");
    const storyPath = join(storiesDir, "US-100.md");
    await Bun.write(
      storyPath,
      "---\nid: US-100\ntitle: Active Story\nstatus: in-progress\ncreated: 2026-05-17\n---\n\nStory content here.",
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        "US-100",
        storyPath,
        "Active Story",
        "in-progress",
        planPath,
        Date.now(),
        Date.now(),
      ],
    );

    const sessionId = "sess-with-story";
    const startedAt = Date.now();
    seedSession(sessionId, "US-100", startedAt);
    seedActivity(sessionId, startedAt);

    const result = await svc.generateForSession(sessionId);

    const dateStr = new Date().toISOString().slice(0, 10);
    expect(result.filePath).toContain(`${dateStr}-US-100.md`);
    expect(result.content).toContain("# Handoff: Active Story");
    expect(result.content).toContain("### Task 1: Setup");
    expect(result.content).toContain("## Story Body");
    expect(result.content).toContain("## This session");

    const row = db
      .query<{ story_id: string | null; session_id: string | null }, []>(
        "SELECT story_id, session_id FROM handoffs",
      )
      .get();
    expect(row?.story_id).toBe("US-100");
    expect(row?.session_id).toBe(sessionId);
  });

  test("generateForSession() is stable filename on repeat (overwrite)", async () => {
    const sessionId = "sess-repeat";
    const startedAt = Date.now();
    seedSession(sessionId, null, startedAt);
    seedActivity(sessionId, startedAt);

    const first = await svc.generateForSession(sessionId);
    const second = await svc.generateForSession(sessionId);
    expect(second.filePath).toBe(first.filePath);
  });

  test("generateForSession() handles empty activity without throwing", async () => {
    const sessionId = "sess-empty";
    const startedAt = Date.now();
    seedSession(sessionId, null, startedAt);

    const result = await svc.generateForSession(sessionId);
    expect(result.content).toContain("## This session");
  });

  test("generate() includes 'next up' task from linked plan", async () => {
    // Create a minimal plan file
    const planPath = join(cwd, "docs/superpowers/plans/test-plan.md");
    await Bun.write(
      planPath,
      "# Test Plan\n\n### Task 1: Setup\n\n- [ ] **Step 1: Do setup**\n",
    );
    // Seed story with linked plan
    const storiesDir = join(cwd, "docs/superpowers/stories");
    const storyPath = join(storiesDir, "US-005.md");
    await Bun.write(
      storyPath,
      "---\nid: US-005\ntitle: Plan Story\nstatus: in-progress\ncreated: 2026-05-17\n---\n\nStory content here.",
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        "US-005",
        storyPath,
        "Plan Story",
        "in-progress",
        planPath,
        Date.now(),
        Date.now(),
      ],
    );
    const result = await svc.generate("US-005");
    expect(result.content).toContain("### Task 1: Setup");
  });
});
