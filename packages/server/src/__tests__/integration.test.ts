import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DaemonHandle, startDaemon } from "../index.ts";

describe("full hook round-trip", () => {
  let daemon: DaemonHandle;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-integration-${Date.now()}`);
    daemon = await startDaemon({ port: 0, dataDir });
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("POST PreToolUse → 200 {} and event row in SQLite", async () => {
    const payload = {
      session_id: "integration-sess-1",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp/project",
      hook_event_name: "PreToolUse",
      permission_mode: "default",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    };

    const res = await fetch(
      `http://127.0.0.1:${daemon.port}/hooks/PreToolUse`,
      {
        method: "POST",
        headers: {
          Host: `127.0.0.1:${daemon.port}`,
          Authorization: `Bearer ${daemon.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");

    const events = daemon.db
      .query<{ event_name: string; session_id: string }, []>(
        "SELECT event_name, session_id FROM events",
      )
      .all();

    expect(events).toHaveLength(1);
    expect(events[0].event_name).toBe("PreToolUse");
    expect(events[0].session_id).toBe("integration-sess-1");
  });

  test("SessionEnd sets session status to ended", async () => {
    const base = {
      session_id: "integration-sess-2",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp/project",
      permission_mode: "default",
    };

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/SessionStart`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...base, hook_event_name: "SessionStart" }),
    });

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/SessionEnd`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...base, hook_event_name: "SessionEnd" }),
    });

    const session = daemon.db
      .query<{ status: string }, []>(
        "SELECT status FROM sessions WHERE id = 'integration-sess-2'",
      )
      .get();

    expect(session?.status).toBe("ended");
  });

  test("POST Stop → 200 {} (observer contract over HTTP)", async () => {
    const res = await fetch(`http://127.0.0.1:${daemon.port}/hooks/Stop`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "integration-sess-3",
        transcript_path: "/tmp/t.json",
        cwd: "/tmp",
        hook_event_name: "Stop",
        permission_mode: "default",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
  });
});

describe("rate limiting integration", () => {
  let daemon: DaemonHandle;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-ratelimit-${Date.now()}`);
    // Cap at 1 event per session per minute so second request is silently dropped
    daemon = await startDaemon({
      port: 0,
      dataDir,
      rateLimit: { limit: 1, windowMs: 60_000 },
    });
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("second event from same session returns 200 but is not persisted", async () => {
    const payload = {
      session_id: "ratelimit-sess-1",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp",
      hook_event_name: "Stop",
      permission_mode: "default",
    };
    const headers = {
      Host: `127.0.0.1:${daemon.port}`,
      Authorization: `Bearer ${daemon.token}`,
      "Content-Type": "application/json",
    };

    const res1 = await fetch(`http://127.0.0.1:${daemon.port}/hooks/Stop`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);
    expect(await res1.text()).toBe("{}");

    const res2 = await fetch(`http://127.0.0.1:${daemon.port}/hooks/Stop`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe("{}");

    const count =
      daemon.db
        .query<{ c: number }, []>("SELECT COUNT(*) as c FROM events")
        .get()?.c ?? 0;
    expect(count).toBe(1); // second request was silently dropped
  });
});

describe("plan file change via PostToolUse → WS delivery", () => {
  let daemon: DaemonHandle;
  let cwd: string;

  beforeAll(async () => {
    cwd = join(tmpdir(), `cc-ws-integration-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    daemon = await startDaemon({
      port: 0,
      dataDir: join(tmpdir(), `cc-ws-data-${Date.now()}`),
      cwd,
    });
  });

  afterAll(async () => {
    await daemon.stop();
    await import("node:fs/promises").then((fs) =>
      fs.rm(cwd, { recursive: true, force: true }),
    );
  });

  test("PostToolUse Edit on plan file triggers plan.changed WS message within 500ms", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/test.md");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        planPath,
        "# Test Plan\n\n### Task 1: Work\n\n- [ ] step one\n",
      ),
    );

    const ws = new WebSocket(`ws://127.0.0.1:${daemon.port}/ws`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );
    ws.send(JSON.stringify({ type: "auth", token: daemon.token }));
    await new Promise((r) => setTimeout(r, 20));
    ws.send(
      JSON.stringify({ type: "subscribe", topics: [`plan:${planPath}`] }),
    );
    await new Promise((r) => setTimeout(r, 50));

    const received = new Promise<{ type: string }>((resolve) => {
      ws.addEventListener("message", (e) =>
        resolve(JSON.parse(e.data as string)),
      );
    });

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/PostToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "ws-integration-sess",
        transcript_path: "/tmp/t.json",
        cwd,
        hook_event_name: "PostToolUse",
        permission_mode: "default",
        tool_name: "Edit",
        tool_input: { file_path: planPath },
        tool_response: {},
      }),
    });

    const msg = await Promise.race([
      received,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 500),
      ),
    ]);

    expect(msg.type).toBe("plan.changed");
    ws.close();
  });
});
