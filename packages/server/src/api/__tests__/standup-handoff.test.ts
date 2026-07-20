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

  test("GET /api/handoffs/latest?story=<unknown> returns 404 when none match", async () => {
    const res = await fetch(`${base}/api/handoffs/latest?story=US-2026-06-22-no-such-story`, {
      headers,
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/handoffs/latest returns latest overall with title, content, age", async () => {
    const fileDir = join(tmpdir(), `cc-latest-${Date.now()}`);
    await mkdir(fileDir, { recursive: true });
    const oldFile = join(fileDir, "old.md");
    const newFile = join(fileDir, "new.md");
    await Bun.write(oldFile, "old handoff body");
    await Bun.write(newFile, "## This session\nnew handoff body");

    const now = Date.now();
    daemon.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (NULL, 'sess-old', ?, ?)`,
      [oldFile, now - 100000],
    );
    daemon.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (NULL, 'sess-new', ?, ?)`,
      [newFile, now],
    );

    const res = await fetch(`${base}/api/handoffs/latest`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe("sess-new");
    expect(body.content).toContain("new handoff body");
    expect(typeof body.title).toBe("string");
    expect(typeof body.age).toBe("string");
  });

  test("GET /api/handoffs/latest?story=<id> returns newest for that story", async () => {
    const fileDir = join(tmpdir(), `cc-latest-story-${Date.now()}`);
    await mkdir(fileDir, { recursive: true });
    const storiesDir = join(fileDir, "stories");
    await mkdir(storiesDir, { recursive: true });
    const storyId = "US-2026-06-22-latest";
    const storyPath = join(storiesDir, `${storyId}.md`);
    await Bun.write(storyPath, `---\nid: ${storyId}\ntitle: Latest Story\nstatus: in-progress\ncreated: 2026-06-22\n---\n\nBody.`);
    daemon.db.run(
      `INSERT INTO stories (id, file_path, title, size, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'in-progress', ?, ?)`,
      [storyId, storyPath, "Latest Story", Date.now(), Date.now()],
    );

    const fileA = join(fileDir, "a.md");
    const fileB = join(fileDir, "b.md");
    await Bun.write(fileA, "older story handoff");
    await Bun.write(fileB, "newer story handoff");
    const now = Date.now();
    daemon.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (?, 'sx1', ?, ?)`,
      [storyId, fileA, now - 50000],
    );
    daemon.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (?, 'sx2', ?, ?)`,
      [storyId, fileB, now - 10000],
    );
    daemon.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES ('US-other', 'sx3', ?, ?)`,
      [fileA, now],
    );

    const res = await fetch(`${base}/api/handoffs/latest?story=${storyId}`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.story_id).toBe(storyId);
    expect(body.content).toContain("newer story handoff");
    expect(body.title).toContain("Latest Story");
  });

  test("POST /hooks/SessionEnd auto-generates a retrievable handoff", async () => {
    const sessionId = "e2e-session-end";
    const startedAt = Date.now();
    daemon.db.run(
      `INSERT INTO sessions (id, cwd, permission_mode, started_at, status)
       VALUES (?, '/tmp/proj', 'default', ?, 'active')`,
      [sessionId, startedAt],
    );
    daemon.db.run(
      `INSERT INTO events (session_id, subagent_id, event_name, payload_json, ts)
       VALUES (?, NULL, 'PostToolUse', ?, ?)`,
      [
        sessionId,
        JSON.stringify({
          session_id: sessionId,
          hook_event_name: "PostToolUse",
          tool_name: "Edit",
          tool_input: { file_path: "/tmp/proj/x.ts" },
        }),
        startedAt + 1,
      ],
    );

    const hookRes = await fetch(`${base}/hooks/SessionEnd`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        hook_event_name: "SessionEnd",
        transcript_path: "/tmp/t.json",
        cwd: "/tmp/proj",
        permission_mode: "default",
      }),
    });
    expect(hookRes.status).toBe(200);

    // fire-and-forget generation: retry briefly until the handoff appears
    let body: { content?: string } | null = null;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${base}/api/handoffs/latest`, { headers });
      if (res.status === 200) {
        const b = await res.json();
        if (b.session_id === sessionId) {
          body = b;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(body).not.toBeNull();
    expect(body?.content).toContain("## This session");
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
