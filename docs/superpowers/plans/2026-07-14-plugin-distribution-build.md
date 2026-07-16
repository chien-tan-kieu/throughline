# Plugin Distribution Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop shipping the entire monorepo as the installable plugin artifact — build a curated `dist` branch (built server bundle + built web assets + plugin resources only) on every release, tagged once per release, and remove `release-it` in favor of a plain release script.

**Architecture:** A new `scripts/release.mjs` replaces `release-it` for the local bump/changelog/commit/push flow on `main` (no tag created there). Pushing a `chore: release vX.Y.Z` commit to `main` triggers `.github/workflows/release.yml`, which runs the existing test suite, bundles the server (`bun build --compile`-free, just `bun build --target=bun`) and web dashboard, assembles a curated tree, force-pushes it to `dist`, tags that commit `vX.Y.Z` (the only tag in the repo for that release), and creates the GitHub Release. A source-level fix (`DaemonOptions.webDistPath` + `THROUGHLINE_WEB_DIST` env var) corrects a path-resolution bug that bundling would otherwise introduce. `bootstrap.sh` and `ensure-daemon.sh` are updated to run the bundled `bin/server.js` when running from a `dist`-branch install (no source present), while dev via `--plugin-dir ./plugin` on `main` is untouched.

**Tech Stack:** Bun (runtime, test runner, bundler), bash (hook/command scripts), GitHub Actions.

## Global Constraints

