// packages/server/src/hooks/index.ts
import type { Database } from "bun:sqlite";
import { type HookEvent, HookEventSchema } from "@throughline/shared";
import type { Bus } from "../bus.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { dispatchEvent } from "./handlers.ts";

export async function handleHookEvent(
  _eventName: string,
  body: unknown,
  db: Database,
  bus: Bus,
  watcher?: SuperpowersWatcher,
): Promise<Response> {
  let event: HookEvent;
  try {
    event = HookEventSchema.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    watcher &&
    event.hook_event_name === "PostToolUse" &&
    (event.tool_name === "Edit" || event.tool_name === "Write")
  ) {
    const input = event.tool_input as Record<string, unknown>;
    const filePath = (input.file_path ?? input.path) as string | undefined;
    if (filePath) {
      watcher.handleFileChange(filePath).catch(() => {});
    }
  }

  return dispatchEvent(event, db, bus);
}
