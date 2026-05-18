import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { StandupService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

function seedStory(
  db: Database,
  opts: { id: string; title: string; status: string; size?: string; updatedAt: number },
) {
  db.run(
    `INSERT INTO stories (id, file_path, title, size, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [opts.id, `/tmp/${opts.id}.md`, opts.title, opts.size ?? null, opts.status, opts.updatedAt, opts.updatedAt],
  );
}

function seedBlockerEvents(db: Database, sessionId: string, storyId: string, toolName: string, count: number, withinMs: number) {
  const sessionStart = Date.now() - withinMs;
  db.run(
    `INSERT INTO sessions (id, cwd, permission_mode, started_at, status, active_story_id)
     VALUES (?, '/tmp', 'auto', ?, 'active', ?)`,
    [sessionId, sessionStart, storyId],
  );
  for (let i = 0; i < count; i++) {
    db.run(
      `INSERT INTO events (session_id, event_name, payload_json, ts)
       VALUES (?, 'PostToolUseFailure', ?, ?)`,
      [sessionId, JSON.stringify({ tool_name: toolName }), sessionStart + i * 1000],
    );
  }
}

describe("StandupService", () => {
  let db: Database;
  let svc: StandupService;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    svc = new StandupService(db);
  });

  afterEach(() => db.close());

  test("returns empty digest when no stories", () => {
    const result = svc.generate("2026-05-17");
    expect(result.date).toBe("2026-05-17");
    expect(result.shipped).toHaveLength(0);
    expect(result.inProgress).toHaveLength(0);
    expect(result.blockers).toHaveLength(0);
  });

  test("shipped includes story done in prior calendar day window", () => {
    // date = 2026-05-17 → prior day = 2026-05-16 → window [May16 00:00, May17 00:00)
    const may16noon = new Date("2026-05-16T12:00:00").getTime();
    seedStory(db, { id: "US-001", title: "Shipped Story", status: "done", updatedAt: may16noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(1);
    expect(result.shipped[0].storyId).toBe("US-001");
  });

  test("shipped excludes story done on the requested date itself (wrong day)", () => {
    const may17noon = new Date("2026-05-17T12:00:00").getTime();
    seedStory(db, { id: "US-002", title: "Today Story", status: "done", updatedAt: may17noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(0);
  });

  test("shipped excludes story done two days ago", () => {
    const may15noon = new Date("2026-05-15T12:00:00").getTime();
    seedStory(db, { id: "US-003", title: "Old Story", status: "done", updatedAt: may15noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(0);
  });

  test("inProgress returns all stories with status in-progress", () => {
    seedStory(db, { id: "US-004", title: "WIP Story", status: "in-progress", updatedAt: Date.now() });
    const result = svc.generate("2026-05-17");
    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0].storyId).toBe("US-004");
  });

  test("blockers: fewer than 3 failures = no blocker", () => {
    seedBlockerEvents(db, "sess-1", "US-005", "Edit", 2, 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(0);
  });

  test("blockers: 3 or more failures for same tool in same session = blocker", () => {
    seedStory(db, { id: "US-005", title: "Blocked Story", status: "in-progress", updatedAt: Date.now() });
    seedBlockerEvents(db, "sess-2", "US-005", "Edit", 3, 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].storyId).toBe("US-005");
  });

  test("blockers: events older than 24h are excluded", () => {
    seedStory(db, { id: "US-006", title: "Old Blocked", status: "in-progress", updatedAt: Date.now() });
    seedBlockerEvents(db, "sess-3", "US-006", "Bash", 5, 25 * 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(0);
  });
});
