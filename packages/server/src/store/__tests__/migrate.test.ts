import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../migrate.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("runMigrations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("creates sessions and events tables", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("sessions");
    expect(tables).toContain("events");
    expect(tables).toContain("_migrations");
  });

  test("running migrations twice is idempotent", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    await runMigrations(db, MIGRATIONS_DIR);

    const count =
      db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM _migrations").get()
        ?.c ?? 0;

    expect(count).toBe(4); // all migration files applied once each
  });

  test("sessions table has expected columns", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(sessions)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("id");
    expect(cols).toContain("cwd");
    expect(cols).toContain("status");
    expect(cols).toContain("started_at");
    expect(cols).toContain("inferred_phase");
  });

  test("events table has expected columns", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(events)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("id");
    expect(cols).toContain("session_id");
    expect(cols).toContain("subagent_id");
    expect(cols).toContain("event_name");
    expect(cols).toContain("payload_json");
    expect(cols).toContain("ts");
  });

  test("creates handoffs table", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("handoffs");
  });

  test("handoffs table has expected columns", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(handoffs)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("id");
    expect(cols).toContain("story_id");
    expect(cols).toContain("file_path");
    expect(cols).toContain("generated_at");
  });

  test("stories table has seq column after migration", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(stories)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("seq");
  });

  test("stories seq column rejects duplicate non-null values", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, status, seq, created_at, updated_at)
       VALUES ('US1', '/a', 'A', 'backlog', 1, ?, ?)`,
      [ts, ts],
    );
    expect(() => {
      db.run(
        `INSERT INTO stories (id, file_path, title, status, seq, created_at, updated_at)
         VALUES ('US2', '/b', 'B', 'backlog', 1, ?, ?)`,
        [ts, ts],
      );
    }).toThrow();
  });

  test("stories seq column allows multiple NULL values", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, status, created_at, updated_at)
       VALUES ('US-2026-01-01-a', '/a', 'A', 'backlog', ?, ?)`,
      [ts, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, status, created_at, updated_at)
       VALUES ('US-2026-01-01-b', '/b', 'B', 'backlog', ?, ?)`,
      [ts, ts],
    );
    const count = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) as c FROM stories WHERE seq IS NULL",
      )
      .get()?.c;
    expect(count).toBe(2);
  });
});
