import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Extracts the changelog section for a given version from CHANGELOG.md content.
 * Returns the section body (without the heading line) trimmed, or "" if not found.
 *
 * @param {string} content - full CHANGELOG.md text
 * @param {string} versionTag - e.g. "v1.0.0" or "1.0.0"
 * @returns {string}
 */
export function extractChangelog(content, versionTag) {
  const ver = versionTag.replace(/^v/, "");
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines = [];

  for (const line of lines) {
    if (line.startsWith("## [") && line.includes(`[${ver}]`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) {
      break;
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n").trim();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const versionTag = process.argv[2];
  if (!versionTag) {
    process.stderr.write("Usage: node scripts/extract-changelog.mjs <version-tag>\n");
    process.exit(1);
  }
  const rootDir = process.argv[3] ?? process.cwd();
  const content = readFileSync(join(rootDir, "CHANGELOG.md"), "utf8");
  process.stdout.write(extractChangelog(content, versionTag) + "\n");
}
