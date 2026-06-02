import type { HookEvent, Phase, PlanTask } from "@cc/shared";

export type BusEvent =
  | { type: "hook"; data: HookEvent }
  | { type: "plan.changed"; data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed"; data: { path: string } }
  | {
      type: "story.changed";
      data: { id: string; op: "create" | "update" | "delete" };
    }
  | { type: "phase.inferred"; data: { sessionId: string; phase: Phase } }
  | { type: "session.updated"; data: { activeStoryId: string | null } };

type Handler = (event: BusEvent) => void;

export interface Bus {
  publish(event: BusEvent): void;
  subscribe(handler: Handler): () => void;
}

export function createBus(): Bus {
  const handlers = new Set<Handler>();
  return {
    publish(event) {
      for (const h of handlers) h(event);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

export const stubBus: Bus = {
  publish: () => {},
  subscribe: () => () => {},
};
