import type { StandupService } from "../standup/index.ts";

export function mountStandupRoutes(
  req: Request,
  url: URL,
  standup: StandupService,
): Response {
  if (req.method === "GET" && url.pathname === "/api/standup") {
    const today = new Date().toISOString().slice(0, 10);
    const date = url.searchParams.get("date") ?? today;
    return Response.json(standup.generate(date));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
