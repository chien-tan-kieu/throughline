// packages/server/src/api/sessions.ts
import type { Database } from "bun:sqlite";
import type { EventRecord, Session } from "@cc/shared";

export function mountSessionRoutes(
  req: Request,
  url: URL,
  db: Database,
): Response {
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const sessions = db
      .query<Session, []>("SELECT * FROM sessions ORDER BY started_at DESC")
      .all();
    return Response.json(sessions);
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const session = db
      .query<Session, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    const events = db
      .query<EventRecord, [string]>(
        "SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT 50",
      )
      .all(id);
    return Response.json({ ...session, events });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const sessionFilter = url.searchParams.get("session");
    const since = Number(url.searchParams.get("since") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 200);
    const events = sessionFilter
      ? db
          .query<EventRecord, [string, number, number]>(
            "SELECT * FROM events WHERE session_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?",
          )
          .all(sessionFilter, since, limit)
      : db
          .query<EventRecord, [number, number]>(
            "SELECT * FROM events WHERE ts > ? ORDER BY ts ASC LIMIT ?",
          )
          .all(since, limit);
    const cursor = events.length > 0 ? events[events.length - 1].ts : since;
    return Response.json({ events, cursor });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
