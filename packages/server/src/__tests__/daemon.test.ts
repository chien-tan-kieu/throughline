import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DaemonHandle, startDaemon } from "../index.ts";

describe("startDaemon", () => {
  let handle: DaemonHandle;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = join(tmpdir(), `cc-test-${Date.now()}`);
    handle = await startDaemon({ port: 0, dataDir });
  });

  afterAll(async () => {
    await handle.stop();
  });

  test("server responds to healthz", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("writes runtime.json to dataDir", () => {
    const runtimePath = join(dataDir, "runtime.json");
    expect(existsSync(runtimePath)).toBe(true);

    const runtime = JSON.parse(readFileSync(runtimePath, "utf-8"));
    expect(runtime.port).toBe(handle.port);
    expect(typeof runtime.token).toBe("string");
    expect(runtime.token.length).toBeGreaterThan(0);
    expect(runtime.pid).toBe(process.pid);
  });

  test("token from runtime.json matches handle.token", () => {
    const runtimePath = join(dataDir, "runtime.json");
    const runtime = JSON.parse(readFileSync(runtimePath, "utf-8"));
    expect(runtime.token).toBe(handle.token);
  });

  test("GET /api/status returns version and status", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
  });
});

describe("port range fallback", () => {
  test("binds to next port when preferred port is in use", async () => {
    // Occupy 47821 so the daemon must fall back to 47822+
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 47821,
      fetch: () => new Response("busy"),
    });
    const occupiedPort = occupied.port;

    try {
      const dataDir2 = join(tmpdir(), `cc-fallback-${Date.now()}`);
      const handle2 = await startDaemon({ dataDir: dataDir2 }); // no port → tries range
      expect(handle2.port).toBeGreaterThan(occupiedPort);
      expect(handle2.port).toBeLessThanOrEqual(47830);
      await handle2.stop();
    } finally {
      occupied.stop(true);
    }
  });
});
