# Fix Auth Token URL Exposure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the auth token from appearing in any URL by using a hash fragment for browser bootstrap and first-message auth for WebSocket.

**Architecture:** The plugin's `/open` command switches from `?token=` (query param, sent to server) to `#token=` (fragment, never sent to server). On page load, `main.tsx` reads the fragment and immediately strips it via `history.replaceState`. The WebSocket hook connects without a token in the URL and sends `{ type: "auth", token }` as its first message; the server validates on receipt and closes with code 4001 on failure. HTTP API calls already use `Authorization: Bearer` and need no change.

**Tech Stack:** Bun (server tests via `bun test`), Vitest (web tests via `pnpm test`), React + Zustand (frontend), TypeScript throughout.

---

## File Map

| File | Change |
|------|--------|
| `packages/server/src/security/index.ts` | Remove `url.searchParams.get("token")` fallback |
| `packages/server/src/security/__tests__/security.test.ts` | Update query-param auth cases |
| `packages/server/src/ws/index.ts` | Store token in constructor; add `authenticated` to `WsData`; gate `handleMessage` behind first-message auth |
| `packages/server/src/ws/__tests__/ws.test.ts` | Update constructor call; replace upgrade test; add auth cases; update all connect helpers |
| `packages/server/src/server.ts` | Remove `token` arg from `wsServer.upgrade()` call; change 401→400 on upgrade failure |
| `packages/server/src/index.ts` | Pass `token` to `new WsServer(bus, token)` |
| `packages/web/src/hooks/useWebSocket.ts` | Remove token from WS URL; send auth as first message in `onopen` |
| `packages/web/src/__tests__/useWebSocket.test.ts` | Add `sentMessages` to `MockWebSocket`; update URL assertion; add auth message assertion |
| `packages/web/src/main.tsx` | Read token from `window.location.hash`; call `history.replaceState` |
| `plugin/commands/open.md` | Change `?token=` to `#token=` in the URL |

---

## Task 1: Remove query-param fallback from `checkAuth`

**Files:**
- Modify: `packages/server/src/security/index.ts`
- Test: `packages/server/src/security/__tests__/security.test.ts`

- [ ] **Step 1: Update the failing test**

In `packages/server/src/security/__tests__/security.test.ts`, replace the two query-param tests (lines 72–85) with a single test that asserts `401` when the token arrives via query param:

```ts
test("returns 401 when token is passed as query param", () => {
  const req = makeRequest({
    url: `http://127.0.0.1:${PORT}/?token=${TOKEN}`,
  });
  const res = checkAuth(req, PORT, TOKEN);
  expect(res?.status).toBe(401);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd packages/server && bun test src/security/__tests__/security.test.ts
```

Expected: FAIL — the existing `checkAuth` still returns `null` for a valid query-param token.

- [ ] **Step 3: Remove the query-param fallback from `checkAuth`**

In `packages/server/src/security/index.ts`, replace the auth check block:

```ts
// Before (lines 42–45)
const url = new URL(req.url);
const queryToken = url.searchParams.get("token") ?? "";
const auth = req.headers.get("authorization") ?? "";
if (auth !== `Bearer ${token}` && queryToken !== token) {
  return new Response("Unauthorized", { status: 401 });
}

