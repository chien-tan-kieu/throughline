// packages/server/src/api/index.ts
import type { Database } from "bun:sqlite";
import type { Bus } from "../bus.ts";
import type { HandoffService } from "../handoff/index.ts";
import type { StandupService } from "../standup/index.ts";
import type { StoryService } from "../stories/index.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { mountHandoffRoutes } from "./handoff.ts";
import { mountSessionRoutes } from "./sessions.ts";
import { mountStandupRoutes } from "./standup.ts";
import { mountStoryRoutes } from "./stories.ts";
import { mountSuperpowersRoutes } from "./superpowers.ts";

export interface ApiCtx {
  db: Database;
  bus: Bus;
  watcher: SuperpowersWatcher;
  stories: StoryService;
  standup: StandupService;
  handoff: HandoffService;
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
    return mountSessionRoutes(req, url, ctx.db, ctx.bus);
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
  if (url.pathname === "/api/standup") {
    return mountStandupRoutes(req, url, ctx.standup);
  }
  if (url.pathname.startsWith("/api/handoff")) {
    return mountHandoffRoutes(req, url, ctx.handoff);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
