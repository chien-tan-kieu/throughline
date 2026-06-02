import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stubBus } from "../bus.ts";
import { createServer } from "../server.ts";
import { runMigrations } from "../store/migrate.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations");
const TOKEN = "test-server-token";

describe("HTTP server", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let webDistPath: string;

  beforeAll(async () => {
    webDistPath = join(tmpdir(), `cc-web-dist-${Date.now()}`);
    await mkdir(webDistPath, { recursive: true });
    await writeFile(join(webDistPath, "index.html"), "<!doctype html><html><body>SPA</body></html>");

    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    server = createServer({ port: 0, token: TOKEN, db, bus: stubBus, webDistPath });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
    db.close();
  });

  test("GET /api/healthz returns {status: ok} without auth", async () => {
    const res = await fetch(`${base}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("POST /hooks/PreToolUse with valid auth returns {}", async () => {
    const res = await fetch(`${base}/hooks/PreToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "srv-test-sess",
        transcript_path: "/tmp/t.json",
        cwd: "/tmp",
        hook_event_name: "PreToolUse",
        permission_mode: "default",
        tool_name: "Bash",
        tool_input: {},
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
  });

  test("POST /hooks/PreToolUse without auth returns 401", async () => {
    const res = await fetch(`${base}/hooks/PreToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${server.port}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/sessions returns 501 (stub)", async () => {
    const res = await fetch(`${base}/api/sessions`, {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(res.status).toBe(501);
  });

  test("GET unknown route serves SPA (200)", async () => {
    const res = await fetch(`${base}/not-a-route`, {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(res.status).toBe(200);
  });

  test("GET / without auth returns 200 (SPA bootstrap must load without token)", async () => {
    const res = await fetch(`${base}/`, {
      headers: { Host: `127.0.0.1:${server.port}` },
    });
    expect(res.status).toBe(200);
  });

  test("GET /assets/* without auth returns 404 not 401", async () => {
    const res = await fetch(`${base}/assets/nonexistent.js`, {
      headers: { Host: `127.0.0.1:${server.port}` },
    });
    // 404 = auth passed, file just doesn't exist in test env
    // 401 = checkAuth blocked it (the current bug)
    expect(res.status).toBe(404);
  });
});
