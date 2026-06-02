import type { WSOut } from "@cc/shared";
// packages/server/src/ws/index.ts
import type { Server as BunServer, ServerWebSocket } from "bun";
import type { Bus, BusEvent } from "../bus.ts";

export type WsData = { topics: Set<string>; authenticated: boolean };

export class WsServer {
  private sockets = new Set<ServerWebSocket<WsData>>();
  private unsubscribe: (() => void) | null = null;

  constructor(private bus: Bus, private token: string) {
    this.unsubscribe = bus.subscribe((event) => this.fanOut(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  upgrade(req: Request, server: BunServer): boolean {
    return server.upgrade<WsData>(req, {
      data: { topics: new Set(), authenticated: false },
    });
  }

  handleOpen(ws: ServerWebSocket<WsData>): void {
    this.sockets.add(ws);
  }

  handleClose(ws: ServerWebSocket<WsData>): void {
    this.sockets.delete(ws);
  }

  handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string; topics?: unknown; token?: unknown };

    if (!ws.data.authenticated) {
      if (m.type === "auth" && m.token === this.token) {
        ws.data.authenticated = true;
      } else {
        ws.close(4001, "Unauthorized");
      }
      return;
    }

    if (m.type === "subscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string") ws.data.topics.add(t);
    } else if (m.type === "unsubscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string") ws.data.topics.delete(t);
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" } satisfies WSOut));
    }
  }

  private fanOut(event: BusEvent): void {
    const pairs = this.toWsMessages(event);
    for (const [msg, topic] of pairs) {
      const json = JSON.stringify(msg);
      for (const ws of this.sockets) {
        if (ws.data.topics.has(topic)) ws.send(json);
      }
    }
  }

  private toWsMessages(event: BusEvent): Array<[WSOut, string]> {
    switch (event.type) {
      case "hook": {
        const out: WSOut = {
          type: "event",
          data: {
            id: 0,
            session_id: event.data.session_id,
            subagent_id: null,
            event_name: event.data.hook_event_name,
            payload_json: JSON.stringify(event.data),
            ts: Date.now(),
          },
        };
        return [
          [out, "events"],
          [out, `events:${event.data.session_id}`],
        ];
      }
      case "plan.changed":
        return [
          [
            { type: "plan.changed", data: event.data },
            `plan:${event.data.path}`,
          ],
        ];
      case "spec.changed":
        return [[{ type: "spec.changed", data: event.data }, "specs"]];
      case "story.changed":
        return [[{ type: "story.changed", data: event.data }, "stories"]];
      case "phase.inferred":
        return [[{ type: "phase.inferred", data: event.data }, "session"]];
      case "session.updated":
        return [[{ type: "session.updated", data: event.data }, "session"]];
    }
  }
}
