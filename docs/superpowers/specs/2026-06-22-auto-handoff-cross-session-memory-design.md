# Spec: Auto-handoff / Cross-session Memory

**Date:** 2026-06-22
**Status:** Approved design — ready to implement
**Source:** Advisor review recommendation #2

## Overview / Goal

Today a handoff document is only produced when a human explicitly runs
`/throughline:handoff <story-id>` (which POSTs `/api/handoff/:storyId`). The content
is static: it is derived purely from the story file and the linked plan. Nothing
captures what the session *actually did*, and nothing automatically restores that
context when work resumes in a new session.

This feature closes that loop. It does three things:

1. **Auto-generate** a handoff when a session ends or compacts, with no new hook
   scripts and no human action.
2. **Enrich** the handoff with a deterministic "This session" activity block mined
   from the event log (files edited, commits, test runs, failing tools, time
   range, and — for sessionless work — the first user prompt as the goal). This
   activity block is the cross-session-memory "moat."
3. **Auto-surface and auto-load** the most recent handoff when resuming, via a
   `SessionStart` nudge (`bootstrap.sh`), a new `/throughline:resume` command, and
   handoff injection into `/throughline:start`.

A handoff is always generated **for a session**. If that session has an active
story, the handoff row also carries the story id ("story handoff"); otherwise it
carries only the session id ("session handoff"). The two kinds are distinguished
solely by whether `story_id` is set — there is no extra column.

## Architecture & Data Flow

### Auto-generation trigger (server-side only)

The plugin's `forward.sh` already POSTs every hook — including `SessionEnd` and
`PreCompact` — to `/hooks/<EVENT>`. The server receives these in
`packages/server/src/server.ts`, which calls
`handleHookEvent(...)` → `dispatchEvent(event, db, bus)`.

No new hook scripts are added. Instead, `dispatchEvent` gains an additional
observer step:

```
forward.sh  ──POST /hooks/SessionEnd──▶  server.ts
                                           └─▶ handleHookEvent(eventName, body, db, bus, watcher, handoff)
                                                 └─▶ dispatchEvent(event, db, bus, handoff)
                                                       ├─ persistEvent(db, event)          (existing)
                                                       ├─ bus.publish({ type: "hook", ... }) (existing)
                                                       └─ if hook_event_name ∈ {SessionEnd, PreCompact}:
                                                            handoff.generateForSession(event.session_id)
                                                              .catch(() => {})   ◀── fire-and-forget
```

Critical invariant: **the observer must never block or throw.** The call to
`generateForSession` is fire-and-forget — its returned promise is not awaited and
its rejection is swallowed with `.catch(() => {})`. `dispatchEvent` returns its
`200` response exactly as it does today, synchronously with respect to the hook
POST. A failure to generate a handoff must never affect hook ingestion.

### Threading HandoffService into the hook handler

`HandoffService` is constructed at `packages/server/src/index.ts:65` and is already
present on `ApiCtx.handoff`. It is threaded into the hook path exactly the way
`watcher` is threaded today:

- `packages/server/src/hooks/index.ts` — `handleHookEvent` signature gains a
  trailing optional parameter `handoff?: HandoffService`, passed through to
  `dispatchEvent`.
- `packages/server/src/hooks/handlers.ts` — `dispatchEvent` signature gains a
  trailing optional parameter `handoff?: HandoffService`.
- `packages/server/src/server.ts` (the `handleHookEvent` call site, currently
  passing `config.apiCtx?.watcher`) — also passes `config.apiCtx?.handoff`.

When `handoff` is undefined (e.g. in tests that do not wire it), the auto-generation
step is skipped; event persistence and bus publishing are unaffected.

### Resume / surfacing data flow

```
SessionStart ─▶ bootstrap.sh probe OK ─▶ curl /api/handoffs/latest
                                          └─ if present: append 1 nudge line to additionalContext
                                                          "⏮ Recent handoff (<age>): <title>. Run /throughline:resume to load it."

/throughline:resume ─▶ GET /api/handoffs/latest[?story=<id>] ─▶ print handoff content into context
/throughline:start  ─▶ GET /api/handoffs/latest?story=<story-id> ─▶ inject as "## Last handoff" into mode-file context
```

## Data Model (migration)

New migration: `packages/server/migrations/005_handoff_session.sql`.

