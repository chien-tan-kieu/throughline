# Manual Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the push-triggered, commit-message-gated release workflow with a manual `workflow_dispatch` trigger that bumps the version in CI and guards against re-releasing an existing version, fixing the class of bug that produced today's `HTTP 422: Release.tag_name already exists`.

**Architecture:** `.github/workflows/release.yml` moves from `on: push` + an `if:` commit-message check to `on: workflow_dispatch` with a required `version_bump` choice input (`patch`/`minor`/`major`). The version bump — previously only done locally via `bun run release` — now happens inside the CI job by shelling out to the existing `scripts/release.mjs` (unmodified), preceded by a dry-run prediction of the target version and a guard step that fails fast if that version's tag or GitHub Release already exists. The root `release` npm script is removed to eliminate the double-bump footgun now that CI always bumps.

**Tech Stack:** GitHub Actions (`workflow_dispatch`), Bun, existing `scripts/release.mjs` / `scripts/sync-version.mjs` / `scripts/extract-changelog.mjs` (all reused as-is), `gh` CLI, `python`+`pyyaml` for local YAML validation (already present in the dev environment, no new dependency added to the repo).

## Global Constraints

- Bun only — no `pnpm`/`npm` (per `CLAUDE.md`)
- `scripts/release.mjs`, `scripts/sync-version.mjs`, `scripts/extract-changelog.mjs` are reused unmodified — no changes to their logic
- `version_bump` input is required, choices exactly `[patch, minor, major]` — no `none` option
- The predict-version step must not write any files (dry run only), so the duplicate-tag guard runs before any commit exists
- The duplicate guard checks both `git rev-parse <tag>` and `gh release view <tag>`
- Root `package.json`'s `"release"` script is removed; `scripts/release.mjs` stays on disk and is still invoked directly by path from CI
- Partial-failure recovery (bump pushed but release not published) is documented, not automated

---

## File Structure

- **Modify:** `.github/workflows/release.yml` — trigger, version determination, and duplicate guard change; build/publish steps otherwise unchanged
- **Modify:** `package.json` (root) — remove the `"release"` script
- **Modify:** `CLAUDE.md` — rewrite the "Release Workflow" section and the `bun run release` line in "Root Scripts" to describe the new manual-dispatch flow

No new files. No changes to `scripts/*.mjs`.

---

### Task 1: Rewrite the release workflow trigger, version bump, and duplicate guard

**Files:**
- Modify: `.github/workflows/release.yml` (currently 78 lines, full file replaced)

**Interfaces:**
- Consumes: `bumpVersion(current: string, kind: "patch"|"minor"|"major"): string` exported from `scripts/release.mjs` (already tested in `scripts/__tests__/release.test.ts`, unchanged by this task)
- Produces: workflow_dispatch input `version_bump` (choice: `patch`/`minor`/`major`, required); step output `steps.predict.outputs.version` in the form `vX.Y.Z`, consumed by the later "Publish dist branch and tag" and "Create GitHub Release" steps in this same file

- [ ] **Step 1: Establish the baseline — confirm current package.json version and existing tags/releases**

```bash
grep '"version"' package.json
git tag -l
gh release list --limit 5
```

Expected (repo state as of this plan): version `3.0.1`, tags `v1.0.0`, `v3.0.0`, `v3.0.1`, and `gh release list` showing `v3.0.1` and `v3.0.0` — this is the known-good state the guard logic must respect (must detect `v3.0.1` as taken, must NOT flag `v3.0.2`).

- [ ] **Step 2: Write the new `.github/workflows/release.yml`**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version_bump:
        description: "Version bump kind"
        type: choice
        options: [patch, minor, major]
        required: true

jobs:
  release:
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

      - name: Check version not already released
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if git rev-parse "${{ steps.predict.outputs.version }}" >/dev/null 2>&1 || \
             gh release view "${{ steps.predict.outputs.version }}" >/dev/null 2>&1; then
            echo "::error::${{ steps.predict.outputs.version }} already exists as a tag or release."
            exit 1
          fi

      - name: Ensure a real branch checkout for pushing
        run: |
          git checkout -B "${{ github.ref_name }}"
          git branch --set-upstream-to="origin/${{ github.ref_name }}" "${{ github.ref_name }}"

      - name: Bump version
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          bun scripts/release.mjs -- ${{ inputs.version_bump }}

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
          VERSION="${{ steps.predict.outputs.version }}"
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
          VERSION="${{ steps.predict.outputs.version }}"
          NOTES=$(node scripts/extract-changelog.mjs "$VERSION")
          gh release create "$VERSION" \
            --title "$VERSION" \
            --target dist \
            --notes "$NOTES"
```

Note the "Ensure a real branch checkout for pushing" step: `actions/checkout` leaves the repository in a detached-HEAD state even when checking out a branch ref, and `scripts/release.mjs`'s final `git push` (called with no arguments) requires a real branch with a configured upstream to succeed. This step converts the detached HEAD back into a tracked local branch before the bump script runs. `scripts/release.mjs` itself is not modified — this fixes the calling environment, not the script.

- [ ] **Step 3: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('valid')"
```

Expected: `valid`

- [ ] **Step 4: Verify the "Predict version" logic locally against the real repo state**

