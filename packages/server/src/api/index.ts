// packages/server/src/api/index.ts (temporary stub)
import type { Database } from "bun:sqlite";
import type { StoryService } from "../stories/index.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";

export interface ApiCtx {
  db: Database;
  watcher: SuperpowersWatcher;
  stories: StoryService;
}

export function mountApiRoutes(
  _req: Request,
  _url: URL,
  _ctx: ApiCtx,
): Response {
  return new Response("{}", { status: 501 });
}
