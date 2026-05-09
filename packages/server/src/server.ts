import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import type { Bus } from "./bus.ts";
import { handleHookEvent } from "./hooks/index.ts";
import { RateLimiter, checkAuth } from "./security/index.ts";

export interface ServerConfig {
  port: number;
  token: string;
  db: Database;
  bus: Bus;
  onActivity?: () => void;
  rateLimit?: { limit: number; windowMs: number };
}

export function createServer(config: ServerConfig): Server {
  const { token, db, bus } = config;
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit.limit, config.rateLimit.windowMs)
    : new RateLimiter();

  return Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/healthz") {
        return Response.json({ status: "ok" });
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
        return handleHookEvent(hookMatch[1], body, db, bus);
      }

      if (url.pathname.startsWith("/api/")) {
        return new Response("{}", { status: 501 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
