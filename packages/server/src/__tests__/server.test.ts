import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../store/migrate.ts";
import { stubBus } from "../bus.ts";
import { createServer } from "../server.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations");
const TOKEN = "test-server-token";

describe("HTTP server", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    server = createServer({ port: 0, token: TOKEN, db, bus: stubBus });
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

  test("unknown route returns 404", async () => {
    const res = await fetch(`${base}/not-a-route`, {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(res.status).toBe(404);
  });
});