SQLite cannot drop a `NOT NULL` constraint in place, so the table is rebuilt: create
a new table with the relaxed schema, copy rows, drop the old table, rename the new
one, and recreate the indexes.

Target schema for `handoffs`:

| Column | Type | Nullability | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | unchanged |
| `story_id` | TEXT | **NULL** (was NOT NULL) | set for story handoffs, null for session handoffs |
| `session_id` | TEXT | **NULL** (new column) | set for every auto-generated handoff |
| `file_path` | TEXT | NOT NULL | unchanged |
| `generated_at` | INTEGER | NOT NULL | unchanged |

Migration steps (plain SQL, run in order like the existing migrations):

1. Create `handoffs_new` with the target schema above (`story_id TEXT NULL`,
   `session_id TEXT NULL`, `file_path TEXT NOT NULL`, `generated_at INTEGER NOT NULL`).
2. Copy existing rows: `INSERT INTO handoffs_new (id, story_id, session_id, file_path, generated_at) SELECT id, story_id, NULL, file_path, generated_at FROM handoffs;`
   — existing rows keep their `story_id`; their `session_id` is `NULL`.
3. `DROP TABLE handoffs;`
4. `ALTER TABLE handoffs_new RENAME TO handoffs;`
5. Recreate the indexes that existed in migration 003:
   `idx_handoffs_story` on `(story_id)` and `idx_handoffs_ts` on `(generated_at DESC)`.

**Kind derivation (no new column):**
- `story_id IS NOT NULL` → **story handoff**
- `story_id IS NULL` (and `session_id IS NOT NULL`) → **session handoff**

### Active-story lookup

`generateForSession(sessionId)` determines the active story by reading the session's
`active_story_id` (set via `PATCH /api/sessions/current`, per
`packages/server/src/api/sessions.ts`). If `active_story_id` is set and resolves to
an existing story, the run produces a **story handoff** (row carries both `story_id`
and `session_id`). Otherwise it produces a **session handoff** (row carries
`session_id` only, `story_id` NULL).

## Content Generation Rules

All activity content is **deterministic** and mined from the `events` table using
`JSON_EXTRACT(payload_json, '$.…')`, following the exact pattern already used by
`StandupService` (`packages/server/src/standup/index.ts`). The `events` table is
`(id, session_id, subagent_id, event_name, payload_json, ts)`; the full hook payload
is in `payload_json`.

### `generateForSession(sessionId)` — the "## This session" block

Always emitted (for both kinds). Mined from events for the given `session_id`:

- **Time range** — from the session's `started_at` to the `ts` of the last event
  for that session. Rendered as a human-readable range.
- **Files edited** — `PostToolUse` events where
  `JSON_EXTRACT(payload_json, '$.tool_name')` ∈ {`Edit`, `Write`}, taking
  `$.tool_input.file_path`, **deduped** to a distinct sorted list.
- **Commits** — `Bash` tool calls whose command matches a git-commit pattern
  (e.g. `git commit`). Listed as the commands observed.
- **Test runs** — `Bash` tool calls whose command matches a test pattern
  (e.g. contains `test`). Listed as the commands observed.
- **Tools failing ≥3×** — `PostToolUseFailure` events grouped by
  `JSON_EXTRACT(payload_json, '$.tool_name')`, reporting any tool with a count of
  3 or more (same threshold and grouping as the standup digest).
- **Goal (session handoff only)** — when there is no active story, also include the
  session's **first** `UserPromptSubmit` prompt rendered as a `Goal:` line.

Sections with no data are omitted or rendered with a neutral placeholder consistent
with the existing handoff style (e.g. `(none)`), but the `## This session` header is
always present.

### "## Next Up" + "## Story Body" — story handoffs only

These two sections are emitted **only** when the session has an active story. They
reuse the existing logic from `generate()` verbatim:

- **## Next Up** — `extractPlanSummary(planText)` over the story's
  `linked_plan_path` (the existing private method; the first task with no completed
  step, falling back to `(no plan yet)` / `(no tasks in plan)`).
- **## Story Body** — the story file contents with the leading frontmatter block
  stripped, exactly as `generate()` does today.

Resulting composition:

| Kind | Header line | This session | Goal | Next Up | Story Body |
|------|-------------|--------------|------|---------|------------|
| Story handoff | `# Handoff: <title>` + story/status/size line | ✓ | — | ✓ | ✓ |
| Session handoff | `# Handoff` (session) | ✓ | ✓ | — | — |

