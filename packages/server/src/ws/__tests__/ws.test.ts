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

async function connectAndAuth(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve) =>
    ws.addEventListener("open", () => resolve()),
  );
  ws.send(JSON.stringify({ type: "auth", token: TOKEN }));
  await new Promise((r) => setTimeout(r, 20));
  return ws;
}

describe("WsServer", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let bus: ReturnType<typeof createBus>;
  let wsServer: WsServer;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    bus = createBus();
    wsServer = new WsServer(bus, TOKEN);
    server = createServer({ port: 0, token: TOKEN, db, bus, wsServer });
  });

  afterAll(() => {
    wsServer.stop();
    server.stop(true);
    db.close();
  });

  test("connection opens without token in URL", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const result = await new Promise<string>((resolve) => {
      ws.addEventListener("open", () => resolve("open"));
      ws.addEventListener("close", (e) =>
        resolve(`closed:${(e as CloseEvent).code}`),
      );
    });
    expect(result).toBe("open");
    ws.close();
  });

  test("closes with 4001 when first message is not auth type", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );
    const code = await new Promise<number>((resolve) => {
      ws.addEventListener("close", (e) => resolve((e as CloseEvent).code));
      ws.send(JSON.stringify({ type: "ping" }));
    });
    expect(code).toBe(4001);
  });

  test("closes with 4001 when auth token is wrong", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve()),
    );
    const code = await new Promise<number>((resolve) => {
      ws.addEventListener("close", (e) => resolve((e as CloseEvent).code));
      ws.send(JSON.stringify({ type: "auth", token: "wrong-token" }));
    });
    expect(code).toBe(4001);
  });

  test("connects and receives pong on ping after auth", async () => {
    const ws = await connectAndAuth(server.port);

    const pong = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      ws.send(JSON.stringify({ type: "ping" }));
    });

    const msg = JSON.parse(pong) as { type: string };
    expect(msg.type).toBe("pong");
    ws.close();
  });

  test("fan-out delivers plan.changed only to subscribed client", async () => {
    const ws = await connectAndAuth(server.port);

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
    const ws = await connectAndAuth(server.port);

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

  test("session.updated reaches client subscribed to 'session'", async () => {
    const ws = await connectAndAuth(server.port);

    ws.send(JSON.stringify({ type: "subscribe", topics: ["session"] }));
    await new Promise((r) => setTimeout(r, 50));

    const received = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      bus.publish({
        type: "session.updated",
        data: { activeStoryId: "US-2026-06-01-my-story" },
      });
    });

    const msg = JSON.parse(received) as { type: string; data: { activeStoryId: string } };
    expect(msg.type).toBe("session.updated");
    expect(msg.data.activeStoryId).toBe("US-2026-06-01-my-story");
    ws.close();
  });
});