- Bun only — no `npm`/`pnpm` commands anywhere in scripts or CI (per `CLAUDE.md`).
- No new npm dependencies introduced (`bumpVersion` is plain string math, not a `semver` package).
- TDD mandatory for all new/changed behavior (per `plugin/constitution.md`) — every task with executable-code changes writes a failing test first. Shell-script-only and CI-YAML-only tasks are the documented exception (no existing test harness covers `plugin/hooks/*.sh` or `.github/workflows/*.yml` in this repo today); those are verified by manual dry run instead, called out explicitly in each such task.
- Do not commit, push, or delete `.release-it.json` (or anything else) until told to in the session executing this plan — each task's commit step is part of the plan's own flow, not a standing authorization to push to a remote or open a PR.
- Server code changes must not alter existing test-covered behavior (dev's default `webDistPath`/`MIGRATIONS_DIR` resolution stays exactly as-is).

---

### Task 1: Extend `sync-version.mjs` to sync `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`

**Files:**
- Modify: `scripts/sync-version.mjs`
- Test: `scripts/__tests__/sync-version.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `syncVersion(rootDir: string): Promise<void>` (existing export, extended behavior) — Task 3's `release.mjs` calls this directly.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/sync-version.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncVersion } from "../sync-version.mjs";

async function makeFixture(version: string) {
  const root = await mkdtemp(join(tmpdir(), "sync-version-"));

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "throughline", version }, null, 2),
  );

  for (const pkg of ["server", "web", "shared"]) {
    await mkdir(join(root, `packages/${pkg}`), { recursive: true });
    await writeFile(
      join(root, `packages/${pkg}/package.json`),
      JSON.stringify({ name: `@throughline/${pkg}`, version: "0.0.0" }, null, 2),
    );
  }

  await mkdir(join(root, "packages/server/src"), { recursive: true });
  await writeFile(
    join(root, "packages/server/src/index.ts"),
    'const VERSION = "0.0.0";\n\nexport {};\n',
  );

  await mkdir(join(root, "plugin"), { recursive: true });
  await writeFile(
    join(root, "plugin/plugin.json"),
    JSON.stringify({ name: "throughline", version: "0.0.0" }, null, 2),
  );

  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(root, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "throughline", version: "0.0.0" }, null, 2),
  );
  await writeFile(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify(
      {
        name: "throughline",
        plugins: [{ name: "throughline", version: "0.0.0", source: "./" }],
      },
      null,
      2,
    ),
  );

  return root;
}

describe("syncVersion", () => {
  test("propagates version to all derived locations, including .claude-plugin files", async () => {
    const root = await makeFixture("2.3.4");

    await syncVersion(root);

    for (const pkg of ["server", "web", "shared"]) {
      const pkgJson = JSON.parse(
        await readFile(join(root, `packages/${pkg}/package.json`), "utf8"),
      );
      expect(pkgJson.version).toBe("2.3.4");
    }

    const pluginJson = JSON.parse(await readFile(join(root, "plugin/plugin.json"), "utf8"));
    expect(pluginJson.version).toBe("2.3.4");

    const indexContent = await readFile(join(root, "packages/server/src/index.ts"), "utf8");
    expect(indexContent).toContain('const VERSION = "2.3.4";');

    const claudePluginJson = JSON.parse(
      await readFile(join(root, ".claude-plugin/plugin.json"), "utf8"),
    );
    expect(claudePluginJson.version).toBe("2.3.4");

    const marketplaceJson = JSON.parse(
      await readFile(join(root, ".claude-plugin/marketplace.json"), "utf8"),
    );
    expect(marketplaceJson.plugins[0].version).toBe("2.3.4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/sync-version.test.ts`
Expected: FAIL on the `claudePluginJson.version` / `marketplaceJson.plugins[0].version` assertions (still `"0.0.0"`), since `syncVersion` doesn't touch those files yet.

- [ ] **Step 3: Implement**

Edit `scripts/sync-version.mjs`, adding after the existing `plugin/plugin.json` block (before the `packages/server/src/index.ts` block, order doesn't matter):

```js
  const claudePluginPath = join(rootDir, ".claude-plugin/plugin.json");
  const claudePluginJson = JSON.parse(readFileSync(claudePluginPath, "utf8"));
  claudePluginJson.version = version;
  writeFileSync(claudePluginPath, JSON.stringify(claudePluginJson, null, 2) + "\n", "utf8");

  const marketplacePath = join(rootDir, ".claude-plugin/marketplace.json");
  const marketplaceJson = JSON.parse(readFileSync(marketplacePath, "utf8"));
  const throughlinePlugin = marketplaceJson.plugins.find((p) => p.name === "throughline");
  throughlinePlugin.version = version;
  writeFileSync(marketplacePath, JSON.stringify(marketplaceJson, null, 2) + "\n", "utf8");
```

Also update the doc comment at the top of the file to list the two new derived locations, matching the existing comment style.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/sync-version.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-version.mjs scripts/__tests__/sync-version.test.ts
git commit -m "feat: sync version into .claude-plugin manifest files"
```

---

### Task 2: Fix `webDistPath` resolution for the bundled production build

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/src/__tests__/daemon.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `createServer(config: ServerConfig)` from `../server.ts` (`webDistPath?: string` already exists on `ServerConfig` — no change needed there).
- Produces: `DaemonOptions.webDistPath?: string`, threaded through to `createServer`. Later tasks (bootstrap.sh, ensure-daemon.sh) rely on the entrypoint reading `process.env.THROUGHLINE_WEB_DIST`.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/__tests__/daemon.test.ts` (new `describe` block, alongside the existing ones — add the needed imports for `mkdir`/`writeFile` at the top if not already present):

```ts
describe("startDaemon with custom webDistPath", () => {
  test("serves index.html from the provided webDistPath instead of the default", async () => {
    const dataDir = join(tmpdir(), `cc-webdist-data-${Date.now()}`);
    const webDistPath = join(tmpdir(), `cc-webdist-assets-${Date.now()}`);
    await mkdir(webDistPath, { recursive: true });
    await writeFile(
      join(webDistPath, "index.html"),
      "<!doctype html><html><body>CUSTOM-MARKER</body></html>",
    );

    const handle = await startDaemon({ port: 0, dataDir, webDistPath });
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/`, {
        headers: { Host: `127.0.0.1:${handle.port}` },
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("CUSTOM-MARKER");
    } finally {
      await handle.stop();
    }
  });
});
```

Update the top-of-file import to include `mkdir` and `writeFile`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && bun test src/__tests__/daemon.test.ts`
Expected: FAIL — response body won't contain `CUSTOM-MARKER` (daemon falls back to the default `packages/web/dist`, or 404s if that doesn't exist in the test sandbox), because `webDistPath` isn't threaded through yet.

- [ ] **Step 3: Implement**

Edit `packages/server/src/index.ts`:

Add `webDistPath` to the options interface:

```ts
export interface DaemonOptions {
  port?: number;
  portRangeStart?: number;
  dataDir?: string;
  cwd?: string;
  rateLimit?: { limit: number; windowMs: number };
  webDistPath?: string;
}
```

Pass it through in the `createServer` call inside `startDaemon`:

```ts
      server = createServer({
        port,
        token,
        db,
        bus,
        wsServer,
        apiCtx,
        version: VERSION,
        webDistPath: options.webDistPath,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit,
      });
```

