# Versioning and Release Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated versioning, changelog generation, CI/CD pipelines, and version surfacing across the daemon API, dashboard UI, and status command.

**Architecture:** Root `package.json` is the single version source of truth; `scripts/sync-version.mjs` propagates it to all five derived locations on each release via a `release-it` hook. GitHub Actions handles test gating and GitHub release creation. The `GET /api/status` endpoint exposes the running version; the dashboard Topbar consumes it; and the `claude-control:status` command prints it from `runtime.json`.

**Tech Stack:** `release-it` + `@release-it/conventional-changelog` for release automation; GitHub Actions with `oven-sh/setup-bun@v2`; Bun test (server), Vitest (web).

---

### Task 1: Set version baseline to 1.0.0

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/server/package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/server/src/index.ts:22`

- [ ] **Step 1: Update all version fields**

In `package.json` (root), change `"version": "0.1.0"` to `"version": "1.0.0"`.

In `packages/server/package.json`, change `"version": "0.1.0"` to `"version": "1.0.0"`.

In `packages/web/package.json`, change `"version": "0.1.0"` to `"version": "1.0.0"`.

In `packages/shared/package.json`, change `"version": "0.1.0"` to `"version": "1.0.0"`.

In `packages/server/src/index.ts`, change line 22 from:
```ts
const VERSION = "0.2.0";
```
to:
```ts
const VERSION = "1.0.0";
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
cd packages/server && bun test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add package.json packages/server/package.json packages/web/package.json packages/shared/package.json packages/server/src/index.ts
git commit -m "chore: set version baseline to 1.0.0"
```

---

### Task 2: Create `scripts/extract-changelog.mjs` with tests

**Files:**
- Create: `scripts/extract-changelog.mjs`
- Create: `packages/server/__tests__/extract-changelog.test.ts`

- [ ] **Step 1: Create the `scripts/` directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Write failing test**

Create `packages/server/__tests__/extract-changelog.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { extractChangelog } from "../../../scripts/extract-changelog.mjs";

const FIXTURE = `# Changelog

## [1.1.0] - 2026-07-01

### Added
- New feature

## [1.0.0] - 2026-06-02

### Initial release
- First feature
- Second feature

## [0.9.0] - 2026-05-01

### Added
- Old feature
`;

