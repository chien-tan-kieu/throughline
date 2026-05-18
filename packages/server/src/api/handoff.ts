import type { Database } from "bun:sqlite";
import type { HandoffService } from "../handoff/index.ts";

const STORY_ID_REGEX = /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

export async function mountHandoffRoutes(
  req: Request,
  url: URL,
  handoff: HandoffService,
  db: Database,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/handoffs") {
    const rows = db
      .query<{ id: number; story_id: string; file_path: string; generated_at: number }, []>(
        `SELECT id, story_id, file_path, generated_at FROM handoffs ORDER BY generated_at DESC`,
      )
      .all();
    return Response.json(rows);
  }

  const match = url.pathname.match(/^\/api\/handoff\/(.+)$/);
  if (match && req.method === "POST") {
    const storyId = decodeURIComponent(match[1]);
    if (!STORY_ID_REGEX.test(storyId)) {
      return Response.json({ error: "invalid story ID" }, { status: 400 });
    }
    try {
      const result = await handoff.generate(storyId);
      return Response.json(result, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) return Response.json({ error: msg }, { status: 404 });
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
