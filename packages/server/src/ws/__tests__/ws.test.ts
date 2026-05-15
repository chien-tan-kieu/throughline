import { Database } from "bun:sqlite";
// packages/server/src/ws/__tests__/ws.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createBus } from "../../bus.ts";
import { createServer } from "../../server.ts";
import { runMigrations } from "../../store/migrate.ts";
import { WsServer } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");
const TOKEN = "ws-test-token";

describe("WsServer", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let bus: ReturnType<typeof createBus>;
  let wsServer: WsServer;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    bus = createBus();
    wsServer = new WsServer(bus);
    server = createServer({ port: 0, token: TOKEN, db, bus, wsServer });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    wsServer.stop();
    server.stop(true);
    db.close();
  });

  test("upgrade rejected without token returns 401", async () => {
    const res = await fetch(`${base}/ws`, {
      headers: { Host: `127.0.0.1:${server.port}`, Upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  test("connects and receives pong on ping", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );

    const pong = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      ws.send(JSON.stringify({ type: "ping" }));
    });

    const msg = JSON.parse(pong) as { type: string };
    expect(msg.type).toBe("pong");
    ws.close();
  });

  test("fan-out delivers plan.changed only to subscribed client", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );

    ws.send(
      JSON.stringify({ type: "subscribe", topics: ["plan:/some/path.md"] }),
    );
    await new Promise((r) => setTimeout(r, 50));

    const received = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      bus.publish({
        type: "plan.changed",
        data: { path: "/some/path.md", tasks: [] },
      });
    });

    const msg = JSON.parse(received) as { type: string };
    expect(msg.type).toBe("plan.changed");
    ws.close();
  });

  test("unsubscribe stops delivery", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );

    ws.send(JSON.stringify({ type: "subscribe", topics: ["stories"] }));
    await new Promise((r) => setTimeout(r, 30));
    ws.send(JSON.stringify({ type: "unsubscribe", topics: ["stories"] }));
    await new Promise((r) => setTimeout(r, 30));

    let received = false;
    ws.addEventListener("message", () => {
      received = true;
    });
    bus.publish({
      type: "story.changed",
      data: { id: "US-2026-05-13-test", op: "create" },
    });
    await new Promise((r) => setTimeout(r, 80));

    expect(received).toBe(false);
    ws.close();
  });
});
