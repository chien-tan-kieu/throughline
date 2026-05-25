// packages/server/src/stories/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bus, BusEvent } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { StoryService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("StoryService", () => {
  let db: Database;
  let cwd: string;
  let service: StoryService;
  let publishedEvents: BusEvent[];
  let bus: Bus;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-stories-${Date.now()}`);
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    publishedEvents = [];
    bus = {
      publish(event: BusEvent) {
        publishedEvents.push(event);
      },
      subscribe: () => () => {},
    };
    service = new StoryService(cwd, db, bus);
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

  test("create() writes file under docs/superpowers/stories", async () => {
    const story = await service.create("Path Check");
    expect(story.file_path).toBe(
      join(cwd, "docs/superpowers/stories", `${story.id}.md`),
    );
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

  test("upsertRow updates title on subsequent call", () => {
    const id = "US-2026-01-01-title-test";
    const filePath = join(cwd, "docs/superpowers/stories", `${id}.md`);
    (service as any).upsertRow(id, filePath, "Title A", "backlog", null, null, null);
    (service as any).upsertRow(id, filePath, "Title B", "backlog", null, null, null);
    const row = db
      .query<{ title: string }, [string]>(
        "SELECT title FROM stories WHERE id = ?",
      )
      .get(id);
    expect(row?.title).toBe("Title B");
  });

  test("loadAll() prunes rows for files that no longer exist on disk", async () => {
    // Seed a stale row directly — simulates a file deleted while the server was down
    const staleId = "US-2026-01-01-stale-story";
    const stalePath = join(cwd, "docs/superpowers/stories", `${staleId}.md`);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [staleId, stalePath, "Stale Story", ts, ts],
    );

    // Restart service — loadAll() runs and should prune the stale row
    service.stop();
    service = new StoryService(cwd, db, bus);
    await service.start();

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(staleId);
    expect(row).toBeNull();
  });

  test("handleFileEvent() deletes row and emits bus event when file is missing", async () => {
    const story = await service.create("To Be Deleted");
    publishedEvents = []; // reset events accumulated during create()

    await rm(story.file_path); // file gone — readFile will return null

    await (service as any).handleFileEvent(`${story.id}.md`);

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(story.id);
    expect(row).toBeNull();
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toEqual({
      type: "story.changed",
      data: { id: story.id, op: "delete" },
    });
  });

  test("reconcile() deletes stale row and emits delete event", async () => {
    const staleId = "US-2026-01-01-stale-reconcile";
    const stalePath = join(cwd, "docs/superpowers/stories", `${staleId}.md`);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [staleId, stalePath, "Stale Reconcile", ts, ts],
    );
    publishedEvents = [];

    await (service as any).reconcile();

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(staleId);
    expect(row).toBeNull();
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toEqual({
      type: "story.changed",
      data: { id: staleId, op: "delete" },
    });
  });

  test("reconcile() upserts on-disk file absent from SQLite and emits create event", async () => {
    // Fresh service without start() — no watcher, no loadAll, avoids race with active watcher
    const isolatedCwd = join(tmpdir(), `cc-reconcile-${Date.now()}`);
    const storiesDir = join(isolatedCwd, "docs/superpowers/stories");
    await mkdir(storiesDir, { recursive: true });

    const isolatedDb = new Database(":memory:");
    await runMigrations(isolatedDb, MIGRATIONS_DIR);
    const isolatedEvents: BusEvent[] = [];
    const isolatedBus: Bus = {
      publish(event: BusEvent) { isolatedEvents.push(event); },
      subscribe: () => () => {},
    };
    const isolatedService = new StoryService(isolatedCwd, isolatedDb, isolatedBus);

    const id = "US-2026-01-01-new-file";
    const filePath = join(storiesDir, `${id}.md`);
    await writeFile(
      filePath,
      [
        "---",
        `id: ${id}`,
        "title: New On-Disk Story",
        "status: backlog",
        "created: 2026-01-01",
        "---",
        "",
        "Body",
      ].join("\n"),
      "utf-8",
    );

    await (isolatedService as any).reconcile();

    try {
      const row = isolatedDb
        .query<{ id: string; title: string }, [string]>(
          "SELECT id, title FROM stories WHERE id = ?",
        )
        .get(id);
      expect(row?.id).toBe(id);
      expect(row?.title).toBe("New On-Disk Story");
      expect(isolatedEvents).toHaveLength(1);
      expect(isolatedEvents[0]).toEqual({
        type: "story.changed",
        data: { id, op: "create" },
      });
    } finally {
      isolatedDb.close();
      await rm(isolatedCwd, { recursive: true, force: true });
    }
  });

  test("start() sets reconcileTimer", () => {
    expect((service as any).reconcileTimer).not.toBeNull();
  });

  test("stop() clears reconcileTimer and is safe to call twice", () => {
    service.stop();
    expect((service as any).reconcileTimer).toBeNull();
    expect(() => service.stop()).not.toThrow();
  });
});
