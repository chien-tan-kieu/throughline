// packages/server/src/api/stories.ts
import type { StoryPatch } from "@cc/shared";
import type { StoryService } from "../stories/index.ts";

export async function mountStoryRoutes(
  req: Request,
  url: URL,
  stories: StoryService,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/stories") {
    return Response.json(stories.list());
  }

  if (req.method === "POST" && url.pathname === "/api/stories") {
    let body: { title?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (!body.title || typeof body.title !== "string") {
      return Response.json({ error: "title required" }, { status: 400 });
    }
    const story = await stories.create(body.title);
    return Response.json(story, { status: 201 });
  }

  const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);
  if (storyMatch) {
    const id = decodeURIComponent(storyMatch[1]);

    if (req.method === "GET") {
      const detail = stories.get(id);
      if (!detail)
        return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(detail);
    }

    if (req.method === "PATCH") {
      let patch: StoryPatch;
      try {
        patch = await req.json();
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }
      const updated = await stories.update(id, patch);
      if (!updated)
        return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(updated);
    }

    if (req.method === "DELETE") {
      await stories.archive(id);
      return Response.json({});
    }
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
