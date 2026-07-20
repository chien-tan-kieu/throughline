import type { HandoffService } from "../handoff/index.ts";
import { isValidStoryId } from "../stories/index.ts";

function relativeAge(generatedAt: number, now: number): string {
  const diff = Math.max(0, now - generatedAt);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${minutes}m ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return `${hours}h ago`;
  return `${days}d ago`;
}

export async function mountHandoffRoutes(
  req: Request,
  url: URL,
  handoff: HandoffService,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/handoffs/latest") {
    const story = url.searchParams.get("story") ?? undefined;
    const result = await handoff.latestWithContext(story);
    if (!result) {
      return Response.json({ error: "no handoff found" }, { status: 404 });
    }

    const age = relativeAge(result.generated_at, Date.now());

    return Response.json({ ...result, age });
  }

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
      return Response.json(
        { error: `Story not found: ${storyId}` },
        { status: 404 },
      );
    }
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
