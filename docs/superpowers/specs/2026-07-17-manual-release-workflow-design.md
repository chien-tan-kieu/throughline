# Manual Release Workflow (workflow_dispatch) — Design

**Date:** 2026-07-17
**Status:** Approved

---

## Overview

The release pipeline currently auto-triggers on every push to `main` whose commit message starts with `chore: release v` (`.github/workflows/release.yml:9`). The actual released version is read from root `package.json`, not the commit message — so a commit like `chore: release v3.0.1` that matches the trigger string but doesn't actually bump `package.json` (e.g. a hand-written commit message instead of running `bun run release`) causes the workflow to re-attempt publishing the *already-released* version, and `gh release create` fails with `HTTP 422: Release.tag_name already exists`.

This design replaces the push-based auto-trigger with a manual `workflow_dispatch` trigger, moves the version bump into CI (reusing the existing local bump script), and adds an explicit pre-flight guard against re-releasing an existing version — turning today's opaque 422 into a clear, early failure.

Goals:
- Releases only happen when explicitly triggered from the GitHub Actions UI (or `gh workflow run`)
- The version bump (root `package.json` + `sync-version.mjs` propagation + `CHANGELOG.md` entry) can happen in CI, driven by a `version_bump` input, reusing the existing `scripts/release.mjs` — no duplicated bump logic
- A duplicate-release attempt fails fast with a clear error, before any commit is pushed

Non-goals:
- No automated recovery for a release that fails *after* the version-bump commit has been pushed to `main` (see Known Limitation below) — documented as a manual recovery step instead
- No change to the local `bun run release` flow's own bump logic (`scripts/release.mjs`, `scripts/sync-version.mjs`) — CI reuses it as-is

---

## Section 1: Trigger

Replace:
```yaml
on:
  push:
    branches: [main]

jobs:
  release:
    if: "startsWith(github.event.head_commit.message, 'chore: release v')"
```

With:
```yaml
on:
  workflow_dispatch:
    inputs:
      version_bump:
        description: "Version bump kind"
        type: choice
        options: [patch, minor, major]
        required: true
```

The `if:` gate is removed entirely — `workflow_dispatch` only runs when explicitly invoked, so the commit-message sniffing is no longer needed. There is no `none` option: every dispatch bumps the version. Releasing an already-bumped `package.json` as-is is not supported by this design.

---

## Section 2: Version determination and duplicate guard

Runs after the existing test steps (`bun test` for server, `bun run test` for web) and replaces the current "Read version" step. Order matters: tests must pass *before* anything is committed to `main`.

**Step A — Predict the target version (dry run, no writes):**
```yaml
- name: Predict version
  id: predict
  run: |
    NEXT=$(node --input-type=module -e "
      import { bumpVersion } from './scripts/release.mjs';
      import { readFileSync } from 'node:fs';
      const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
      console.log(bumpVersion(pkg.version, '${{ inputs.version_bump }}'));
    ")
    echo "version=v$NEXT" >> "$GITHUB_OUTPUT"
```
Reuses the `bumpVersion` function already exported from `scripts/release.mjs` (`scripts/release.mjs:7-13`) — no reimplementation of the bump arithmetic.

**Step B — Guard against re-release:**
```yaml
- name: Check version not already released
  run: |
    if git rev-parse "${{ steps.predict.outputs.version }}" >/dev/null 2>&1 || \
       gh release view "${{ steps.predict.outputs.version }}" >/dev/null 2>&1; then
      echo "::error::${{ steps.predict.outputs.version }} already exists as a tag or release."
      exit 1
    fi
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
Fails before any mutation happens — this is the exact failure mode from today's incident, now caught with a clear message instead of surfacing as a raw `gh release create` 422.

**Step C — Apply the real bump:**
```yaml
- name: Bump version
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    bun scripts/release.mjs -- ${{ inputs.version_bump }}
```
Runs the unmodified local release script: bumps root `package.json`, propagates via `sync-version.mjs`, prepends a `CHANGELOG.md` entry, commits `chore: release vX.Y.Z`, and pushes to `main`. Local and CI bump paths share identical logic.

The remaining steps (build server bundle, build web dashboard, assemble dist tree, publish `dist` branch + tag, create GitHub release) are unchanged from the current workflow, except they use `steps.predict.outputs.version` instead of re-reading `package.json`, since the version is already known and fixed at this point.

---

## Section 3: Known limitation — partial failure after bump

If Step C's push to `main` succeeds but a later step (build, dist-branch/tag push, or `gh release create`) fails, `main` is left with a version-bump commit that has no corresponding tag or release — the same shape of problem as today's incident, just shifted later in the pipeline. Since there is no `none` bump option, a straight re-run of the workflow will bump *past* the stuck version rather than retry it.

This is accepted as a rare-case, documented-not-automated risk. Recovery: after fixing whatever caused the failure, either
- manually run `gh release create vX.Y.Z --target dist --notes "..."` using a rebuilt `dist` branch/tag pushed by hand, or
- let the next scheduled bump supersede the skipped version (its changes still appear in `CHANGELOG.md` history and the `main` commit log, just without their own GitHub Release).

No automated retry/resume mechanism is built for this case — the failure is expected to be uncommon, and building idempotent resume logic was judged not worth the added workflow complexity for a rare scenario.

---

## Modified files

| Path | Change |
|---|---|
| `.github/workflows/release.yml` | Trigger changed from `push`+commit-message gate to `workflow_dispatch` with required `version_bump` choice input (`patch`/`minor`/`major`). "Read version" step replaced by "Predict version" (dry run) + "Check version not already released" (guard) + "Bump version" (runs `scripts/release.mjs` in CI). Downstream steps reference `steps.predict.outputs.version` instead of re-reading `package.json`. |

No changes to `scripts/release.mjs`, `scripts/sync-version.mjs`, or `scripts/extract-changelog.mjs` — all reused as-is.
