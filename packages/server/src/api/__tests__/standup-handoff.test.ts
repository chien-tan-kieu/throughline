import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DaemonHandle, startDaemon } from "../../index.ts";

describe("standup + handoff routes", () => {
  let daemon: DaemonHandle;
  let base: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-api-sh-${Date.now()}`);
    const cwd = join(tmpdir(), `cc-cwd-sh-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/stories"), { recursive: true });
    daemon = await startDaemon({ port: 0, dataDir, cwd });
    base = `http://127.0.0.1:${daemon.port}`;
    headers = { Authorization: `Bearer ${daemon.token}`, Host: `127.0.0.1:${daemon.port}` };
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("GET /api/standup returns digest with correct date", async () => {
    const res = await fetch(`${base}/api/standup`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.date).toBe("string");
    expect(Array.isArray(body.shipped)).toBe(true);
    expect(Array.isArray(body.inProgress)).toBe(true);
    expect(Array.isArray(body.blockers)).toBe(true);
  });

  test("GET /api/standup?date=2026-05-16 uses provided date", async () => {
    const res = await fetch(`${base}/api/standup?date=2026-05-16`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-05-16");
  });

  test("POST /api/handoff/:storyId returns 404 for unknown story", async () => {
    const res = await fetch(`${base}/api/handoff/US-2026-05-17-nonexistent`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(404);
  });

  test("POST /api/handoff/:storyId returns 400 for invalid ID", async () => {
    const res = await fetch(`${base}/api/handoff/invalid-id`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/handoffs returns array", async () => {
    const res = await fetch(`${base}/api/handoffs`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/handoff/:storyId returns 201 with filePath and content", async () => {
    // Seed a story in the DB for the daemon to find
    // We need to insert directly into the daemon's DB
    const storyId = "US-2026-05-17-test-handoff";
    const cwd = join(tmpdir(), `cc-cwd-sh-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/stories"), { recursive: true });
    const storiesDir = join(cwd, "docs/superpowers/stories");
    const storyPath = join(storiesDir, `${storyId}.md`);
    await Bun.write(storyPath, `---\nid: ${storyId}\ntitle: Test Handoff Story\nstatus: in-progress\ncreated: 2026-05-17\n---\n\nStory body.`);
    daemon.db.run(
      `INSERT INTO stories (id, file_path, title, size, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'in-progress', ?, ?)`,
      [storyId, storyPath, "Test Handoff Story", Date.now(), Date.now()],
    );

    const res = await fetch(`${base}/api/handoff/${storyId}`, { method: "POST", headers });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.filePath).toBe("string");
    expect(body.filePath).toContain(storyId);
    expect(typeof body.content).toBe("string");
    expect(body.content).toContain("Test Handoff Story");
  });
});