So: a **story handoff = today's static content (header, Next Up, Story Body) PLUS
the new "This session" activity block**; a **session handoff = the activity block +
Goal only**.

### Filenames (overwrite-on-repeat)

Files are written under `.throughline/handoffs/` (created with `mkdir -p` as today).
Repeated `PreCompact` events within the same day must not litter the directory, so
filenames are stable per day and overwritten on repeat:

- **Story handoff:** `<date>-<storyId>.md` (unchanged from current behavior).
- **Session handoff:** `<date>-session-<short-session-id>.md`, where
  `<date>` is the ISO date (`YYYY-MM-DD`) and `<short-session-id>` is a short prefix
  of the session id. Writing the same name again overwrites the previous file.

### Row insertion

After writing the file, `generateForSession` inserts one `handoffs` row:
`story_id` (may be NULL), `session_id` (set), `file_path`, `generated_at` (now).

### Relationship to the existing `generate(storyId)`

`generate(storyId)` continues to work unchanged for the manual
`POST /api/handoff/:storyId` path and must keep producing today's static story
handoff (it may delegate to shared internals where convenient, but its public
behavior and return shape are preserved). `GET /api/handoffs` (`list()`) continues
to work; with the schema change its rows now also expose `session_id`.

## API

### Existing (preserved)

- `GET /api/handoffs` — list all handoff rows, newest first. Unchanged behavior;
  rows now include `session_id`.
- `POST /api/handoff/:storyId` — manual story handoff via `generate(storyId)`.
  Unchanged: `201` with `{ filePath, content }`, `404` if story not found, `400`
  on invalid story id.

### New: `GET /api/handoffs/latest[?story=<id>]`

Mounted in `packages/server/src/api/handoff.ts` (the `/api/handoff*` route group),
authenticated like all other `/api/*` routes.

- **Without `?story`** — returns the single most recent handoff row by
  `generated_at` (any kind, story or session).
- **With `?story=<id>`** — returns the most recent handoff row whose
  `story_id = <id>`.

Response body (200):

```json
{
  "id": 42,
  "story_id": "US-2026-06-22-foo" | null,
  "session_id": "abc123…" | null,
  "file_path": ".throughline/handoffs/2026-06-22-US-…-foo.md",
  "generated_at": 1750000000000,
  "title": "Handoff: <story title>"  | "Session handoff",
  "content": "<full file content>",
  "age": "2h ago"
}
```

- `title` — derived from the handoff: for a story handoff, the story title
  (`Handoff: <title>`); for a session handoff, a session-oriented title.
- `content` — the file content read from `file_path` (empty string if the file is
  missing, consistent with the existing file-read fallbacks).
- `age` — a relative age string computed from `generated_at` vs now
  (e.g. `"just now"`, `"2h ago"`, `"3d ago"`).

When no matching handoff exists, return `404` (the callers — `/start`, `/resume`,
`bootstrap.sh` — all treat absence as "no handoff" and proceed unchanged).

## Plugin Surfaces

### 1. `/throughline:start <story>` — inject latest story handoff

In `plugin/commands/start.md`, after the story is fetched (and after the
best-effort active-story PATCH), add a step:

- `GET /api/handoffs/latest?story=<story-id>` using the existing bearer/host curl
  pattern.
- If present (`200`), inject the handoff `content` into the mode-file context under
  a new heading `## Last handoff`.
- If absent (`404`) or the curl fails, behavior is unchanged.

Update the documented "story context available to the mode file" list at the end of
`start.md` to include the handoff (`## Last handoff`) so the mode files know it may
be present.

The three mode files — `plugin/commands/lib/start/backlog.md`,
`in-progress.md`, and `done.md` — each get a one-line instruction to read the
`## Last handoff` context if it is present.

### 2. `/throughline:resume` — new command

New file `plugin/commands/resume.md`. Uses the same boilerplate as other commands:

1. Ensure the daemon is running (the `ensure-daemon.sh` bootstrap block used by
   `start.md` / `handoff.md`).
2. `cat .throughline/runtime.json` and parse `port` and `token`.
3. `GET /api/handoffs/latest` — and `?story=<id>` if an argument is given.
4. If a handoff is returned, print its `content` into context so the session
   resumes with it (optionally prefaced with title and age).
