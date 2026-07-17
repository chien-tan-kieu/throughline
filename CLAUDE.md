# Throughline — Project Guide

## Package Manager

**Bun only.** This project uses bun as both runtime and package manager.

- Install: `bun install` (lockfile: `bun.lock`)
- Add a root dev dep: `bun add -d <package>` (run from repo root)
- Add a workspace dep: `bun add <package> --cwd packages/<name>`
- `pnpm` and `npm` are NOT used — do not run `pnpm install` or `npm install`

## Workspace Structure

```
throughline/          ← repo root (bun workspaces host)
  packages/
    server/              ← @throughline/server  — Bun HTTP daemon (bun:test)
    web/                 ← @throughline/web     — React dashboard (vitest)
    shared/              ← @throughline/shared  — Shared TypeScript types
  plugin/                ← Claude Code plugin (skills, commands, hooks)
  scripts/               ← Release utility scripts (sync-version.mjs, extract-changelog.mjs)
  .github/workflows/     ← CI (ci.yml) and release (release.yml) pipelines
```

Workspace membership is declared in root `package.json → "workspaces": ["packages/*"]`. There is no `pnpm-workspace.yaml`.

## Test Commands

| Scope | Command |
|-------|---------|
| Server only | `cd packages/server && bun test` |
| Web only | `cd packages/web && bun run test` |
| All packages | `bun --filter '*' test` (from repo root) |

Server uses **bun:test** (`bun test`). Web uses **vitest** (`bun run test` — vitest is invoked via the `test` script). Do not run `bun test` in the web directory; it will use the wrong runner.

## Root Scripts

```bash
bun run dev      # Start server in watch mode
bun run build    # Build web dashboard
bun run test     # Run all package tests
bun run lint     # Biome linter
```

## Release Workflow

Version is authoritative in root `package.json`. Releases are cut manually from GitHub Actions — there is no local release command, and pushing to `main` no longer triggers a release (CI tests still run on every push).

To cut a release: **Actions tab → Release workflow → Run workflow**, choose `version_bump` (`patch` / `minor` / `major`), run on `main`. Or via CLI: `gh workflow run release.yml -f version_bump=patch`.

The workflow (`.github/workflows/release.yml`):
1. Runs the server and web test suites
2. Predicts the next version from the bump kind (dry run — no writes)
3. Fails fast if that version's tag or GitHub Release already exists
4. Bumps root `package.json`, propagates via `scripts/sync-version.mjs` to:
   - `packages/server/package.json`
   - `packages/web/package.json`
   - `packages/shared/package.json`
   - `plugin/plugin.json`
   - `.claude-plugin/plugin.json`
   - `.claude-plugin/marketplace.json`
   - `packages/server/src/index.ts` (`const VERSION`)
   prepends a `CHANGELOG.md` entry, commits `chore: release vX.Y.Z`, and pushes to `main`
5. Builds the server bundle and web dashboard, assembles the `dist` branch, tags it, and pushes both
6. Creates the GitHub Release from the `dist` tag

If a run fails *after* step 4 has pushed the version-bump commit but before the release is published, do not immediately re-run the workflow — it will bump past the stuck version. See `docs/superpowers/specs/2026-07-17-manual-release-workflow-design.md` for manual recovery.

## Server Entry Point

`packages/server/src/index.ts` — exports `startDaemon()`. The daemon:
- Binds to port range 47821–47830
- Writes `.throughline/runtime.json` (port, token, pid, version)
- Exposes `GET /api/healthz` and `GET /api/status` without auth
- All other `/api/*` routes require `Authorization: Bearer <token>`
