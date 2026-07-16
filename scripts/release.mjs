#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syncVersion } from "./sync-version.mjs";

export function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind: ${kind}`);
}

export function buildChangelogEntry(version, date, commitSubjects) {
  const lines =
    commitSubjects.length > 0
      ? commitSubjects.map((s) => `- ${s}`).join("\n")
      : "- No changes recorded.";
  return `## [${version}] - ${date}\n\n${lines}\n`;
}

async function main() {
  const kind = process.argv[2];
  if (!["patch", "minor", "major"].includes(kind)) {
    console.error("Usage: bun scripts/release.mjs -- <patch|minor|major>");
    process.exit(1);
  }

  const status = execSync("git status --porcelain").toString();
  if (status.trim().length > 0) {
    console.error("Working directory is not clean. Commit or stash changes first.");
    process.exit(1);
  }

  const rootDir = process.cwd();
  const pkgPath = join(rootDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const nextVersion = bumpVersion(pkg.version, kind);
  pkg.version = nextVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  await syncVersion(rootDir);

  let lastReleaseSha = "";
  try {
    lastReleaseSha = execSync('git log --grep="^chore: release v" -1 --format=%H').toString().trim();
  } catch {
    lastReleaseSha = "";
  }
  const range = lastReleaseSha ? `${lastReleaseSha}..HEAD` : "";
  const commitSubjects = execSync(`git log ${range} --pretty=format:%s`)
    .toString()
    .split("\n")
    .filter(Boolean);

  const date = new Date().toISOString().slice(0, 10);
  const entry = buildChangelogEntry(nextVersion, date, commitSubjects);

  const changelogPath = join(rootDir, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const insertAt = changelog.indexOf("\n## [");
  const updatedChangelog =
    insertAt === -1
      ? `${changelog.trimEnd()}\n\n${entry}\n`
      : `${changelog.slice(0, insertAt)}\n\n${entry}\n${changelog.slice(insertAt + 1)}`;
  writeFileSync(changelogPath, updatedChangelog, "utf8");

  execSync("git add -A");
  execSync(`git commit -m "chore: release v${nextVersion}"`);
  execSync("git push");

  console.log(`Released v${nextVersion} (pushed to main; CI will build and tag the dist artifact).`);
}

if (import.meta.main) {
  await main();
}
