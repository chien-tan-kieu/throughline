import type { HookEvent } from "./events.ts";
import type { PlanTask } from "./plan.ts";
import type { StorySize } from "./story.ts";

export type Phase = "brainstorm" | "spec" | "plan" | "implement";

export interface Session {
  id: string;
  cwd: string;
  model: string | null;
  agent_type: string | null;
  permission_mode: string;
  started_at: number;
  ended_at: number | null;
  status: string;
  inferred_phase: Phase | null;
  active_story_id: string | null;
  active_plan_path: string | null;
}

export interface EventRecord {
  id: number;
  session_id: string;
  subagent_id: string | null;
  event_name: string;
  payload_json: string;
  ts: number;
}

export type WSOut =
  | { type: "event"; data: EventRecord }
  | { type: "plan.changed"; data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed"; data: { path: string } }
  | {
      type: "story.changed";
      data: { id: string; op: "create" | "update" | "delete" };
    }
  | { type: "phase.inferred"; data: { sessionId: string; phase: Phase } }
  | { type: "session.updated"; data: { activeStoryId: string | null } }
  | { type: "pong" };

export type StandupItem = {
  storyId: string;
  title: string;
  size: StorySize | null;
  detail: string;
};

export type StandupDigest = {
  date: string;
  shipped: StandupItem[];
  inProgress: StandupItem[];
  blockers: StandupItem[];
};

// Exported for use in hooks/handlers.ts when publishing to Bus
export type { HookEvent };