5. If none (`404`), print `No handoff found.`

This command is the target of the `SessionStart` nudge.

### 3. `bootstrap.sh` — SessionStart nudge

In `plugin/hooks/bootstrap.sh`, after a successful daemon probe (so `PORT`/`TOKEN`
from `runtime.json` are available), best-effort `curl` `/api/handoffs/latest`:

- If a handoff exists, append **one** line to the `additionalContext` string already
  emitted by `emit_context()`:
  `⏮ Recent handoff (<age>): <title>. Run /throughline:resume to load it.`
- The most recent handoff is surfaced **regardless of age**, but its relative `age`
  is shown.
- Any curl failure (daemon flake, missing token, parse error) is swallowed —
  bootstrap must never break session start. The existing constitution/guidelines
  context is emitted exactly as today; the nudge is purely additive.

## Testing Strategy

TDD is mandatory: for each unit below, write a failing test first, confirm it fails
for the right reason, implement the minimal change, then run the full suite green.
Server tests run with `cd packages/server && bun test`. Web is unaffected (no
`packages/web/src` change → no `bun run build` required).

### Migration

- A test that applies migrations through `005` and asserts the `handoffs` table now
  allows `story_id` NULL and has a `session_id` column.
- A test that pre-seeds a `handoffs` row under the old schema, runs the migration,
  and asserts the row survives with its `story_id` intact and `session_id` NULL.

### `HandoffService.generateForSession`

- **Session handoff (no active story):** seed `sessions` + `events`
  (`UserPromptSubmit`, `PostToolUse` Edit/Write, `Bash` git commit, `Bash` test,
  `PostToolUseFailure` ×3) for a session with no `active_story_id`. Assert: file
  written as `<date>-session-<short-id>.md`; content contains the `## This session`
  block with deduped files, commits, test runs, the failing tool, and a `Goal:`
  line from the first prompt; **no** `## Next Up` / `## Story Body`; a row is
  inserted with `session_id` set and `story_id` NULL.
- **Story handoff (active story):** same event seeding but with the session's
  `active_story_id` pointing at an existing story with a linked plan. Assert: file
  written as `<date>-<storyId>.md`; content contains the full static story sections
  (`# Handoff: <title>`, `## Next Up` from `extractPlanSummary`, `## Story Body`)
  **plus** the `## This session` block; a row is inserted with both `story_id` and
  `session_id` set.
- **Overwrite-on-repeat:** calling `generateForSession` twice for the same session
  on the same day writes the same filename (no second litter file) and the row
  count behaves as specified for the insert.
- **Empty activity:** a session with no qualifying events still produces the
  `## This session` header without throwing.

### Hook trigger (`dispatchEvent` / `handleHookEvent`)

- `SessionEnd` and `PreCompact` events invoke `generateForSession(session_id)` when
  a `HandoffService` is threaded in.
- Other event names (e.g. `PostToolUse`) do **not** invoke it.
- When `generateForSession` rejects, `dispatchEvent` still returns `200` and still
  persists the event and publishes to the bus (fire-and-forget with swallowed
  rejection — the observer never blocks or throws).
- When `handoff` is undefined, the path degrades gracefully (no generation, normal
  ingestion).

### API `GET /api/handoffs/latest`

- Returns the most recent row overall when no `?story` is given.
- Returns the most recent row for the given story when `?story=<id>` is given.
- Includes `title`, `content` (file body), and a relative `age` string.
- Returns `404` when no matching handoff exists.
- Requires auth like other `/api/*` routes.

### Preserved behavior

- `generate(storyId)` and `POST /api/handoff/:storyId` still produce today's static
  story handoff with the same response shape.
- `GET /api/handoffs` (`list()`) still returns rows newest-first.

## Out of Scope (YAGNI)

- LLM-authored or summarized handoff prose — content is deterministic, mined from
  the event log only.
- Capturing the actual compaction summary text emitted at `PreCompact`.
- Any prioritization, ranking, or scoring of handoffs beyond "most recent."
- Configurable cutoffs, retention windows, or age thresholds — the nudge surfaces
  the latest handoff regardless of age.
- Any `packages/web` dashboard UI for handoffs.
- New hook scripts — generation is triggered entirely server-side from the
  already-forwarded `SessionEnd` / `PreCompact` events.
