# Design: Incremental Story IDs (US{n})

**Date:** 2026-06-10
**Story:** US-2026-06-08-optimize-story-id-generation-to-use-incr

## Problem

The current story ID format (`US-yyyy-MM-dd-<title-slug>`) is truncated to 50 characters, which causes collisions for same-day stories with similar titles. IDs are also long and hard to reference verbally or in commit messages.

## Goal

New stories receive short, unique, incrementing IDs in the format `US{n}` (e.g. `US1`, `US42`). Existing old-format stories continue to work unchanged.

## Approach: `seq` column + `COALESCE(MAX(seq), 0) + 1`

A new `seq INTEGER` column is added to the `stories` table with a partial unique index. The next ID is derived from the highest committed `seq` value — the counter only advances when a story is successfully inserted, satisfying transactional safety (counter rolls back on any failure before DB commit).

## Migration

New file `packages/server/migrations/004_story_seq.sql`:

```sql
ALTER TABLE stories ADD COLUMN seq INTEGER;
CREATE UNIQUE INDEX idx_stories_seq ON stories(seq) WHERE seq IS NOT NULL;
```

Old stories get `seq = NULL`. The partial unique index prevents two new-format stories from sharing a sequence number while ignoring NULLs from old-format rows.

## Changes to `StoryService`

**File:** `packages/server/src/stories/index.ts`

### `create()` — new ID generation

1. Query `SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM stories` to get the next integer
2. Build `id = 'US' + n`, `filePath = .../stories/US{n}.md`
3. `await writeFile(filePath, scaffoldStory(id, title, today))`
4. `INSERT INTO stories (..., seq = n)` — only reached if write succeeded

`toSlug()` and the date-based ID construction are removed (they were only used in `create()`).

`scaffoldStory(id, title, today)` is unchanged — still writes an ISO date into the frontmatter `created` field.

### `isValidStoryId()` — replaces `STORY_ID_REGEX`

The module-level constant is replaced with a function:

```ts
function isValidStoryId(id: string): boolean {
  return /^US\d+$/.test(id) || /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id);
}
```

All three callers — `get()`, `update()`, `archive()` — replace `STORY_ID_REGEX.test(id)` with `isValidStoryId(id)`. This keeps the path-traversal guard in place for both ID formats.

## Test changes

**File:** `packages/server/src/stories/__tests__/service.test.ts`

| Test | Change |
|------|--------|
| `create() returns a story with generated id` | Assert `id` matches `/^US\d+$/` |
| `create() writes file under docs/superpowers/stories` | Assert path ends with `/US1.md` |
| New: `create() assigns sequential ids` | Two creates return `US1` then `US2` |
| `get() returns null for invalid id format` | `US42` now resolves (valid new format); `../etc/passwd` and `not-a-valid-id` still return null |

Tests that hardcode old-format IDs directly (e.g. `US-2026-01-01-title-test` in `upsertRow` tests, stale-row tests) are untouched — they call `upsertRow()` directly, bypassing `create()`.

## Behaviour at the boundaries

| Scenario | Outcome |
|----------|---------|
| First story on a fresh install | `US1` |
| `n`-th story created | `US{n}` |
| File write fails before DB insert | `MAX(seq)` unchanged; next retry allocates the same `n` |
| All new-format stories deleted | `MAX(seq)` returns NULL; next story is `US1` (reuse is acceptable — deleted stories are archived, not conflicting) |
| Old-format story fetched via `GET /api/stories/:id` | Still resolves; `isValidStoryId()` accepts both formats |
| Old-format stories in `list()` | Returned unchanged |

## What does NOT change

- `scaffoldStory()` in `template.ts` — signature and output unchanged
- `parseFrontmatter()` in `@cc/shared` — already uses `z.string()` for `id`, format-agnostic
- `applyPatch()`, `upsertRow()`, `reconcile()`, `handleFileEvent()` — no changes needed
- Old story files on disk — not renamed, not touched
- API route layer in `api/stories.ts` — no changes
