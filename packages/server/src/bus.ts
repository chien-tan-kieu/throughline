import type { HookEvent } from "@cc/shared";

export interface Bus {
  publish(event: HookEvent): void;
}

export const stubBus: Bus = { publish: () => {} };
