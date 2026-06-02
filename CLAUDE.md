# Claude Control — Project Guide

## Package Manager

**Bun only.** This project uses bun as both runtime and package manager.

- Install: `bun install` (lockfile: `bun.lock`)
- Add a root dev dep: `bun add -d <package>` (run from repo root)
- Add a workspace dep: `bun add <package> --cwd packages/<name>`
- `pnpm` and `npm` are NOT used — do not run `pnpm install` or `npm install`

## Workspace Structure

```
claude-control/          ← repo root (bun workspaces host)
  packages/
    server/              ← @cc/server  — Bun HTTP daemon (bun:test)
    web/                 ← @cc/web     — React dashboard (vitest)
    shared/              ← @cc/shared  — Shared TypeScript types
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
bun run release  # Interactive release (release-it)
```

## Release Workflow

Version is authoritative in root `package.json`. Running `bun run release`:
1. Bumps version in root `package.json`
2. `scripts/sync-version.mjs` propagates version to all derived locations:
   - `packages/server/package.json`
   - `packages/web/package.json`
   - `packages/shared/package.json`
   - `plugin/plugin.json`
   - `packages/server/src/index.ts` (`const VERSION`)
3. `CHANGELOG.md` entry is prepended from conventional commits
4. Git tag `vX.Y.Z` is created and pushed
5. Tag push triggers `.github/workflows/release.yml` → GitHub Release

## Server Entry Point

`packages/server/src/index.ts` — exports `startDaemon()`. The daemon:
- Binds to port range 47821–47830
- Writes `.claude-control/runtime.json` (port, token, pid, version)
- Exposes `GET /api/healthz` and `GET /api/status` without auth
- All other `/api/*` routes require `Authorization: Bearer <token>`
