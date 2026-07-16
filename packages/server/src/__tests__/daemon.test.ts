import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DaemonHandle, VERSION, startDaemon } from "../index.ts";

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
    expect(body.version).toBe(VERSION);
  });
});

describe("port range fallback", () => {
  test("binds to next port when preferred port is in use", async () => {
    // Find a free port dynamically so we never conflict with a running daemon
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") });
    const basePort = probe.port;
    probe.stop(true);

    // Occupy basePort so the daemon must fall back to basePort+1
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: basePort,
      fetch: () => new Response("busy"),
    });
    const occupiedPort = occupied.port;

    try {
      const dataDir2 = join(tmpdir(), `cc-fallback-${Date.now()}`);
      // Use portRangeStart to make startDaemon try basePort first (range mode)
      const handle2 = await startDaemon({ portRangeStart: basePort, dataDir: dataDir2 });
      expect(handle2.port).toBeGreaterThan(occupiedPort);
      expect(handle2.port).toBeLessThanOrEqual(basePort + 9);
      await handle2.stop();
    } finally {
      occupied.stop(true);
    }
  });
});

describe("startDaemon with custom webDistPath", () => {
  test("serves index.html from the provided webDistPath instead of the default", async () => {
    const dataDir = join(tmpdir(), `cc-webdist-data-${Date.now()}`);
    const webDistPath = join(tmpdir(), `cc-webdist-assets-${Date.now()}`);
    await mkdir(webDistPath, { recursive: true });
    await writeFile(
      join(webDistPath, "index.html"),
      "<!doctype html><html><body>CUSTOM-MARKER</body></html>",
    );

    const handle = await startDaemon({ port: 0, dataDir, webDistPath });
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/`, {
        headers: { Host: `127.0.0.1:${handle.port}` },
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("CUSTOM-MARKER");
    } finally {
      await handle.stop();
    }
  });
});
