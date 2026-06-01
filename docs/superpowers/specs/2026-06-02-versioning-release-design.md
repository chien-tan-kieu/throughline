# Versioning and Release Mechanism — Design

**Date:** 2026-06-02
**Story:** US-2026-06-01-implement-versioning-and-release-mechani
**Status:** Approved

---

## Overview

This document specifies the versioning and release mechanism for the claude-control plugin. The goals are:

- A single authoritative version number, consistent across all packages and the plugin manifest
- An automated local release command that bumps the version, generates a changelog entry, and pushes a git tag
- A GitHub Actions CI pipeline that runs tests on every tag push and creates a GitHub release
- A `plugin/plugin.json` manifest that enables GitHub-based installation by Claude Code users

The initial version set by this implementation is **1.0.0**.

---

## Section 1: Version Source of Truth

Root `package.json` is the single authoritative version. No other file owns it; all other locations are derived.

### Files that carry the version

| File | Field / Pattern |
|---|---|
| `package.json` (root) | `"version"` — owned by `release-it` |
| `packages/server/package.json` | `"version"` — synced by hook |
| `packages/web/package.json` | `"version"` — synced by hook |
| `packages/shared/package.json` | `"version"` — synced by hook |
| `plugin/plugin.json` | `"version"` — synced by hook |
| `packages/server/src/index.ts` | `const VERSION = "..."` literal — synced by hook |

### Sync script: `scripts/sync-version.mjs`

Runs as a `release-it` `after:bump` hook. Reads the new version from root `package.json` (already bumped) and writes it to all five derived locations. All modified files are picked up by `release-it`'s git commit.

The current drift (`package.json` at `0.1.0`, `VERSION` constant at `0.2.0`) is resolved by this implementation: everything is set to `1.0.0` as the baseline, and the sync script prevents future drift.

### All packages share one version

The monorepo uses a single shared version. `packages/server`, `packages/web`, and `packages/shared` all bump together on every release. No per-package independent versioning.

---

## Section 2: Local Release Workflow

### New dev dependencies (root `package.json`)

```json
"release-it": "^20.2.0",
"@release-it/conventional-changelog": "^11.0.1"
```

### New root script

```json
"release": "release-it"
```

### `.release-it.json` (repo root)

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

`github.release: false` — the GitHub release is created by CI, not locally, so the maintainer does not need a `GH_TOKEN` configured locally.

### Maintainer release flow

1. `pnpm run release` — interactive prompt selects patch / minor / major
2. `release-it` bumps root `package.json`
3. `after:bump` hook runs `scripts/sync-version.mjs`, propagating the version to all five derived locations
4. `@release-it/conventional-changelog` prepends a new entry to `CHANGELOG.md` from commits since the last tag
5. `release-it` commits all changed files as `chore: release vX.Y.Z`, creates tag `vX.Y.Z`, pushes both to `origin`
6. Tag push triggers GitHub Actions

---

## Section 3: GitHub Actions CI

### `.github/workflows/ci.yml` — runs on every push to `main` and on PRs

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

### `.github/workflows/release.yml` — triggers on `v*` tag push

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

### Infrastructure notes

- **Runner:** GitHub-hosted `ubuntu-latest` — no self-hosted runner required
- **Secrets:** `GITHUB_TOKEN` is automatically available; no additional secrets needed
- **Bun:** installed via `oven-sh/setup-bun@v2` (official Bun action)
- **`gh` CLI:** pre-installed on all GitHub-hosted Ubuntu runners

### `scripts/extract-changelog.mjs`

Reads `CHANGELOG.md`, finds the section matching the given version tag (between the first `## [vX.Y.Z]` heading and the next), and outputs it to stdout for use as GitHub release notes.

---

## Section 4: `plugin/plugin.json` Manifest

New file at `plugin/plugin.json`. This is read by the Claude Code plugin runtime when installing from a GitHub source. The `version` field is kept in sync by `sync-version.mjs`.

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

**GitHub-based installation** — users add this entry to their `known_marketplaces.json`:

```json
"claude-control": {
  "source": { "source": "github", "repo": "chien-tan-kieu/claude-control" },
  "installLocation": "..."
}
```

No other changes to the `plugin/` directory are required.

---

## Section 5: `CHANGELOG.md` Bootstrap

A `CHANGELOG.md` is created at the repo root. The initial `1.0.0` entry is hand-authored to capture the project history. From the next release onward, `@release-it/conventional-changelog` prepends entries automatically.

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

---

## New files introduced

| Path | Purpose |
|---|---|
| `plugin/plugin.json` | Plugin manifest with version, description, author, repo |
| `.release-it.json` | release-it configuration |
| `scripts/sync-version.mjs` | Propagates version from root `package.json` to derived locations |
| `scripts/extract-changelog.mjs` | Extracts a version's changelog section for GitHub release notes |
| `CHANGELOG.md` | Changelog, bootstrapped at `1.0.0` |
| `.github/workflows/ci.yml` | CI — runs tests on push to main and PRs |
| `.github/workflows/release.yml` | Release — runs tests then creates GitHub release on tag push |

## Modified files

| Path | Change |
|---|---|
| `package.json` (root) | Add `release` script; add `release-it` + `@release-it/conventional-changelog` dev deps; set version to `1.0.0` |
| `packages/server/package.json` | Set version to `1.0.0` |
| `packages/web/package.json` | Set version to `1.0.0` |
| `packages/shared/package.json` | Set version to `1.0.0` |
| `packages/server/src/index.ts` | Change `const VERSION = "0.2.0"` to `"1.0.0"` |
