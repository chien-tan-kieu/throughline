# Plugin Distribution Build Step — Design

**Date:** 2026-07-14
**Status:** Approved

---

## Overview

Today, installing the Throughline plugin from GitHub (`.claude-plugin/marketplace.json` → `"source": "./"`) pulls the **entire monorepo**: full TypeScript source, tests, docs, CI config, `node_modules` install on first session. This was never an intentional design — `plugin/` was originally scaffolded as "an artifact that gets shipped, not built" (per the original foundation design), and a build pipeline to actually curate that artifact was planned (see `docs/features/throughline-plugin/PRD.md` §13) but never implemented. `bootstrap.sh` already has a dormant fallback expecting a compiled `bin/cc-daemon` binary that has never existed.

This design replaces that gap with a real build step: a curated **`dist` branch** containing only what an end user's install needs, produced by CI, with a single git tag per release pointing at the built artifact.

Two things fall out of this as side effects, addressed here since they're directly load-bearing for a correct build: a real path-resolution bug that bundling would otherwise introduce, and the removal of `release-it` (which added ceremony — an interactive bump prompt and conventional-commit changelog categorization — without being load-bearing for this design; a plain script replaces it).

---

## Section 1: Branch & Tag Strategy

- **`main`**: unchanged in shape. Full monorepo source, tests, docs. Local dev/testing continues via `claude --plugin-dir ./plugin` (uses source directly, per `plugin/README.md`).
- **`dist`**: a force-pushed, history-less branch. Every release replaces its entire tree with a freshly built one — no accumulated history, just the latest (and, via tags, past) built artifacts.
- **Exactly one tag per release: `v${version}`, created on the `dist` branch commit** — not on `main`. A git tag name is unique per repo; since `main`'s release commit and `dist`'s build commit are different commits with different trees, only one of them can hold the canonical `v${version}` name. The build artifact is the thing users actually install, so it gets the tag. The corresponding source-side commit on `main` is identified by its commit message (`chore: release vX.Y.Z`), not a separate tag.
- End users' `known_marketplaces.json` entry sets `ref: dist` (always latest) or `ref: v${version}` (pinned to an exact past release). Discoverable via `git ls-remote --tags` or GitHub's tag list — this is also the answer to "how do I see/choose a release version," which had no mechanism before this design.

## Section 2: Replace `release-it` with a Plain Script

`release-it` (+ `@release-it/conventional-changelog`) is removed. It provided an interactive version-bump prompt and conventional-commit-categorized changelog generation — ceremony not needed for a solo-maintainer flow, and orthogonal to the actual problem (the plugin artifact bloat). Replaced by `scripts/release.mjs`, invoked as `bun run release -- <patch|minor|major>`:

