import type { HandoffService } from "../handoff/index.ts";
import { isValidStoryId } from "../stories/index.ts";

export async function mountHandoffRoutes(
  req: Request,
  url: URL,
  handoff: HandoffService,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/handoffs") {
    const rows = handoff.list();
    return Response.json(rows);
  }

  const match = url.pathname.match(/^\/api\/handoff\/(.+)$/);
  if (match && req.method === "POST") {
    const storyId = decodeURIComponent(match[1]);
    if (!isValidStoryId(storyId)) {
      return Response.json({ error: "invalid story ID" }, { status: 400 });
    }
    const result = await handoff.generate(storyId);
    if (result === null) {
      return Response.json({ error: `Story not found: ${storyId}` }, { status: 404 });
    }
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
