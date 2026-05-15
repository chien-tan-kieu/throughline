// packages/server/src/api/index.ts
import type { Database } from "bun:sqlite";
import type { StoryService } from "../stories/index.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { mountSessionRoutes } from "./sessions.ts";
import { mountStoryRoutes } from "./stories.ts";
import { mountSuperpowersRoutes } from "./superpowers.ts";

export interface ApiCtx {
  db: Database;
  watcher: SuperpowersWatcher;
  stories: StoryService;
}

export function mountApiRoutes(
  req: Request,
  url: URL,
  ctx: ApiCtx,
): Response | Promise<Response> {
  if (
    url.pathname.startsWith("/api/sessions") ||
    url.pathname === "/api/events"
  ) {
    return mountSessionRoutes(req, url, ctx.db);
  }
  if (url.pathname.startsWith("/api/stories")) {
    return mountStoryRoutes(req, url, ctx.stories);
  }
  if (
    url.pathname.startsWith("/api/plans") ||
    url.pathname.startsWith("/api/specs")
  ) {
    return mountSuperpowersRoutes(req, url, ctx.watcher);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
