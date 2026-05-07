import { HookEventSchema, type HookEvent } from "@cc/shared";
import type { Database } from "bun:sqlite";
import type { Bus } from "../bus.ts";
import { dispatchEvent } from "./handlers.ts";

export async function handleHookEvent(
  _eventName: string,
  body: unknown,
  db: Database,
  bus: Bus
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

  return dispatchEvent(event, db, bus);
}