// After
const auth = req.headers.get("authorization") ?? "";
if (auth !== `Bearer ${token}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

Also remove the unused `import` of `URL` construction on that line if `url` is no longer used elsewhere in the function — the `url` variable is created fresh with `new URL(req.url)` at the top of `checkAuth`. After this change, that line can be deleted entirely.

Full updated `checkAuth`:

```ts
export function checkAuth(
  req: Request,
  serverPort: number,
  token: string,
): Response | null {
  const host = req.headers.get("host") ?? "";
  const validHosts = [
    `127.0.0.1:${serverPort}`,
    `localhost:${serverPort}`,
    "127.0.0.1",
    "localhost",
  ];
  if (!validHosts.includes(host)) {
    return new Response("Forbidden", { status: 403 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd packages/server && bun test src/security/__tests__/security.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/security/index.ts packages/server/src/security/__tests__/security.test.ts
git commit -m "fix(security): remove query-param token fallback from checkAuth"
```

---

## Task 2: First-message auth for WebSocket

**Files:**
- Modify: `packages/server/src/ws/index.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/src/ws/__tests__/ws.test.ts`

- [ ] **Step 1: Rewrite `ws.test.ts` with the new expectations**

Replace the full contents of `packages/server/src/ws/__tests__/ws.test.ts` with:

```ts
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
  let base: string;
  let bus: ReturnType<typeof createBus>;
  let wsServer: WsServer;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    bus = createBus();
    wsServer = new WsServer(bus, TOKEN);
    server = createServer({ port: 0, token: TOKEN, db, bus, wsServer });
    base = `http://127.0.0.1:${server.port}`;
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
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd packages/server && bun test src/ws/__tests__/ws.test.ts
```

Expected: multiple FAILs — `WsServer` constructor doesn't accept a second arg yet, upgrade still checks the token, etc.

- [ ] **Step 3: Update `ws/index.ts`**

Replace the full contents of `packages/server/src/ws/index.ts`:

```ts
import type { WSOut } from "@cc/shared";
// packages/server/src/ws/index.ts
import type { Server as BunServer, ServerWebSocket } from "bun";
import type { Bus, BusEvent } from "../bus.ts";

export type WsData = { topics: Set<string>; authenticated: boolean };

export class WsServer {
  private sockets = new Set<ServerWebSocket<WsData>>();
  private unsubscribe: (() => void) | null = null;

  constructor(private bus: Bus, private token: string) {
    this.unsubscribe = bus.subscribe((event) => this.fanOut(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  upgrade(req: Request, server: BunServer): boolean {
    return server.upgrade<WsData>(req, {
      data: { topics: new Set(), authenticated: false },
    });
  }

  handleOpen(ws: ServerWebSocket<WsData>): void {
    this.sockets.add(ws);
  }

  handleClose(ws: ServerWebSocket<WsData>): void {
    this.sockets.delete(ws);
  }

  handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string; topics?: unknown; token?: unknown };

    if (!ws.data.authenticated) {
      if (m.type === "auth" && m.token === this.token) {
        ws.data.authenticated = true;
      } else {
        ws.close(4001, "Unauthorized");
      }
      return;
    }

    if (m.type === "subscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string") ws.data.topics.add(t);
    } else if (m.type === "unsubscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string") ws.data.topics.delete(t);
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" } satisfies WSOut));
    }
  }

  private fanOut(event: BusEvent): void {
    const pairs = this.toWsMessages(event);
    for (const [msg, topic] of pairs) {
      const json = JSON.stringify(msg);
      for (const ws of this.sockets) {
        if (ws.data.topics.has(topic)) ws.send(json);
      }
    }
  }

  private toWsMessages(event: BusEvent): Array<[WSOut, string]> {
    switch (event.type) {
      case "hook": {
        const out: WSOut = {
          type: "event",
          data: {
            id: 0,
            session_id: event.data.session_id,
            subagent_id: null,
            event_name: event.data.hook_event_name,
            payload_json: JSON.stringify(event.data),
            ts: Date.now(),
          },
        };
        return [
          [out, "events"],
          [out, `events:${event.data.session_id}`],
        ];
      }
      case "plan.changed":
        return [
          [
            { type: "plan.changed", data: event.data },
            `plan:${event.data.path}`,
          ],
        ];
      case "spec.changed":
        return [[{ type: "spec.changed", data: event.data }, "specs"]];
      case "story.changed":
        return [[{ type: "story.changed", data: event.data }, "stories"]];
      case "phase.inferred":
        return [
          [
            { type: "phase.inferred", data: event.data },
            `events:${event.data.sessionId}`,
          ],
        ];
    }
  }
}
```

- [ ] **Step 4: Update the WS upgrade call site in `server.ts`**

In `packages/server/src/server.ts`, find the `/ws` handler (around line 39) and update:

```ts
// Before
if (req.method === "GET" && url.pathname === "/ws") {
  if (!config.wsServer) return new Response("Not Found", { status: 404 });
  const upgraded = config.wsServer.upgrade(req, server, token);
  if (upgraded) return undefined as unknown as Response;
  return new Response("Unauthorized", { status: 401 });
}

// After
if (req.method === "GET" && url.pathname === "/ws") {
  if (!config.wsServer) return new Response("Not Found", { status: 404 });
  const upgraded = config.wsServer.upgrade(req, server);
  if (upgraded) return undefined as unknown as Response;
  return new Response("WebSocket upgrade failed", { status: 400 });
}
```

- [ ] **Step 5: Update the `WsServer` constructor call in `index.ts`**

In `packages/server/src/index.ts`, find the line `const wsServer = new WsServer(bus);` (around line 61) and update:

```ts
// Before
const wsServer = new WsServer(bus);

// After
const wsServer = new WsServer(bus, token);
```

- [ ] **Step 6: Run the WebSocket tests and confirm they pass**

```bash
cd packages/server && bun test src/ws/__tests__/ws.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 7: Run the full server test suite**

```bash
cd packages/server && bun test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/ws/index.ts \
        packages/server/src/ws/__tests__/ws.test.ts \
        packages/server/src/server.ts \
        packages/server/src/index.ts
git commit -m "feat(ws): replace token query-param with first-message auth"
```

---

## Task 3: Remove token from WebSocket URL in the browser hook

**Files:**
- Modify: `packages/web/src/hooks/useWebSocket.ts`
- Test: `packages/web/src/__tests__/useWebSocket.test.ts`

- [ ] **Step 1: Update `useWebSocket.test.ts`**

Replace the full contents of `packages/web/src/__tests__/useWebSocket.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { describe, expect, test, vi } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sentMessages: string[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  send(data: string) { this.sentMessages.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { useWsStore } from "../store/ws.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useWebSocket", () => {
  test("opens connection without token in URL", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://127.0.0.1:47821/ws");
  });

  test("sends auth message as first message on open", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); });
    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(1);
    expect(JSON.parse(MockWebSocket.instances[0].sentMessages[0])).toEqual({
      type: "auth",
      token: "abc123",
    });
  });

  test("sets connectionStatus to live on open", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "disconnected" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); });
    expect(useWsStore.getState().connectionStatus).toBe("live");
  });

  test("sets connectionStatus to disconnected on close", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "live" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); MockWebSocket.instances[0].close(); });
    expect(useWsStore.getState().connectionStatus).toBe("disconnected");
  });

  test("updates phase on phase.inferred message", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", phase: null });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => {
      MockWebSocket.instances[0].open();
      MockWebSocket.instances[0].receive({ type: "phase.inferred", data: { sessionId: "s1", phase: "implement" } });
    });
    expect(useWsStore.getState().phase).toBe("implement");
  });
});
```

- [ ] **Step 2: Run tests and confirm the two new/updated tests fail**

```bash
cd packages/web && pnpm test -- --reporter verbose
```

Expected: "opens connection without token in URL" FAILS (URL still has `?token=`); "sends auth message as first message on open" FAILS (no messages sent yet).

- [ ] **Step 3: Update `useWebSocket.ts`**

In `packages/web/src/hooks/useWebSocket.ts`, find the `connect` function (around line 17) and update the WebSocket constructor and `onopen` handler:

```ts
// Before
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
wsRef.current = ws;

ws.onopen = () => {
  setConnectionStatus("live");
  retryDelayRef.current = 1000;
};

// After
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
wsRef.current = ws;

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "auth", token }));
  setConnectionStatus("live");
  retryDelayRef.current = 1000;
};
```

- [ ] **Step 4: Run tests and confirm they all pass**

```bash
cd packages/web && pnpm test -- --reporter verbose
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useWebSocket.ts \
        packages/web/src/__tests__/useWebSocket.test.ts
git commit -m "feat(web): remove token from WS URL, use first-message auth"
```

---

## Task 4: Read bootstrap token from URL hash

**Files:**
- Modify: `packages/web/src/main.tsx`

No dedicated unit test — this is module-initialization code. Correct behaviour is confirmed by the hook tests passing (the token flows from `wsStore` into the WS connection).

- [ ] **Step 1: Update `main.tsx`**

In `packages/web/src/main.tsx`, replace the query-param token reading (lines 8–11):

```ts
// Before
const params = new URLSearchParams(window.location.search);
const port = window.location.port ? Number(window.location.port) : 47821;
const token = params.get("token") ?? "";
useWsStore.getState().setPort(port);
useWsStore.getState().setToken(token);

// After
const hash = new URLSearchParams(window.location.hash.slice(1));
const port = window.location.port ? Number(window.location.port) : 47821;
const token = hash.get("token") ?? "";
if (token) history.replaceState(null, "", window.location.pathname);
useWsStore.getState().setPort(port);
useWsStore.getState().setToken(token);
```

- [ ] **Step 2: Run the web test suite**

```bash
cd packages/web && pnpm test
```

Expected: all tests PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/main.tsx
git commit -m "feat(web): read auth token from URL hash fragment, strip immediately"
```

---

## Task 5: Update plugin open command and run full verification

**Files:**
- Modify: `plugin/commands/open.md`

- [ ] **Step 1: Update the URL in `open.md`**

In `plugin/commands/open.md`, find step 3 (the print block) and change the URL:

```
# Before
Open this URL in your browser:
http://127.0.0.1:<port>/?token=<token>

# After
Open this URL in your browser:
http://127.0.0.1:<port>/#token=<token>
```

- [ ] **Step 2: Run the full server test suite**

```bash
cd packages/server && bun test
```

Expected: all tests PASS.

- [ ] **Step 3: Run the full web test suite**

```bash
cd packages/web && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add plugin/commands/open.md
git commit -m "fix(plugin): use URL hash fragment instead of query param for dashboard token"
```

---

## Task 6: End-to-end verification via `/claude-control:open`

No files changed. This task confirms the full change is wired together correctly by running the actual plugin command and inspecting its output.

- [ ] **Step 1: Grep `open.md` to confirm the URL format at rest**

```bash
grep 'token' plugin/commands/open.md
```

Expected output must contain `#token=` and must NOT contain `?token=`:

```
http://127.0.0.1:<port>/#token=<token>
```

If `?token=` appears anywhere, Task 5 Step 1 was not applied correctly — stop and fix it before continuing.

- [ ] **Step 2: Invoke the `/claude-control:open` skill**

Use the `Skill` tool to invoke `claude-control:open`. The skill will:
1. Ensure the daemon is running
2. Read `~/.claude-control/runtime.json` for `port` and `token`
3. Print the dashboard URL

- [ ] **Step 3: Semantic check — verify `#token=` in the printed URL**

Inspect the URL printed by the skill. It must satisfy all of:

| Check | Expected |
|-------|----------|
| Scheme + host | `http://127.0.0.1:<port>/` |
| Token location | Fragment (`#`), not query string (`?`) |
| Format | `http://127.0.0.1:<port>/#token=<64-char-hex>` |
| Absence | The string `?token=` must not appear anywhere in the output |

If the URL still contains `?token=`, the `open.md` change from Task 5 did not take effect — verify the file was saved and re-run Task 5 Step 1.
