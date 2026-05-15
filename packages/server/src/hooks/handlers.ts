import type { Database } from "bun:sqlite";
import type { HookEvent } from "@cc/shared";
import type { Bus } from "../bus.ts";
import { persistEvent } from "../store/index.ts";

export async function dispatchEvent(
  event: HookEvent,
  db: Database,
  bus: Bus,
): Promise<Response> {
  persistEvent(db, event);
  bus.publish({ type: "hook", data: event });
  return new Response("{}", { status: 200 });
}
