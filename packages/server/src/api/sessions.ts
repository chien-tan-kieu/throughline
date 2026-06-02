// packages/server/src/api/sessions.ts
import type { Database } from "bun:sqlite";
import type { Bus } from "../bus.ts";
import type { EventRecord, Session } from "@cc/shared";

export async function mountSessionRoutes(
  req: Request,
  url: URL,
  db: Database,
  bus: Bus,
): Promise<Response> {
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

  if (req.method === "PATCH" && url.pathname === "/api/sessions/current") {
    let body: { active_story_id?: string | null };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const session = db
      .query<{ id: string }, []>(
        "SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1",
      )
      .get();
    if (!session) return Response.json({ error: "no session" }, { status: 404 });
    db.run("UPDATE sessions SET active_story_id = ? WHERE id = ?", [
      body.active_story_id ?? null,
      session.id,
    ]);
    bus.publish({
      type: "session.updated",
      data: { activeStoryId: body.active_story_id ?? null },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
