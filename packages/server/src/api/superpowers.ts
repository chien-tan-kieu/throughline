// packages/server/src/api/superpowers.ts
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { parseSpec } from "../superpowers/parser.ts";

function validatePath(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes("..")) return null;
  return decoded;
}

export function mountSuperpowersRoutes(
  req: Request,
  url: URL,
  watcher: SuperpowersWatcher,
): Response {
  const planMatch = url.pathname.match(/^\/api\/plans\/(.+)$/);
  if (req.method === "GET" && planMatch) {
    const path = validatePath(planMatch[1]);
    if (!path) return Response.json({ error: "invalid path" }, { status: 400 });
    const plan = watcher.getParsedPlan(path);
    if (!plan) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(plan);
  }

  const specMatch = url.pathname.match(/^\/api\/specs\/(.+)$/);
  if (req.method === "GET" && specMatch) {
    const path = validatePath(specMatch[1]);
    if (!path) return Response.json({ error: "invalid path" }, { status: 400 });
    const body = watcher.getSpecBody(path);
    if (!body) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(parseSpec(body, path));
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
