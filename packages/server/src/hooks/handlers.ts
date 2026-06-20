import type { Database } from "bun:sqlite";
import type { HookEvent, Phase } from "@throughline/shared";
import type { Bus } from "../bus.ts";
import { persistEvent } from "../store/index.ts";

const SKILL_PHASE_MAP: Record<string, Phase> = {
  "superpowers:brainstorming": "brainstorm",
  "superpowers:writing-specs": "spec",
  "superpowers:writing-plans": "plan",
  "superpowers:executing-plans": "implement",
  "superpowers:subagent-driven-development": "implement",
};

export async function dispatchEvent(
  event: HookEvent,
  db: Database,
  bus: Bus,
): Promise<Response> {
  persistEvent(db, event);
  bus.publish({ type: "hook", data: event });

  if (event.hook_event_name === "PostToolUse" && event.tool_name === "Skill") {
    const skill = (event.tool_input as Record<string, unknown>).skill as string | undefined;
    const phase = skill ? SKILL_PHASE_MAP[skill] : undefined;
    if (phase) {
      bus.publish({ type: "phase.inferred", data: { sessionId: event.session_id, phase } });
    }
  }

  return new Response("{}", { status: 200 });
}
