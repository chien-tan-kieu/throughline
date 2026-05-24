# Design: Fix auth token URL exposure

**Story:** US-2026-05-23-fix-auth-stop-exposing-token-via-url-in-  
**Date:** 2026-05-23  
**Status:** approved

## Problem

The claude-control dashboard URL currently embeds the auth token as a query parameter:

```
http://127.0.0.1:<port>/?token=<value>
```

This causes the token to appear in:
- Browser history (recorded on navigation)
- Server access logs (full URL is logged on GET request)
- The browser address bar

The WebSocket connection has the same problem:

```
ws://127.0.0.1:<port>/ws?token=<value>
```

HTTP API calls from the browser already use `Authorization: Bearer` headers and are not affected.

## Approach

Use a URL fragment for the initial bootstrap, and first-message authentication for WebSocket. This is appropriate for a localhost-only developer tool where XSS is not a realistic threat vector — the added complexity of HttpOnly session cookies is not proportionate to the risk.

## Data flow

```
open.md  ──►  http://127.0.0.1:<port>/#token=<value>
                    │
                    │  (fragment never sent to server)
                    ▼
             main.tsx
               • reads window.location.hash
               • stores token in Zustand wsStore
               • history.replaceState(null, '', '/') — strips immediately
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
   HTTP API calls          WebSocket
   Authorization:          connect to /ws (no token in URL)
   Bearer <token>          first message → { type:"auth", token }
   (unchanged)                  │
                                ▼
                     ws/index.ts
                       • upgrade() accepts all connections
                       • handleMessage() validates auth on first message
                       • closes ws with 4001 if invalid
```

## Component changes

### `plugin/commands/open.md`

Step 3 URL changes from `?token=` to `#token=`:

```
http://127.0.0.1:<port>/#token=<token>
```

### `packages/web/src/main.tsx`

Read token from hash instead of query params; strip URL immediately:

```ts
const hash = new URLSearchParams(window.location.hash.slice(1));
const token = hash.get("token") ?? "";
if (token) history.replaceState(null, "", window.location.pathname);
```

### `packages/web/src/hooks/useWebSocket.ts`

Connect without token in URL; send auth as first message on open:

```ts
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "auth", token }));
  setConnectionStatus("live");
  retryDelayRef.current = 1000;
};
```

### `packages/server/src/ws/index.ts`

- `WsData` gains `authenticated: boolean` (default `false`)
- Constructor receives `token: string`
- `upgrade()` removes token check — accepts all upgrade requests
- `handleMessage()` gates all logic behind authentication:
  - If not yet authenticated: accept `{ type: "auth", token }` → set `authenticated = true`; anything else → `ws.close(4001, "Unauthorized")`
  - If authenticated: existing subscribe/unsubscribe/ping logic unchanged

```ts
export type WsData = { topics: Set<string>; authenticated: boolean };

constructor(private bus: Bus, private token: string) { ... }

upgrade(req: Request, server: BunServer): boolean {
  return server.upgrade<WsData>(req, { data: { topics: new Set(), authenticated: false } });
}

handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
  // ... parse msg
  if (!ws.data.authenticated) {
    if (m.type === "auth" && m.token === this.token) {
      ws.data.authenticated = true;
    } else {
      ws.close(4001, "Unauthorized");
    }
    return;
  }
  // existing logic unchanged
}
```

### `packages/server/src/security/index.ts`

Remove query param fallback from `checkAuth`:

```ts
// before
const queryToken = url.searchParams.get("token") ?? "";
if (auth !== `Bearer ${token}` && queryToken !== token) { ... }

// after
if (auth !== `Bearer ${token}`) { ... }
```

### `packages/server/src/server.ts`

Update WS upgrade call site — remove `token` argument; update error response:

```ts
// before
const upgraded = config.wsServer.upgrade(req, server, token);
if (upgraded) return undefined as unknown as Response;
return new Response("Unauthorized", { status: 401 });

// after
const upgraded = config.wsServer.upgrade(req, server);
if (upgraded) return undefined as unknown as Response;
return new Response("WebSocket upgrade failed", { status: 400 });
```

## Tests

No new test files. Update existing tests in place:

| File | Changes |
|------|---------|
| `server/src/security/__tests__/security.test.ts` | Remove "query token accepted" case; add "query token rejected" case |
| `server/src/ws/__tests__/ws.test.ts` | Update upgrade to not require token; add first-message auth cases: valid auth, invalid first message closes with 4001, non-auth first message closes |
| `web/src/__tests__/useWebSocket.test.ts` | Update WS URL assertion (no token); assert `{ type:"auth", token }` sent on open |

## Acceptance criteria mapping

| Criterion | How met |
|-----------|---------|
| Token no longer in query param | Hash fragment; no `?token=` anywhere |
| Dashboard URL clean in address bar | `history.replaceState` strips fragment before user sees it |
| Secure transport mechanism | Bearer header (HTTP), first-message auth (WS) |
| Not in browser history | `replaceState` updates the history entry |
| Not in server access logs | Fragment never sent to server |
| All token-in-URL API calls updated | WS now uses first-message auth |
| Existing sessions continue to work | No runtime.json or token format changes |
| README updated | `plugin/commands/open.md` updated |