```bash
for kind in patch minor major; do
  node --input-type=module -e "
    import { bumpVersion } from './scripts/release.mjs';
    import { readFileSync } from 'node:fs';
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
    console.log('$kind ->', 'v' + bumpVersion(pkg.version, '$kind'));
  "
done
```

Expected (against version `3.0.1`):
```
patch -> v3.0.2
minor -> v3.1.0
major -> v4.0.0
```

- [ ] **Step 5: Verify the duplicate-guard logic against the real repo state**

```bash
echo "existing tag v3.0.1:"
git rev-parse v3.0.1 >/dev/null 2>&1 && echo "DETECTED (correct - already released)" || echo "not detected (WRONG)"

echo "existing release v3.0.1:"
gh release view v3.0.1 >/dev/null 2>&1 && echo "DETECTED (correct - already released)" || echo "not detected (WRONG)"

echo "not-yet-released v3.0.2 (tag):"
git rev-parse v3.0.2 >/dev/null 2>&1 && echo "DETECTED (WRONG)" || echo "not detected (correct - safe to proceed)"

echo "not-yet-released v3.0.2 (release):"
gh release view v3.0.2 >/dev/null 2>&1 && echo "DETECTED (WRONG)" || echo "not detected (correct - safe to proceed)"
```

Expected:
```
existing tag v3.0.1:
DETECTED (correct - already released)
existing release v3.0.1:
DETECTED (correct - already released)
not-yet-released v3.0.2 (tag):
not detected (correct - safe to proceed)
not-yet-released v3.0.2 (release):
not detected (correct - safe to proceed)
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: switch release workflow to manual workflow_dispatch with in-CI bump and duplicate guard"
```

---

### Task 2: Remove the local release script and update developer-facing docs

**Files:**
- Modify: `package.json:5-11` (root) — remove the `"release"` script
- Modify: `CLAUDE.md` — "Root Scripts" section (remove the `bun run release` line) and "Release Workflow" section (full rewrite)

**Interfaces:**
- Consumes: nothing new (documents Task 1's `version_bump` input and the `gh workflow run release.yml -f version_bump=<kind>` invocation)
- Produces: nothing consumed by other tasks — this is the terminal documentation task

- [ ] **Step 1: Remove the `release` script from root `package.json`**

Current (`package.json:5-11`):
```json
  "scripts": {
    "dev": "cd packages/server && bun run --watch src/index.ts",
    "build": "bun --filter @throughline/web build",
    "test": "bun --filter '*' test",
    "lint": "bunx biome check .",
    "release": "bun scripts/release.mjs --"
  },
```

New:
```json
  "scripts": {
    "dev": "cd packages/server && bun run --watch src/index.ts",
    "build": "bun --filter @throughline/web build",
    "test": "bun --filter '*' test",
    "lint": "bunx biome check ."
  },
```

- [ ] **Step 2: Verify `package.json` is still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Update the "Root Scripts" section in `CLAUDE.md`**

Current:
```markdown
## Root Scripts

```bash
bun run dev      # Start server in watch mode
bun run build    # Build web dashboard
bun run test     # Run all package tests
bun run lint     # Biome linter
bun run release  # Interactive release (release-it)
```
```

New:
```markdown
## Root Scripts

```bash
bun run dev      # Start server in watch mode
bun run build    # Build web dashboard
bun run test     # Run all package tests
bun run lint     # Biome linter
```
```

- [ ] **Step 4: Rewrite the "Release Workflow" section in `CLAUDE.md`**

Current:
```markdown
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
```

New:
```markdown
## Release Workflow

Version is authoritative in root `package.json`. Releases are cut manually from GitHub Actions — there is no local release command, and pushing to `main` no longer triggers anything.

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
   - `packages/server/src/index.ts` (`const VERSION`)
   prepends a `CHANGELOG.md` entry, commits `chore: release vX.Y.Z`, and pushes to `main`
5. Builds the server bundle and web dashboard, assembles the `dist` branch, tags it, and pushes both
6. Creates the GitHub Release from the `dist` tag

If a run fails *after* step 4 has pushed the version-bump commit but before the release is published, do not immediately re-run the workflow — it will bump past the stuck version. See `docs/superpowers/specs/2026-07-17-manual-release-workflow-design.md` for manual recovery.
```

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "docs: document manual release workflow_dispatch flow; drop local release script"
```

---

### Task 3: End-to-end smoke test (manual, requires explicit go-ahead)

**This task performs a real release** — it pushes a version-bump commit to `main`, creates a real tag, and publishes a real GitHub Release. Do not run it as part of unattended/automated plan execution. Whoever executes this plan must explicitly confirm with the user immediately before Step 1.

**Files:** none (verification only)

- [ ] **Step 1: Push Task 1 and Task 2's commits to `main`, if not already pushed**

```bash
git push
```

- [ ] **Step 2: Dispatch the release workflow with a patch bump**

```bash
gh workflow run release.yml -f version_bump=patch
```

- [ ] **Step 3: Watch the run and confirm it succeeds**

```bash
gh run watch --exit-status $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: exit status `0`, and the run's log shows the "Predict version" step outputting `v3.0.2`, the "Check version not already released" step passing (no error), and "Create GitHub Release" succeeding.

- [ ] **Step 4: Confirm the release and tag exist**

```bash
gh release view v3.0.2
git ls-remote --tags origin v3.0.2
```

Expected: both commands succeed and show `v3.0.2`.
