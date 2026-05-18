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
  opts: { id: string; title: string; status: string; body?: string; linkedPlan?: string },
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
    [opts.id, filePath, opts.title, opts.status, opts.linkedPlan ?? null, Date.now(), Date.now()],
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
    await seedStoryFile(cwd, db, { id: "US-001", title: "Test Story", status: "in-progress" });
    const result = await svc.generate("US-001");
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.content).toContain("Test Story");
    const row = db.query<{ story_id: string }, []>("SELECT story_id FROM handoffs").get();
    expect(row?.story_id).toBe("US-001");
  });

  test("generate() writes to .claude-control/handoffs/<date>-<id>.md", async () => {
    await seedStoryFile(cwd, db, { id: "US-002", title: "Path Test", status: "backlog" });
    const result = await svc.generate("US-002");
    expect(result.filePath).toContain(".claude-control/handoffs");
    expect(result.filePath).toContain("US-002");
  });

  test("generate() includes story body in output", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-003", title: "Body Story", status: "in-progress",
      body: "As a developer\nI want things to work\nSo that I am happy",
    });
    const result = await svc.generate("US-003");
    expect(result.content).toContain("As a developer");
  });

  test("generate() throws if story not found", async () => {
    await expect(svc.generate("US-NONEXISTENT")).rejects.toThrow("Story not found");
  });

  test("generate() succeeds when story has no linked plan", async () => {
    await seedStoryFile(cwd, db, { id: "US-004", title: "No Plan Story", status: "backlog" });
    const result = await svc.generate("US-004");
    expect(result.content).toContain("(no plan yet)");
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
    await Bun.write(storyPath, "---\nid: US-005\ntitle: Plan Story\nstatus: in-progress\ncreated: 2026-05-17\n---\n\nStory content here.");
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      ["US-005", storyPath, "Plan Story", "in-progress", planPath, Date.now(), Date.now()],
    );
    const result = await svc.generate("US-005");
    expect(result.content).toContain("### Task 1: Setup");
  });
});
