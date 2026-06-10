// packages/server/src/superpowers/__tests__/watcher.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stubBus } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { SuperpowersWatcher } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("SuperpowersWatcher", () => {
  let db: Database;
  let cwd: string;
  let watcher: SuperpowersWatcher;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-watcher-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    await mkdir(join(cwd, "docs/superpowers/specs"), { recursive: true });
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    watcher = new SuperpowersWatcher(cwd, db, stubBus);
  });

  afterEach(async () => {
    watcher.stop();
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("start() eagerly parses existing plan files", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/my-plan.md");
    await writeFile(
      planPath,
      "# My Plan\n\n### Task 1: Setup\n\n- [ ] step one\n",
    );

    await watcher.start();

    const plan = watcher.getParsedPlan(planPath);
    expect(plan).not.toBeNull();
    expect(plan?.title).toBe("My Plan");
    expect(plan?.tasks[0].steps[0].state).toBe("todo");
  });

  test("getParsedPlan returns null for unknown path", async () => {
    await watcher.start();
    expect(watcher.getParsedPlan("/nonexistent/plan.md")).toBeNull();
  });

  test("handleFileChange updates plan and upserts plan_tasks rows", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/feature.md");
    await writeFile(planPath, "# Plan\n\n### Task 1: Work\n\n- [ ] todo\n");
    await watcher.start();
    await watcher.handleFileChange(planPath);

    const rows = db
      .query<{ task_title: string }, []>("SELECT task_title FROM plan_tasks")
      .all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].task_title).toBe("Work");
  });

  test("handleFileChange publishes plan.changed bus event", async () => {
    const published: Array<{ type: string }> = [];
    const bus = {
      publish: (e: { type: string }) => published.push(e),
      subscribe: () => () => {},
    };
    const w = new SuperpowersWatcher(cwd, db, bus);
    await w.start();

    const planPath = join(cwd, "docs/superpowers/plans/test.md");
    await writeFile(planPath, "# Plan\n\n### Task 1: T\n\n- [ ] step\n");
    await w.handleFileChange(planPath);

    expect(published.some((e) => e.type === "plan.changed")).toBe(true);
    w.stop();
  });

  test("auto-links new spec file to active story via storyLinker", async () => {
    await watcher.start();

    // Set up an active session pointing at this cwd
    const ts = Date.now();
    db.run(
      "INSERT INTO sessions (id, cwd, status, started_at) VALUES (?, ?, 'active', ?)",
      ["sess-spec", cwd, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES ('US1', ?, 'Test Story', NULL, 'backlog', NULL, NULL, ?, ?)`,
      [join(cwd, "docs/superpowers/stories/US1.md"), ts, ts],
    );
    db.run("UPDATE sessions SET active_story_id = 'US1' WHERE id = 'sess-spec'");

    const linked: Array<{ storyId: string; type: string; path: string }> = [];
    watcher.setStoryLinker((storyId, type, path) => {
      linked.push({ storyId, type, path });
      return Promise.resolve();
    });

    const specPath = join(cwd, "docs/superpowers/specs/new-spec.md");
    await writeFile(specPath, "# My Spec\n\nContent.\n");
    await watcher.handleFileChange(specPath);

    expect(linked).toHaveLength(1);
    expect(linked[0].storyId).toBe("US1");
    expect(linked[0].type).toBe("spec");
    expect(linked[0].path).toBe(resolve(specPath));
  });

  test("does not call storyLinker for a spec update (already known)", async () => {
    const specPath = join(cwd, "docs/superpowers/specs/existing-spec.md");
    await writeFile(specPath, "# Existing\n\nFirst version.\n");
    await watcher.start(); // loads existing spec → already known

    const ts = Date.now();
    db.run(
      "INSERT INTO sessions (id, cwd, status, started_at) VALUES (?, ?, 'active', ?)",
      ["sess-update", cwd, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES ('US2', ?, 'Test Story', NULL, 'backlog', NULL, NULL, ?, ?)`,
      [join(cwd, "docs/superpowers/stories/US2.md"), ts, ts],
    );
    db.run("UPDATE sessions SET active_story_id = 'US2' WHERE id = 'sess-update'");

    const linked: Array<unknown> = [];
    watcher.setStoryLinker(() => { linked.push(1); return Promise.resolve(); });

    await writeFile(specPath, "# Existing\n\nUpdated content.\n");
    await watcher.handleFileChange(specPath);

    expect(linked).toHaveLength(0);
  });

  test("does not call storyLinker when active story already has a linked spec", async () => {
    await watcher.start();

    const ts = Date.now();
    db.run(
      "INSERT INTO sessions (id, cwd, status, started_at) VALUES (?, ?, 'active', ?)",
      ["sess-already", cwd, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES ('US3', ?, 'Test Story', NULL, 'backlog', '/docs/specs/old.md', NULL, ?, ?)`,
      [join(cwd, "docs/superpowers/stories/US3.md"), ts, ts],
    );
    db.run("UPDATE sessions SET active_story_id = 'US3' WHERE id = 'sess-already'");

    const linked: Array<unknown> = [];
    watcher.setStoryLinker(() => { linked.push(1); return Promise.resolve(); });

    const specPath = join(cwd, "docs/superpowers/specs/another-spec.md");
    await writeFile(specPath, "# Another\n\nContent.\n");
    await watcher.handleFileChange(specPath);

    expect(linked).toHaveLength(0);
  });

  test("auto-links new plan file to active story via storyLinker", async () => {
    await watcher.start();

    const ts = Date.now();
    db.run(
      "INSERT INTO sessions (id, cwd, status, started_at) VALUES (?, ?, 'active', ?)",
      ["sess-plan", cwd, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES ('US4', ?, 'Test Story', NULL, 'backlog', NULL, NULL, ?, ?)`,
      [join(cwd, "docs/superpowers/stories/US4.md"), ts, ts],
    );
    db.run("UPDATE sessions SET active_story_id = 'US4' WHERE id = 'sess-plan'");

    const linked: Array<{ storyId: string; type: string; path: string }> = [];
    watcher.setStoryLinker((storyId, type, path) => {
      linked.push({ storyId, type, path });
      return Promise.resolve();
    });

    const planPath = join(cwd, "docs/superpowers/plans/new-plan.md");
    await writeFile(planPath, "# My Plan\n\n### Task 1: Go\n\n- [ ] step\n");
    await watcher.handleFileChange(planPath);

    expect(linked).toHaveLength(1);
    expect(linked[0].storyId).toBe("US4");
    expect(linked[0].type).toBe("plan");
    expect(linked[0].path).toBe(resolve(planPath));
  });
});