1. Abort if `git status --porcelain` is non-empty (keeps `release-it`'s `requireCleanWorkingDir` safety property).
2. Bump root `package.json`'s version in place via plain semver-segment increment (no new dependency).
3. Call the existing `syncVersion(rootDir)` export from `scripts/sync-version.mjs` directly — reused as-is, just invoked from a different caller. Extended to also update `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`'s embedded version field, which `sync-version.mjs` never touched (a pre-existing drift bug: those files have been stuck at `0.1.0` regardless of the real released version). This now matters because these are the files that actually ship as the install manifest.
4. Prepend a `## [X.Y.Z] - <date>` section to `CHANGELOG.md`, built from a flat commit-subject list (not conventional-commit-categorized groups; `scripts/extract-changelog.mjs` only cares about the heading, not how the section was generated). Since `main` never carries a release tag (see below), the commit range can't be `<last-tag>..HEAD` — instead, find the most recent prior commit matching `^chore: release v` via `git log --grep` and diff from there (or the full history, on the first-ever release).
5. Commit changed files as `chore: release vX.Y.Z`, push to `main`. **No tag created here** (see Section 1).

Removed: `release-it`, `@release-it/conventional-changelog` devDependencies; `.release-it.json`. Root `package.json`'s `"release"` script changes from `"release-it"` to `"bun scripts/release.mjs --"`.

## Section 3: Build Pipeline & Dist Tree Layout

### The webDistPath bug

`packages/server/src/server.ts` locates the built web dashboard via `join(import.meta.dir, "../../web/dist")` — an offset calibrated for dev, where the file lives at `packages/server/src/`. Bundlers rewrite `import.meta.dir` to reflect wherever the file physically runs from, so once bundled into a single `bin/server.js`, that same offset climbs two directories above the artifact root instead of finding `bin/web/`, and would silently 404 every page load. `MIGRATIONS_DIR` (`join(import.meta.dir, "../migrations")`) has the same mechanism but resolves correctly for free, as long as `migrations/` is placed as a direct sibling of `bin/` in the dist tree.

**Fix, in `packages/server/src/index.ts`:**
- Add `webDistPath?: string` to `DaemonOptions`, and pass it into the existing `createServer({...})` call (the field already exists on `server.ts`'s config type — it's just never populated today).
- In the `if (import.meta.main)` block, read `process.env.THROUGHLINE_WEB_DIST` and pass it through as that override.
- Dev is unaffected: the env var is unset in dev, so the existing working relative default still applies. Production's `bootstrap.sh` / `ensure-daemon.sh` set `THROUGHLINE_WEB_DIST="$CLAUDE_PLUGIN_ROOT/bin/web"` before launching.

### Build steps (in `release.yml`, gated per Section 1's trigger)

1. `bun install` — sets up workspace symlinks so `bun build` can resolve `@throughline/shared` (this stays inside CI; never shipped to end users).
2. `bun build ./packages/server/src/index.ts --outfile=bin/server.js --target=bun` — inlines `@throughline/shared` automatically; no separate shared-package compile step needed.
3. `bun run build` (existing root script → `vite build` for web) → `packages/web/dist`.
4. Assemble a curated tree:
   ```
   .claude-plugin/plugin.json          (version synced)
   .claude-plugin/marketplace.json     (version synced)
   plugin/commands/, hooks/, skills/, constitution.md   (copied as-is from main)
   bin/server.js
   bin/web/            ← copied from packages/web/dist
   migrations/         ← copied from packages/server/migrations (sibling of bin/)
   ```
5. Force-push that tree as the sole commit on `dist`; tag that commit `v${version}` (the one and only tag for this release — see Section 1); push the tag; create the GitHub Release (notes extracted from `main`'s `CHANGELOG.md` via the existing `scripts/extract-changelog.mjs`, read from the `main` checkout already present in the same job).

### CI trigger change

`release.yml` changes from `on: push: tags: v*` to `on: push: branches: [main]`, gated with `if: startsWith(github.event.head_commit.message, 'chore: release v')` — since the tag no longer exists until *after* this job builds the dist commit it points to, the job can't be triggered by that tag. Version is read from `main`'s (already-bumped) `package.json`, not from `github.ref_name`.

## Section 4: Runtime Script Changes

**`bootstrap.sh`**: only the dev/prod fallback's "else" branch changes. Today it invokes a compiled binary that was never built (`bin/cc-daemon`); replaced with:
```bash
THROUGHLINE_WEB_DIST="$CLAUDE_PLUGIN_ROOT/bin/web" \
  bun run "$CLAUDE_PLUGIN_ROOT/bin/server.js" >> "$LOG" 2>&1 &
```
This file is copied verbatim from `main` into the dist tree, so the same script correctly self-selects dev-vs-prod behavior in both branches (the `if [ -f "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" ]` check is naturally false on `dist`, since that path doesn't exist there) — no divergent copies to maintain.

**`ensure-daemon.sh`** (used by `/status`, `/open`, `/story`, etc.): a pre-existing gap, not introduced by this design — it never had `bootstrap.sh`'s dev/prod fallback, so it would already be broken against any binary-only install. Fixed by adding the same conditional, with the same `THROUGHLINE_WEB_DIST` env var set on the prod branch.

## Section 5: Documentation

`plugin/README.md`'s install section documents both paths: `claude --plugin-dir ./plugin` for local source dev (unchanged), and the marketplace `ref: dist` (latest) / `ref: v${version}` (pinned) pattern for real installs.

## Section 6: Verification Plan

1. `bun test` (server) and `bun run test` (web) still pass after the build changes — the only production-code change is the `DaemonOptions.webDistPath` addition; it must not alter existing test-covered behavior.
2. Manual dry run: build the tree locally, check it out into a scratch directory with no `packages/` present, run `bootstrap.sh` and `ensure-daemon.sh` from there, confirm the daemon starts and the dashboard actually renders (this is what catches the `webDistPath`/migrations path issue for real, not just in theory).
3. Confirm the single `v${version}` tag is created only on `dist`, and that `main`'s release commits remain identifiable by commit message alone.
4. First real release exercises the full extended `release.yml` end-to-end before this is considered done.

---

## Out of Scope

- Cross-compiled standalone binaries (`bun build --compile`) — end users still need Bun installed; this was an explicit trade-off against the original PRD's heavier design.
- GitHub Release asset / tarball downloads and post-install scripting — verified not supported by Claude Code's plugin marketplace mechanism (GitHub sources are always a full git clone/checkout of a ref; no post-install hook exists).
- `git-subdir` source type (committing a curated `dist/` folder alongside full source on `main`) — considered, but the dedicated `dist` branch was preferred for a clean, single-purpose tree with no unrelated history.
