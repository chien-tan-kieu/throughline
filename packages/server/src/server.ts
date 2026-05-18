// packages/server/src/server.ts
import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import { join } from "node:path";
import type { ApiCtx } from "./api/index.ts";
import { mountApiRoutes } from "./api/index.ts";
import type { Bus } from "./bus.ts";
import { handleHookEvent } from "./hooks/index.ts";
import { RateLimiter, checkAuth } from "./security/index.ts";
import type { WsData, WsServer } from "./ws/index.ts";

export interface ServerConfig {
  port: number;
  token: string;
  db: Database;
  bus: Bus;
  onActivity?: () => void;
  rateLimit?: { limit: number; windowMs: number };
  wsServer?: WsServer;
  apiCtx?: ApiCtx;
}

export function createServer(config: ServerConfig): Server {
  const { token, db, bus } = config;
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit.limit, config.rateLimit.windowMs)
    : new RateLimiter();

  return Bun.serve<WsData>({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/healthz") {
        return Response.json({ status: "ok" });
      }

      if (req.method === "GET" && url.pathname === "/ws") {
        if (!config.wsServer) return new Response("Not Found", { status: 404 });
        const upgraded = config.wsServer.upgrade(req, server, token);
        if (upgraded) return undefined as unknown as Response;
        return new Response("Unauthorized", { status: 401 });
      }

      const authError = checkAuth(req, server.port, token);
      if (authError) return authError;

      const hookMatch = url.pathname.match(/^\/hooks\/(\w+)$/);
      if (req.method === "POST" && hookMatch) {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const sessionId = (body as Record<string, unknown>)?.session_id as
          | string
          | undefined;
        if (sessionId && !rateLimiter.allow(sessionId)) {
          return new Response("{}", { status: 200 });
        }
        config.onActivity?.();
        return handleHookEvent(
          hookMatch[1],
          body,
          db,
          bus,
          config.apiCtx?.watcher,
        );
      }

      if (url.pathname.startsWith("/api/")) {
        if (config.apiCtx) return mountApiRoutes(req, url, config.apiCtx);
        return new Response("{}", { status: 501 });
      }

      if (req.method === "GET") {
        const webDist = join(import.meta.dir, "../../../web/dist");
        const assetPath = url.pathname.startsWith("/assets/") ? url.pathname : "/index.html";
        const file = Bun.file(join(webDist, assetPath));
        if (await file.exists()) return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      message(ws, msg) {
        config.wsServer?.handleMessage(ws, msg);
      },
      open(ws) {
        config.wsServer?.handleOpen(ws);
      },
      close(ws) {
        config.wsServer?.handleClose(ws);
      },
    },
  });
}
