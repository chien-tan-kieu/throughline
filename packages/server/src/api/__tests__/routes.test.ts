// packages/server/src/api/__tests__/routes.test.ts
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBus } from "../../bus.ts";
import { createServer } from "../../server.ts";
import { runMigrations } from "../../store/migrate.ts";
import { StoryService } from "../../stories/index.ts";
import { SuperpowersWatcher } from "../../superpowers/index.ts";
import type { ApiCtx } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");
const TOKEN = "api-test-token";

describe("REST API routes", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let cwd: string;

  beforeAll(async () => {
    cwd = join(tmpdir(), `cc-api-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    await mkdir(join(cwd, "docs/superpowers/specs"), { recursive: true });

    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);

    const bus = createBus();
    const watcher = new SuperpowersWatcher(cwd, db, bus);
    await watcher.start();
    const stories = new StoryService(cwd, db, bus);
    await stories.start();

    const apiCtx: ApiCtx = { db, bus, watcher, stories } as unknown as ApiCtx;
    server = createServer({ port: 0, token: TOKEN, db, bus, apiCtx });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    server.stop(true);
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Host: `127.0.0.1:${server.port}`,
      Authorization: `Bearer ${TOKEN}`,
      ...extra,
    };
  }

  // Sessions
  test("GET /api/sessions/current returns null values when no sessions exist", async () => {
    const res = await fetch(`${base}/api/sessions/current`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionId: null; activeStoryId: null; phase: null };
    expect(body.sessionId).toBeNull();
    expect(body.activeStoryId).toBeNull();
    expect(body.phase).toBeNull();
  });

  test("GET /api/sessions returns 200 with array", async () => {
    const res = await fetch(`${base}/api/sessions`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/sessions/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/sessions/unknown-sess`, {
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /api/sessions/current updates active_story_id", async () => {
    db.run(
      `INSERT INTO sessions (id, cwd, started_at, status) VALUES ('sess-patch-test', '/tmp', 1748000000000, 'running')`
    );

    const res = await fetch(`${base}/api/sessions/current`, {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ active_story_id: "US-2026-06-01-story" }),
    });
    expect(res.status).toBe(200);

    const row = db
      .query(
        `SELECT active_story_id FROM sessions WHERE id = 'sess-patch-test'`
      )
      .get() as { active_story_id: string } | null;
    expect(row?.active_story_id).toBe("US-2026-06-01-story");
  });

  test("GET /api/events returns 200 with events + cursor", async () => {
    const res = await fetch(`${base}/api/events`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[]; cursor: number };
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.cursor).toBe("number");
  });

  // Stories
  test("GET /api/stories returns 200 with array", async () => {
    const res = await fetch(`${base}/api/stories`, { headers: headers() });
    expect(res.status).toBe(200);
  });

  test("POST /api/stories creates story and returns 201", async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "API Test Story" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^US\d+$/);
  });

  test("POST /api/stories returns 400 when title is missing", async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/stories/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/stories/US-2099-01-01-nonexistent`, {
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /api/stories/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/stories/US-2099-01-01-nonexistent`, {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/plans/:path returns 404 for unknown plan", async () => {
    const res = await fetch(`${base}/api/plans/unknown.md`, {
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/plans/:path returns 400 for path traversal", async () => {
    const res = await fetch(`${base}/api/plans/..%2Fetc%2Fpasswd`, {
      headers: headers(),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/sessions/current returns activeStoryId after PATCH sets it", async () => {
    db.run(
      `INSERT INTO sessions (id, cwd, started_at, status) VALUES ('sess-current-test', '/tmp', 1748100000000, 'active')`
    );
    db.run(
      `UPDATE sessions SET active_story_id = 'US-2026-06-01-current' WHERE id = 'sess-current-test'`
    );

    const res = await fetch(`${base}/api/sessions/current`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionId: string; activeStoryId: string; phase: null };
    expect(body.sessionId).toBe("sess-current-test");
    expect(body.activeStoryId).toBe("US-2026-06-01-current");
  });

  test("any /api route returns 401 without auth", async () => {
    const res = await fetch(`${base}/api/sessions`, {
      headers: { Host: `127.0.0.1:${server.port}` },
    });
    expect(res.status).toBe(401);
  });
});
