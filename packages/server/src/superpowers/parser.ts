export { parsePlan } from "@cc/shared";

export function parseSpec(
  content: string,
  path: string,
): { path: string; title: string; body: string } {
  const titleLine = content.split("\n").find((l) => l.startsWith("# "));
  const title = titleLine ? titleLine.slice(2).trim() : "";
  return { path, title, body: content };
}