describe("extractChangelog", () => {
  test("extracts section for matching version", () => {
    const result = extractChangelog(FIXTURE, "v1.0.0");
    expect(result).toContain("### Initial release");
    expect(result).toContain("First feature");
    expect(result).not.toContain("New feature");
    expect(result).not.toContain("Old feature");
  });

  test("accepts version without v prefix", () => {
    const result = extractChangelog(FIXTURE, "1.0.0");
    expect(result).toContain("### Initial release");
  });

  test("returns empty string when version not found", () => {
    expect(extractChangelog(FIXTURE, "v9.9.9")).toBe("");
  });

  test("extracts the most recent version section", () => {
    const result = extractChangelog(FIXTURE, "v1.1.0");
    expect(result).toContain("New feature");
    expect(result).not.toContain("First feature");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/server && bun test __tests__/extract-changelog.test.ts
```

Expected: FAIL with import/module error (file does not exist yet).

- [ ] **Step 4: Create `scripts/extract-changelog.mjs`**

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/server && bun test __tests__/extract-changelog.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-changelog.mjs packages/server/__tests__/extract-changelog.test.ts
git commit -m "feat: add extract-changelog script"
```

---

### Task 3: Create `scripts/sync-version.mjs` with tests

**Files:**
- Create: `scripts/sync-version.mjs`
- Create: `packages/server/__tests__/sync-version.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/server/__tests__/sync-version.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncVersion } from "../../../scripts/sync-version.mjs";

function makeTempRepo(version: string): string {
  const root = join(tmpdir(), `cc-sync-test-${Date.now()}`);
  mkdirSync(join(root, "packages/server/src"), { recursive: true });
  mkdirSync(join(root, "packages/web"), { recursive: true });
  mkdirSync(join(root, "packages/shared"), { recursive: true });
  mkdirSync(join(root, "plugin"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "claude-control", version, private: true }, null, 2) + "\n",
  );

  for (const pkg of ["server", "web", "shared"]) {
    writeFileSync(
      join(root, `packages/${pkg}/package.json`),
      JSON.stringify({ name: `@cc/${pkg}`, version: "0.0.0" }, null, 2) + "\n",
    );
  }

  writeFileSync(
    join(root, "plugin/plugin.json"),
    JSON.stringify({ name: "claude-control", version: "0.0.0" }, null, 2) + "\n",
  );

  writeFileSync(
    join(root, "packages/server/src/index.ts"),
    `const VERSION = "0.0.0";\nexport { VERSION };\n`,
  );

  return root;
}

describe("syncVersion", () => {
  test("propagates root package.json version to all derived locations", async () => {
    const root = makeTempRepo("2.3.4");
    await syncVersion(root);

    const serverPkg = JSON.parse(readFileSync(join(root, "packages/server/package.json"), "utf8"));
    expect(serverPkg.version).toBe("2.3.4");

    const webPkg = JSON.parse(readFileSync(join(root, "packages/web/package.json"), "utf8"));
    expect(webPkg.version).toBe("2.3.4");

    const sharedPkg = JSON.parse(readFileSync(join(root, "packages/shared/package.json"), "utf8"));
    expect(sharedPkg.version).toBe("2.3.4");

    const pluginJson = JSON.parse(readFileSync(join(root, "plugin/plugin.json"), "utf8"));
    expect(pluginJson.version).toBe("2.3.4");

    const indexTs = readFileSync(join(root, "packages/server/src/index.ts"), "utf8");
    expect(indexTs).toContain('const VERSION = "2.3.4"');
  });

  test("preserves other fields when updating package.json files", async () => {
    const root = makeTempRepo("1.2.0");
    await syncVersion(root);

    const serverPkg = JSON.parse(readFileSync(join(root, "packages/server/package.json"), "utf8"));
    expect(serverPkg.name).toBe("@cc/server");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test __tests__/sync-version.test.ts
```

Expected: FAIL with import/module error (file does not exist yet).

- [ ] **Step 3: Create `scripts/sync-version.mjs`**

```js
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the version from root package.json and propagates it to all derived locations.
 *
 * Derived locations:
 *   packages/server/package.json
 *   packages/web/package.json
 *   packages/shared/package.json
 *   plugin/plugin.json
 *   packages/server/src/index.ts  (const VERSION = "..." literal)
 *
 * @param {string} rootDir - repo root directory
 */
export async function syncVersion(rootDir) {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const { version } = rootPkg;

  for (const pkg of ["server", "web", "shared"]) {
    const pkgPath = join(rootDir, `packages/${pkg}/package.json`);
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkgJson.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf8");
  }

  const pluginPath = join(rootDir, "plugin/plugin.json");
  const pluginJson = JSON.parse(readFileSync(pluginPath, "utf8"));
  pluginJson.version = version;
  writeFileSync(pluginPath, JSON.stringify(pluginJson, null, 2) + "\n", "utf8");

  const indexPath = join(rootDir, "packages/server/src/index.ts");
  const indexContent = readFileSync(indexPath, "utf8");
  const updated = indexContent.replace(
    /^const VERSION = "[^"]*";/m,
    `const VERSION = "${version}";`,
  );
  writeFileSync(indexPath, updated, "utf8");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await syncVersion(process.argv[2] ?? process.cwd());
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/server && bun test __tests__/sync-version.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-version.mjs packages/server/__tests__/sync-version.test.ts
git commit -m "feat: add sync-version script"
```

---

### Task 4: Create CHANGELOG.md and plugin/plugin.json

**Files:**
- Create: `CHANGELOG.md`
- Create: `plugin/plugin.json`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-02

### Initial release

First formal versioned release of claude-control. Includes:

- Daemon server with HTTP API and WebSocket support
- Story management (CRUD, board view, status filtering)
- Real-time story sync via file watcher
- Superpowers skill integration (brainstorming, TDD, planning)
- Dashboard web UI
- Versioning and release mechanism (this change)
```

- [ ] **Step 2: Create `plugin/plugin.json`**

```json
{
  "name": "claude-control",
  "description": "AI-driven project management and story tracking for Claude Code",
  "version": "1.0.0",
  "author": {
    "name": "chien-tan-kieu"
  },
  "homepage": "https://github.com/chien-tan-kieu/claude-control",
  "repository": "https://github.com/chien-tan-kieu/claude-control",
  "license": "MIT"
}
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md plugin/plugin.json
git commit -m "feat: add CHANGELOG.md bootstrap and plugin manifest"
```

---

### Task 5: Configure release-it

**Files:**
- Modify: `package.json` (root)
- Create: `.release-it.json`

- [ ] **Step 1: Install release-it at workspace root**

```bash
pnpm add -Dw release-it @release-it/conventional-changelog
```

Expected: `release-it` and `@release-it/conventional-changelog` appear in root `package.json` `devDependencies`.

- [ ] **Step 2: Add `release` script to root `package.json`**

In the `scripts` object of root `package.json`, add:

```json
"release": "release-it"
```

Full `scripts` block after the edit:

```json
"scripts": {
  "dev": "cd packages/server && bun run --watch src/index.ts",
  "build": "pnpm --filter @cc/web build",
  "test": "pnpm -r test",
  "lint": "bunx biome check .",
  "release": "release-it"
}
```

- [ ] **Step 3: Create `.release-it.json`**

```json
{
  "git": {
    "commitMessage": "chore: release v${version}",
    "tagName": "v${version}",
    "requireCleanWorkingDir": true
  },
  "github": {
    "release": false
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": "conventionalcommits",
      "infile": "CHANGELOG.md"
    }
  },
  "hooks": {
    "after:bump": "node scripts/sync-version.mjs"
  }
}
```

`github.release: false` — the GitHub release is created by CI on tag push, so the maintainer does not need a `GH_TOKEN` locally.

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
cd packages/server && bun test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add .release-it.json package.json pnpm-lock.yaml
git commit -m "feat: configure release-it for automated versioning"
```

---

### Task 6: Add `GET /api/status` endpoint

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/__tests__/daemon.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/server/__tests__/daemon.test.ts`, inside the existing `describe("startDaemon")` block (after the last existing `test(...)` call), add:

```ts
test("GET /api/status returns version and status", async () => {
  const res = await fetch(`http://127.0.0.1:${handle.port}/api/status`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.version).toBe("1.0.0");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test __tests__/daemon.test.ts
```

Expected: FAIL — `GET /api/status` returns 404.

- [ ] **Step 3: Add `version` to `ServerConfig` in `packages/server/src/server.ts`**

Change the `ServerConfig` interface to add the optional `version` field:

```ts
export interface ServerConfig {
  port: number;
  token: string;
  db: Database;
  bus: Bus;
  version?: string;
  onActivity?: () => void;
  rateLimit?: { limit: number; windowMs: number };
  wsServer?: WsServer;
  apiCtx?: ApiCtx;
}
```

In the `fetch` handler in `createServer`, add the `/api/status` route immediately after the `/api/healthz` route:

```ts
if (req.method === "GET" && url.pathname === "/api/healthz") {
  return Response.json({ status: "ok" });
}

if (req.method === "GET" && url.pathname === "/api/status") {
  return Response.json({ status: "ok", version: config.version ?? "unknown" });
}
```

- [ ] **Step 4: Pass `VERSION` to `createServer` in `packages/server/src/index.ts`**

In the `createServer({...})` call inside the `for (let port = ...)` loop, add `version: VERSION`:

```ts
server = createServer({
  port,
  token,
  db,
  bus,
  wsServer,
  apiCtx,
  version: VERSION,
  onActivity: () => activityRef.fn(),
  rateLimit: options.rateLimit,
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/server && bun test __tests__/daemon.test.ts
```

Expected: all tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/index.ts packages/server/__tests__/daemon.test.ts
git commit -m "feat: expose version via GET /api/status"
```

---

### Task 7: Dashboard UI version display

**Files:**
- Modify: `packages/web/src/lib/api.ts`
- Modify: `packages/web/src/components/layout/Topbar.tsx`
- Create: `packages/web/src/__tests__/Topbar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/web/src/__tests__/Topbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { Topbar } from "../components/layout/Topbar.tsx";

vi.mock("../lib/api.ts", () => ({
  api: {
    fetchStatus: vi.fn().mockResolvedValue({ status: "ok", version: "1.0.0" }),
  },
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(MemoryRouter, null, children),
  );
}

describe("Topbar", () => {
  test("displays daemon version from /api/status", async () => {
    render(<Topbar />, { wrapper: Wrapper });
    expect(await screen.findByText("v1.0.0")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && pnpm test run
```

Expected: FAIL — `v1.0.0` not found in rendered output.

- [ ] **Step 3: Add `fetchStatus` to `packages/web/src/lib/api.ts`**

In the `api` object, add after `postHandoff`:

```ts
fetchStatus: () => apiFetch<{ status: string; version: string }>("/api/status"),
```

- [ ] **Step 4: Update `packages/web/src/components/layout/Topbar.tsx`**

Add these two imports at the top of the file:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
```

Inside the `Topbar` function, add the query before the `return` statement:

```ts
const { data: status } = useQuery({
  queryKey: ["status"],
  queryFn: api.fetchStatus,
  staleTime: Number.POSITIVE_INFINITY,
});
```

In the `topbar-right` div, add the version badge after the session ID span and before the connection pill:

```tsx
{status?.version && (
  <span className="version-badge">v{status.version}</span>
)}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/web && pnpm test run
```

Expected: all tests pass including the new Topbar test.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/api.ts packages/web/src/components/layout/Topbar.tsx packages/web/src/__tests__/Topbar.test.tsx
git commit -m "feat: display daemon version in dashboard Topbar"
```

---

### Task 8: Update `claude-control:status` command to show version

**Files:**
- Modify: `plugin/commands/status.md`

- [ ] **Step 1: Update step 5 output format in `plugin/commands/status.md`**

Replace the summary block in step 5:

Old:
```
   Daemon:  running  (port <port>, pid <pid>)
```

New:
```
   Daemon:  running  (port <port>, pid <pid>, v<version>)
```

Where `<version>` is the `version` field from the `runtime.json` read in step 2.

- [ ] **Step 2: Commit**

```bash
git add plugin/commands/status.md
git commit -m "feat: show daemon version in claude-control:status output"
```

---

### Task 9: Create GitHub Actions workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the `.github/workflows/` directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test --passWithNoTests
        working-directory: packages/server
      - run: pnpm --filter @cc/web test run
        env:
          CI: true
```

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - run: bun test --passWithNoTests
        working-directory: packages/server

      - run: pnpm --filter @cc/web test run
        env:
          CI: true

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION=${GITHUB_REF_NAME}
          NOTES=$(node scripts/extract-changelog.mjs "$VERSION")
          gh release create "$VERSION" \
            --title "$VERSION" \
            --notes "$NOTES"
```

- [ ] **Step 4: Run full test suite**

```bash
cd packages/server && bun test && cd ../../packages/web && pnpm test run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: add GitHub Actions CI and release workflows"
```