Update the production entrypoint at the bottom of the file to read the env var:

```ts
if (import.meta.main) {
  await startDaemon({ webDistPath: process.env.THROUGHLINE_WEB_DIST });
  console.log("Throughline daemon started.");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && bun test src/__tests__/daemon.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Run the full server suite to check for regressions**

Run: `cd packages/server && bun test`
Expected: PASS (no change to default behavior for existing tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts packages/server/src/__tests__/daemon.test.ts
git commit -m "feat: thread webDistPath through startDaemon for bundled production builds"
```

---

### Task 3: Replace `release-it` with `scripts/release.mjs`

**Files:**
- Create: `scripts/release.mjs`
- Test: `scripts/__tests__/release.test.ts` (new)

**Interfaces:**
- Consumes: `syncVersion(rootDir)` from `./sync-version.mjs` (Task 1).
- Produces: `bumpVersion(current: string, kind: "patch" | "minor" | "major"): string` and `buildChangelogEntry(version: string, date: string, commitSubjects: string[]): string` — exported for the test; not consumed by other tasks.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/release.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { bumpVersion, buildChangelogEntry } from "../release.mjs";

describe("bumpVersion", () => {
  test("patch increments the third segment", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  });

  test("minor increments the second segment and resets patch", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  test("major increments the first segment and resets minor and patch", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("throws on an unknown bump kind", () => {
    expect(() => bumpVersion("1.2.3", "bogus")).toThrow("Unknown bump kind: bogus");
  });
});

describe("buildChangelogEntry", () => {
  test("formats a heading and bullet list from commit subjects", () => {
    const entry = buildChangelogEntry("1.3.0", "2026-07-14", ["feat: add X", "fix: correct Y"]);
    expect(entry).toBe("## [1.3.0] - 2026-07-14\n\n- feat: add X\n- fix: correct Y\n");
  });

  test("falls back to a placeholder line when there are no commits", () => {
    const entry = buildChangelogEntry("1.3.1", "2026-07-15", []);
    expect(entry).toBe("## [1.3.1] - 2026-07-15\n\n- No changes recorded.\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/release.test.ts`
Expected: FAIL with a module-not-found error (`scripts/release.mjs` doesn't exist yet).

- [ ] **Step 3: Implement**

Create `scripts/release.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/release.test.ts`
Expected: PASS (all four `bumpVersion` cases, both `buildChangelogEntry` cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release.test.ts
git commit -m "feat: add plain release script to replace release-it"
```

---

### Task 4: Remove `release-it` from root `package.json` and delete `.release-it.json`

**Files:**
- Modify: `package.json` (root)
- Delete: `.release-it.json`

**Interfaces:**
- Consumes: `scripts/release.mjs` (Task 3).
- Produces: nothing consumed by later tasks.

This is a config-only change (dependency removal, script rewire) — no behavior to unit test beyond "the project still installs and the script runs," verified manually below.

- [ ] **Step 1: Edit root `package.json`**

Remove `"release-it": "^20.2.0"` and `"@release-it/conventional-changelog": "^11.0.1"` from `devDependencies`. Change the `"release"` script:

```json
"release": "bun scripts/release.mjs --"
```

- [ ] **Step 2: Delete `.release-it.json`**

```bash
rm .release-it.json
```

- [ ] **Step 3: Reinstall and verify the workspace is still consistent**

Run: `bun install`
Expected: completes without error; `bun.lock` updates to drop the two removed packages.

- [ ] **Step 4: Manually verify the release script's `--help`-equivalent path**

Run: `bun scripts/release.mjs --` (no argument)
Expected: prints `Usage: bun scripts/release.mjs -- <patch|minor|major>` and exits non-zero — confirms the script is wired up and reachable via the new root script name, without actually cutting a release.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: remove release-it in favor of scripts/release.mjs"
```

(`.release-it.json`'s deletion is included in this same commit via `git add -A` if preferred, or add it explicitly: `git add .release-it.json`.)

---

### Task 5: Update `bootstrap.sh` for the bundled production path

**Files:**
- Modify: `plugin/hooks/bootstrap.sh`

**Interfaces:**
- Consumes: `bin/server.js` and `bin/web/` (produced by Task 7's CI build — this task only changes what bootstrap.sh *would* run if those existed; it can be written and manually verified now with a stub).

No existing test harness covers `plugin/hooks/*.sh` in this repo (confirmed: no test file references `bootstrap.sh`). This task is verified by manual dry run, not `bun:test`.

- [ ] **Step 1: Edit `plugin/hooks/bootstrap.sh`**

Replace the `else` branch of the existing `if [ -f "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" ]; then ... else ... fi` block:

```bash
if [ -f "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" ]; then
  if [ ! -d "$CLAUDE_PLUGIN_ROOT/node_modules/@throughline/shared" ]; then
    (cd "$CLAUDE_PLUGIN_ROOT" && bun install --frozen-lockfile) >> "$LOG" 2>&1
  fi
  bun run "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  THROUGHLINE_WEB_DIST="$CLAUDE_PLUGIN_ROOT/bin/web" \
    bun run "$CLAUDE_PLUGIN_ROOT/bin/server.js" >> "$LOG" 2>&1 &
fi
```

(The `if` branch — dev/source mode — is unchanged.)

- [ ] **Step 2: Manual dry run against a stubbed production layout**

```bash
mkdir -p /tmp/cc-dist-dryrun/bin/web
cat > /tmp/cc-dist-dryrun/bin/server.js <<'EOF'
console.log("web dist:", process.env.THROUGHLINE_WEB_DIST);
console.log("stub daemon exiting immediately");
EOF
echo "<!doctype html><body>stub</body>" > /tmp/cc-dist-dryrun/bin/web/index.html
CLAUDE_PLUGIN_ROOT=/tmp/cc-dist-dryrun CLAUDE_PROJECT_DIR=/tmp/cc-dist-dryrun-proj bash plugin/hooks/bootstrap.sh
cat /tmp/cc-dist-dryrun-proj/.throughline/daemon.log
```

Expected: the log shows `web dist: /tmp/cc-dist-dryrun/bin/web` and `stub daemon exiting immediately` — confirms the `else` branch invokes `bin/server.js` with `THROUGHLINE_WEB_DIST` set correctly, since `/tmp/cc-dist-dryrun/packages/server/src/index.ts` doesn't exist.

- [ ] **Step 3: Commit**

```bash
git add plugin/hooks/bootstrap.sh
git commit -m "fix: run bundled bin/server.js in bootstrap.sh's production path"
```

---

### Task 6: Fix `ensure-daemon.sh`'s missing dev/prod fallback

**Files:**
- Modify: `plugin/commands/lib/ensure-daemon.sh`

**Interfaces:**
- Consumes: same `bin/server.js` / `bin/web/` layout as Task 5.

This is a pre-existing gap (this script never had `bootstrap.sh`'s fallback, so it would already fail against a binary-only install). No existing test harness covers it; verified by manual dry run.

- [ ] **Step 1: Edit `plugin/commands/lib/ensure-daemon.sh`**

Replace this line:

```bash
bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
```

with:

```bash
if [ -f "$ROOT/packages/server/src/index.ts" ]; then
  bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  THROUGHLINE_WEB_DIST="$ROOT/bin/web" \
    bun run "$ROOT/bin/server.js" >> "$LOG" 2>&1 &
fi
```

- [ ] **Step 2: Manual dry run against a stubbed production layout**

Reuse the stub from Task 5's Step 2 (`/tmp/cc-dist-dryrun/bin/server.js` and `bin/web/index.html`). Simulate the `known_marketplaces.json` lookup this script does:

```bash
mkdir -p /tmp/cc-known-marketplaces-home/.claude/plugins
cat > /tmp/cc-known-marketplaces-home/.claude/plugins/known_marketplaces.json <<'EOF'
{"throughline-local": {"installLocation": "/tmp/cc-dist-dryrun"}}
EOF
HOME=/tmp/cc-known-marketplaces-home bash plugin/commands/lib/ensure-daemon.sh
```

Expected: the script resolves `ROOT=/tmp/cc-dist-dryrun`, sees no `packages/server/src/index.ts` there, and runs the `bin/server.js` branch (verify via the same daemon.log pattern as Task 5, or by temporarily adding a diagnostic `echo` before the `for` loop if the real probe logic makes this hard to observe directly — remove any temporary diagnostics before committing).

- [ ] **Step 3: Commit**

```bash
git add plugin/commands/lib/ensure-daemon.sh
git commit -m "fix: add missing dev/prod fallback to ensure-daemon.sh"
```

---

### Task 7: Rewrite `.github/workflows/release.yml` to build and publish the `dist` branch

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `bun run build` (root script, unchanged), `packages/server/migrations`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `plugin/` (commands, hooks, skills, constitution.md), `scripts/extract-changelog.mjs` (unchanged).
- Produces: the `dist` branch and its `vX.Y.Z` tag, consumed by end users' `known_marketplaces.json` entries (Task 8 documents this).

CI YAML has no unit-test harness in this repo; verified by an actual release (see Step 2's note) rather than `bun:test`.

- [ ] **Step 1: Replace the full contents of `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    if: startsWith(github.event.head_commit.message, 'chore: release v')
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - run: bun test --passWithNoTests
        working-directory: packages/server

      - run: bun run test
        working-directory: packages/web
        env:
          CI: true

      - name: Read version
        id: version
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Build server bundle
        run: bun build ./packages/server/src/index.ts --outfile=dist-tree/bin/server.js --target=bun

      - name: Build web dashboard
        run: bun run build

      - name: Assemble dist tree
        run: |
          mkdir -p dist-tree/bin
          cp -r packages/web/dist dist-tree/bin/web
          cp -r packages/server/migrations dist-tree/migrations
          mkdir -p dist-tree/.claude-plugin
          cp .claude-plugin/plugin.json dist-tree/.claude-plugin/plugin.json
          cp .claude-plugin/marketplace.json dist-tree/.claude-plugin/marketplace.json
          cp -r plugin dist-tree/plugin
          rm -f dist-tree/plugin/plugin.json

      - name: Publish dist branch and tag
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="v${{ steps.version.outputs.version }}"
          cd dist-tree
          git init -q
          git checkout -q -b dist
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -q -m "dist: $VERSION"
          git tag "$VERSION"
          git push --force "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" HEAD:dist
          git push --force "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" "$VERSION"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="v${{ steps.version.outputs.version }}"
          NOTES=$(node scripts/extract-changelog.mjs "$VERSION")
          gh release create "$VERSION" \
            --title "$VERSION" \
            --target dist \
            --notes "$NOTES"
```

- [ ] **Step 2: Manual verification note**

This workflow can only be fully verified by an actual release (pushing a real `chore: release vX.Y.Z` commit via `scripts/release.mjs` from Task 3/4, in a session where the user has explicitly asked for a release to be cut). Do not trigger this as part of implementing this plan — flag it as the outstanding verification step for whenever the next real release happens, per the spec's Section 6 point 4.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: build and publish curated dist branch on release"
```

---

### Task 8: Document the new install path in `plugin/README.md`

**Files:**
- Modify: `plugin/README.md`

**Interfaces:**
- Consumes: nothing (docs only).

Docs-only change — no test.

- [ ] **Step 1: Add an "Installing (end users)" section**

Insert this new section into `plugin/README.md`, right after the introductory paragraph and before the existing `## Local development` heading:

```markdown
## Installing (end users)

Add a marketplace entry pointing at this repo's `dist` branch — a curated
build (bundled server, built web assets, plugin resources only; no source,
tests, or dev tooling):

\`\`\`json
{
  "throughline": {
    "source": { "source": "github", "repo": "chien-tan-kieu/throughline", "ref": "dist" },
    "installLocation": "..."
  }
}
\`\`\`

Use `"ref": "dist"` to always track the latest release, or pin to an exact
past release with `"ref": "vX.Y.Z"`. List available versions with:

\`\`\`bash
git ls-remote --tags https://github.com/chien-tan-kieu/throughline
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add plugin/README.md
git commit -m "docs: document dist-branch install and version pinning"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (branch/tag) → Task 7. Section 2 (release-it removal) → Tasks 3–4. Section 3 (build pipeline + webDistPath fix + version-sync fix) → Tasks 1, 2, 7. Section 4 (runtime scripts) → Tasks 5–6. Section 5 (docs) → Task 8. Section 6 (verification) → the manual-dry-run steps folded into Tasks 5–7.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and runnable as written.
- **Type/name consistency:** `syncVersion(rootDir)` (Task 1) called identically in Task 3's `release.mjs`. `webDistPath` named identically across `DaemonOptions` (Task 2), `bootstrap.sh`/`ensure-daemon.sh`'s `THROUGHLINE_WEB_DIST` env var (Tasks 5–6), and the CI build's `bin/web` path (Task 7) — all four agree on the same directory name and env var spelling.
