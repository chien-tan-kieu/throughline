// packages/server/src/stories/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stubBus } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { StoryService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("StoryService", () => {
  let db: Database;
  let cwd: string;
  let service: StoryService;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-stories-${Date.now()}`);
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    service = new StoryService(cwd, db, stubBus);
    await service.start();
  });

  afterEach(async () => {
    service.stop();
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("create() returns a story with generated id and writes a file", async () => {
    const story = await service.create("Add OAuth login");
    expect(story.id).toMatch(/^US-\d{4}-\d{2}-\d{2}-/);
    expect(story.title).toBe("Add OAuth login");
    expect(story.status).toBe("backlog");
    const row = db.query<{ id: string }, []>("SELECT id FROM stories").get();
    expect(row?.id).toBe(story.id);
  });

  test("list() returns created story and excludes archived ones", async () => {
    await service.create("Story A");
    await service.create("Story B");
    const stories = service.list();
    expect(stories).toHaveLength(2);
  });

  test("get() returns story detail with body", async () => {
    const created = await service.create("Detail Story");
    const detail = service.get(created.id);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(created.id);
    expect(typeof detail?.body).toBe("string");
  });

  test("update() patches status and reflects in list()", async () => {
    const story = await service.create("Update Me");
    await service.update(story.id, { status: "in-progress" });
    const row = db
      .query<{ status: string }, [string]>(
        "SELECT status FROM stories WHERE id = ?",
      )
      .get(story.id);
    expect(row?.status).toBe("in-progress");
  });

  test("archive() moves story to archived status", async () => {
    const story = await service.create("Archive Me");
    await service.archive(story.id);
    const all = service.list();
    expect(all.find((s) => s.id === story.id)).toBeUndefined();
    const row = db
      .query<{ status: string }, [string]>(
        "SELECT status FROM stories WHERE id = ?",
      )
      .get(story.id);
    expect(row?.status).toBe("archived");
  });

  test("get() returns null for invalid id format", () => {
    expect(service.get("../etc/passwd")).toBeNull();
    expect(service.get("not-a-valid-id")).toBeNull();
  });
});
