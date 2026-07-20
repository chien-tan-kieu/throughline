# Plan: Auto-handoff / Cross-session Memory

**Date:** 2026-06-22
**Spec:** `docs/superpowers/specs/2026-06-22-auto-handoff-cross-session-memory-design.md`
**Status:** Ready to implement

## Constraints (read first)

- **TDD is mandatory.** For every task: write the failing test FIRST, run it, confirm it
  fails for the *right reason* (not a typo / missing import), then write the minimal
  implementation, then run the full server suite green before moving on.
- **Surgical changes only.** Touch only the files each task names. Match existing style
  (mining via `JSON_EXTRACT`, `Bun.write`/`Bun.file`, route mounting). No speculative
  abstraction, no unrelated refactors.
- **DO NOT commit / push / `git add`.** Leave everything uncommitted for human review.
- **Test runner:** server uses `bun test`. Run `cd packages/server && bun test` for the
  full suite, or `cd packages/server && bun test <path>` for a single file.
- **No web change.** Nothing under `packages/web/src` is touched, so `bun run build` is
  NOT required for this feature.
- Plugin `.md`/`.sh` surfaces (Tasks 6–8) are not unit-tested in this repo; verify them
  by inspection against the existing command/bootstrap patterns.

## Dependency order

```
Task 1  migration 005 (schema: story_id nullable + session_id column)
   │
Task 2  HandoffService.generateForSession + content mining ("## This session")
   │        (depends on the new schema for the row insert)
   ├── Task 3  GET /api/handoffs/latest endpoint (+ list() exposes session_id)
   │
   └── Task 4  hook-dispatch wiring (dispatchEvent / handleHookEvent / server.ts)
            │      (depends on generateForSession existing)
   │
Task 5  index.ts/api wiring confirmation + integration test through startDaemon
   │
Task 6  plugin /throughline:resume command (new)
Task 7  plugin /throughline:start handoff injection (+ mode files)
Task 8  plugin bootstrap.sh SessionStart nudge
```

Tasks 6–8 depend only on Task 3 (the endpoint shape) and are independent of each other.

---

## Task 1 — Migration 005: relax `story_id`, add `session_id`

**Goal:** Rebuild the `handoffs` table so `story_id` is nullable and a new
`session_id TEXT NULL` column exists, preserving existing rows.

**Files touched**
- `packages/server/migrations/005_handoff_session.sql` (new)
- `packages/server/src/store/__tests__/migrate.test.ts` (add tests)

**Why a rebuild:** SQLite cannot drop a `NOT NULL` constraint in place. Follow the
spec's recreate-copy-drop-rename sequence and recreate the two indexes from migration
003 (`idx_handoffs_story`, `idx_handoffs_ts`).

### Steps (TDD)

1. **Failing test — new column + nullable story_id.** In `migrate.test.ts`, add:
   - a test asserting `PRAGMA table_info(handoffs)` includes `session_id`.
   - a test asserting `story_id`'s `notnull` flag is `0` (query
     `PRAGMA table_info(handoffs)` and assert the row for `story_id` has `notnull === 0`).
   Run `cd packages/server && bun test src/store/__tests__/migrate.test.ts`; confirm both
   fail (no `session_id` column; `story_id` still NOT NULL).

2. **Failing test — row survival.** Add a test that, after `runMigrations`, but note the
   migration runner applies all files at once. To test survival of a *pre-existing* row,
   the test must: run migrations through 004 only is not supported by the runner (it runs
   all). Instead, seed a row through the public schema after full migration and assert it
   round-trips with `session_id` NULL — i.e. insert a story handoff row
   `(story_id='US-x', session_id=NULL, file_path='/p', generated_at=<ts>)` and assert it
   reads back with `story_id='US-x'` and `session_id IS NULL`. (Pre-005 row preservation
   is exercised structurally by the copy `SELECT` in the SQL; the runtime DB is always
   migrated in full, so the meaningful regression guard is that the copy clause names the
   right columns and a story-id row survives.) Confirm it fails (insert with explicit
   `session_id` column fails — column does not exist yet).

3. **Update the existing idempotency test.** The test
   `"running migrations twice is idempotent"` asserts `count` === `4`. After adding the
   5th migration file this must become `5`. Change `expect(count).toBe(4)` to
   `expect(count).toBe(5)` and its comment. (This is an expected, in-scope edit — the
   count is the number of migration files.) Confirm it now fails before the SQL exists if
   you reorder, but practically you write the SQL in the same step.

4. **Minimal implementation — write `005_handoff_session.sql`** with exactly:
   - `CREATE TABLE handoffs_new (id INTEGER PRIMARY KEY AUTOINCREMENT, story_id TEXT, session_id TEXT, file_path TEXT NOT NULL, generated_at INTEGER NOT NULL);`
   - `INSERT INTO handoffs_new (id, story_id, session_id, file_path, generated_at) SELECT id, story_id, NULL, file_path, generated_at FROM handoffs;`
   - `DROP TABLE handoffs;`
   - `ALTER TABLE handoffs_new RENAME TO handoffs;`
   - `CREATE INDEX IF NOT EXISTS idx_handoffs_story ON handoffs(story_id);`
   - `CREATE INDEX IF NOT EXISTS idx_handoffs_ts ON handoffs(generated_at DESC);`

5. **Green.** Run the migrate test file, then the full suite
   `cd packages/server && bun test`. All green.

**Note:** the existing `migrate.test.ts` `"handoffs table has expected columns"` test
still passes (id/story_id/file_path/generated_at all remain). Optionally extend it to also
assert `session_id`, but the dedicated test in step 1 already covers that.

---

## Task 2 — `HandoffService.generateForSession(sessionId)` + content mining

**Goal:** Add a new public method that always writes a handoff *for a session*, mining a
deterministic `## This session` activity block from the `events` table, producing a story
handoff when the session has a resolvable `active_story_id` and a session handoff
otherwise, and inserting one `handoffs` row.

**Files touched**
- `packages/server/src/handoff/index.ts` (add `generateForSession`, helpers; refactor
  shared internals minimally; update `list()` to expose `session_id`)
- `packages/server/src/handoff/__tests__/service.test.ts` (add tests)

**Key facts from the codebase**
- `events` table: `(id, session_id, subagent_id, event_name, payload_json, ts)`. Mine with
  `JSON_EXTRACT(payload_json, '$.tool_name')`, `'$.tool_input.file_path'`,
  `'$.tool_input.command'`, `'$.prompt'` — mirroring `StandupService`.
- `event_name` column holds the hook event name (e.g. `PostToolUse`,
  `PostToolUseFailure`, `UserPromptSubmit`). Tool name lives in the payload, not the
  column.
- `sessions` has `started_at INTEGER` and `active_story_id` (set via PATCH). Time range =
  `started_at` → max `events.ts` for the session.
- Story handoff filename: `<date>-<storyId>.md` (matches existing `generate()`).
  Session handoff filename: `<date>-session-<short-session-id>.md` where short id is a
  prefix of the session id (e.g. first 8 chars). Overwrite-on-repeat is automatic because
  `Bun.write` overwrites and the name is stable per day.
- The static story sections (`# Handoff: <title>`, story/status/size line, `## Next Up`
  via `extractPlanSummary`, `## Story Body` with frontmatter stripped) must be reused
  verbatim from `generate()`. Refactor those into a private helper
  (e.g. `buildStorySections(story): Promise<string>`) that both `generate()` and
  `generateForSession()` call, so `generate()`'s public behavior/return shape is
  unchanged.

### Mining rules (deterministic; sections omitted/`(none)` when empty)

- **Time range** — `started_at` to last `events.ts` for the session, human-readable.
- **Files edited** — `event_name = 'PostToolUse'` AND
  `JSON_EXTRACT(payload_json,'$.tool_name') IN ('Edit','Write')`, take
  `'$.tool_input.file_path'`, dedupe, sort.
- **Commits** — `tool_name='Bash'` and `'$.tool_input.command'` matches a git-commit
  pattern (e.g. `/\bgit commit\b/`). List the commands.
- **Test runs** — `tool_name='Bash'` and command contains `test`. List the commands.
- **Tools failing ≥3×** — `event_name='PostToolUseFailure'` grouped by
  `JSON_EXTRACT(payload_json,'$.tool_name')`, `HAVING COUNT(*) >= 3` (same threshold as
  standup). Report each such tool.
- **Goal (session handoff only)** — first `UserPromptSubmit` for the session (lowest
  `ts`), `'$.prompt'`, rendered as a `Goal:` line. Only when there is no active story.

### Composition

| Kind | Header | This session | Goal | Next Up | Story Body |
|------|--------|--------------|------|---------|------------|
| Story handoff | `# Handoff: <title>` + story/status/size line | yes | — | yes | yes |
| Session handoff | `# Handoff` (session) | yes | yes | — | — |

`## This session` header is ALWAYS present (even with no qualifying events).

### Steps (TDD)

1. **Failing test — session handoff (no active story).** Add a test that:
   - seeds a `sessions` row (no `active_story_id`) with a known `started_at`.
   - seeds `events` for that session: a `UserPromptSubmit` with `prompt`, two
     `PostToolUse` Edit/Write events with distinct `file_path`s (+ a duplicate to prove
     dedupe), a `Bash` `PostToolUse` with `command:"git commit -m x"`, a `Bash`
     `PostToolUse` with `command:"bun test"`, and three `PostToolUseFailure` events with
     the same `tool_name`.
   - calls `await svc.generateForSession(sessionId)`.
   - asserts: `filePath` ends with `<date>-session-<short-id>.md`; `content` contains
     `## This session`, the deduped file paths, the commit command, the test command, the
     failing tool name, and a `Goal:` line with the prompt; `content` does NOT contain
     `## Next Up` or `## Story Body`; a `handoffs` row exists with `session_id` set and
     `story_id` NULL.
   Run the file; confirm it fails because `generateForSession` does not exist.

2. **Failing test — story handoff (active story).** Same event seeding, but the session's
   `active_story_id` points at a seeded story with a linked plan (reuse the
   `seedStoryFile` helper + the plan-file pattern from the existing
   `"includes 'next up'"` test). Assert: `filePath` ends with `<date>-<storyId>.md`;
   `content` contains `# Handoff: <title>`, the `## Next Up` task line from
   `extractPlanSummary`, `## Story Body`, AND `## This session`; a row exists with BOTH
   `story_id` and `session_id` set. Confirm failure.

3. **Failing test — overwrite-on-repeat.** Call `generateForSession` twice for the same
   session on the same day; assert the returned `filePath` is identical both times (stable
   filename, no second litter file). Assert row-insert behavior matches the spec (one row
   per call — the spec says "inserts one row" per run). Confirm failure.

4. **Failing test — empty activity.** Seed a `sessions` row with no events; call
   `generateForSession`; assert it does not throw and `content` contains the
   `## This session` header. Confirm failure.

5. **Minimal implementation.** In `handoff/index.ts`:
   - Extract `buildStorySections(story)` from `generate()`; have `generate()` call it so
     its output/shape is byte-identical to today.
   - Add `private mineSession(sessionId): { timeRange, files, commits, tests, failing,
     firstPrompt }` using `JSON_EXTRACT` queries against `events`/`sessions`.
   - Add `private renderThisSession(mined): string` producing the `## This session` block
     with `(none)` placeholders for empty subsections.
   - Add `async generateForSession(sessionId)`: look up the session + `active_story_id`;
     resolve the story (if any); compose content (story sections + this-session for story
     handoff; header + this-session + Goal for session handoff); `mkdir -p` the handoffs
     dir; choose filename per kind; `Bun.write`; insert one `handoffs` row with
     `(story_id, session_id, file_path, generated_at)`.

6. **Update `list()`** to `SELECT id, story_id, session_id, file_path, generated_at` and
   widen its return type to include `session_id: string | null`. Confirm existing
   `GET /api/handoffs` tests still pass (the array shape only gains a field).

7. **Green.** Run the handoff test file, then full suite.

---

## Task 3 — `GET /api/handoffs/latest[?story=<id>]`

**Goal:** Add the latest-handoff endpoint that returns the most recent row (optionally
filtered by story), enriched with `title`, file `content`, and a relative `age` string;
`404` when none.

**Files touched**
- `packages/server/src/handoff/index.ts` (add a `latest(storyId?)` query method)
- `packages/server/src/api/handoff.ts` (add the route)
- `packages/server/src/api/__tests__/standup-handoff.test.ts` (add tests)

**Wiring note:** `mountHandoffRoutes` already receives `ctx.handoff` and is reached for
any path starting with `/api/handoff` (see `api/index.ts`). The new route lives inside the
existing `mountHandoffRoutes` and is automatically authenticated like all `/api/*` routes.
Match the existing route there on `url.pathname === "/api/handoffs/latest"` BEFORE the
`/api/handoffs` list check is fine since they differ, but place the `latest` match before
the generic `/api/handoff/(.+)` regex so it isn't swallowed.

**Response shape (200):** `{ id, story_id, session_id, file_path, generated_at, title,
content, age }`.
- `title`: story handoff → `Handoff: <story title>` (look up the story by `story_id`);
  session handoff → a session-oriented title (e.g. `Session handoff`).
- `content`: `await Bun.file(file_path).text().catch(() => "")` (empty string if missing,
  consistent with existing fallbacks).
- `age`: relative string from `generated_at` vs `Date.now()` (`just now`, `Nh ago`,
  `Nd ago`). Implement a small pure helper.

### Steps (TDD)

1. **Failing test — 404 when empty.** In `standup-handoff.test.ts`, add a test:
   `GET /api/handoffs/latest` against the fresh daemon returns `404`. Run
   `cd packages/server && bun test src/api/__tests__/standup-handoff.test.ts`; confirm it
   fails (route falls through to the generic 404 today — verify it fails for the *shape*
   you assert, e.g. you also assert it's specifically the latest route; otherwise this may
   already 404 generically — make the assertion meaningful by also seeding a row in a
   later test).

2. **Failing test — latest overall.** Seed two `handoffs` rows via `daemon.db.run` (one
   story, one session) with a real file on disk (write the file, point `file_path` at it);
   assert `GET /api/handoffs/latest` returns the newer row with `title`, non-empty
   `content`, and an `age` string. Confirm failure.

3. **Failing test — latest by story.** Seed rows for two different `story_id`s; assert
   `GET /api/handoffs/latest?story=<id>` returns the newest row for that story. Confirm
   failure.

4. **Minimal implementation.**
   - In `handoff/index.ts` add `latest(storyId?: string)` returning the newest row
     (`ORDER BY generated_at DESC LIMIT 1`, with `WHERE story_id = ?` when `storyId`).
   - In `api/handoff.ts` add, before the `/api/handoff/(.+)` regex:
     `if (req.method === "GET" && url.pathname === "/api/handoffs/latest") { ... }` —
     read `?story`, call `handoff.latest(story)`, `404` if none, else read file content,
     derive title (story lookup) and age, `Response.json(body)`.

5. **Green.** Run the API test file, then full suite.

---

## Task 4 — Hook-dispatch wiring (SessionEnd / PreCompact → generateForSession)

**Goal:** Thread `HandoffService` through `handleHookEvent` → `dispatchEvent`, and on
`SessionEnd`/`PreCompact` fire `generateForSession(session_id)` as fire-and-forget. The
observer must never block or throw; event persistence + bus publish are unchanged. When
`handoff` is undefined, no generation happens.

**Files touched**
- `packages/server/src/hooks/handlers.ts` (`dispatchEvent` gains trailing
  `handoff?: HandoffService`; add the SessionEnd/PreCompact branch)
- `packages/server/src/hooks/index.ts` (`handleHookEvent` gains trailing
  `handoff?: HandoffService`, passes it to `dispatchEvent`)
- `packages/server/src/server.ts` (the `handleHookEvent(...)` call also passes
  `config.apiCtx?.handoff`)
- `packages/server/src/hooks/__tests__/observer-contract.test.ts` (add a dedicated
  describe block, or a new test file `handlers-handoff.test.ts`) for the trigger

**Critical invariant (spec):** `generateForSession(...).catch(() => {})` — not awaited,
rejection swallowed. `dispatchEvent` still returns `200 {}` synchronously w.r.t. the POST.

### Steps (TDD)

1. **Failing test — SessionEnd triggers generation.** New test (prefer a new file
   `packages/server/src/hooks/__tests__/handlers-handoff.test.ts` to keep the existing
   observer-contract file focused). Build a fake/minimal `HandoffService`-shaped object
   with a `generateForSession` spy (e.g. a jest-style mock or a counter). Call
   `handleHookEvent("SessionEnd", payload, db, stubBus, undefined, fakeHandoff)`. Assert:
   response is `200`/`{}`, AND `generateForSession` was called with the payload
   `session_id`. Confirm it fails (signature doesn't accept the 6th arg / branch absent).

2. **Failing test — PreCompact triggers; PostToolUse does not.** Same setup: assert
   `PreCompact` calls the spy and `PostToolUse` does not. Confirm failure.

3. **Failing test — rejection is swallowed, ingestion intact.** Fake `generateForSession`
   returns a rejected promise. Call `handleHookEvent("SessionEnd", ...)`. Assert: response
   is still `200 {}`; the event row was persisted (`SELECT COUNT(*) FROM events WHERE
   session_id = ?` > 0). Use a microtask flush if needed
   (`await Promise.resolve()`/`await new Promise(r=>setTimeout(r,0))`) so the rejection
   would surface if not caught — but the test passes precisely because it's caught.
   Confirm failure.

4. **Failing test — undefined handoff degrades gracefully.** Call
   `handleHookEvent("SessionEnd", payload, db, stubBus)` (no handoff). Assert `200 {}` and
   event persisted, no throw. (May already pass once signatures are optional — keep it as
   a regression guard.) Confirm it currently fails only if you assert the new param shape;
   otherwise it's a guard added alongside.

5. **Minimal implementation.**
   - `handlers.ts`: add `handoff?: HandoffService` param (import the type). After the
     existing persist/publish, add:
     ```
     if (handoff && (event.hook_event_name === "SessionEnd" ||
                     event.hook_event_name === "PreCompact")) {
       handoff.generateForSession(event.session_id).catch(() => {});
     }
     ```
     placed so it does not affect the returned `200 {}` Response.
   - `index.ts`: add trailing `handoff?: HandoffService`, pass it as the trailing arg to
     `dispatchEvent`.
   - `server.ts`: add `config.apiCtx?.handoff` as the trailing argument to the existing
     `handleHookEvent(hookMatch[1], body, db, bus, config.apiCtx?.watcher, ...)` call.

6. **Green.** Run the new hooks test, the observer-contract test (must still pass — all
   events still return `200 {}`), then full suite.

---

## Task 5 — End-to-end wiring confirmation through `startDaemon`

**Goal:** Confirm `ApiCtx.handoff` flows from `index.ts` → `server.ts` hook path and that
an auto-generated handoff becomes retrievable via the new endpoint. `ApiCtx.handoff` is
already constructed at `index.ts:65` and added to `apiCtx`; no `index.ts` source change is
expected — this task is the integration guard.

**Files touched**
- `packages/server/src/api/__tests__/standup-handoff.test.ts` (add one integration test)
- (only if the test reveals a gap) `packages/server/src/index.ts` / `server.ts`

### Steps (TDD)

1. **Failing test — POST hook auto-generates a retrievable handoff.** Against the live
   daemon: seed a `sessions` row (via `daemon.db`) and a few `events`, then POST a
   `SessionEnd` hook to `/hooks/SessionEnd` with that `session_id` (use the same bearer +
   Host headers; check `server.ts` for the `/hooks/` route auth — it is rate-limited and
   returns `{}`). Then poll/await briefly and `GET /api/handoffs/latest`; assert it returns
   `200` with content containing `## This session`. Confirm it fails before Task 4 wiring
   (it will pass after Task 4 if wiring is correct; if it fails here, the gap is in
   `server.ts` passing `config.apiCtx?.handoff`).

   Note on async timing: generation is fire-and-forget, so the test must tolerate the
   write completing slightly after the `200`. Use a short retry loop on
   `/api/handoffs/latest` (e.g. up to ~1s) rather than a fixed sleep.

2. **Green.** Full suite.

---

## Task 6 — Plugin command `/throughline:resume` (new)

**Goal:** New command that fetches the latest handoff (optionally by story) and prints its
content into context.

**Files touched**
- `plugin/commands/resume.md` (new)

**Pattern source:** copy the boilerplate from `plugin/commands/handoff.md` (ensure-daemon
block; `cat .throughline/runtime.json` for `port`/`token`; curl with
`Authorization: Bearer <token>` and `Host: 127.0.0.1:<port>`). The marketplace jq key is
`"throughline-local"`.

### Content (no test — verify by inspection)
1. Frontmatter: `description: ...`, `allowed-tools: [Bash]`.
2. Ensure daemon running (ensure-daemon block).
3. `cat .throughline/runtime.json`; parse `port`, `token`.
4. `GET /api/handoffs/latest` — append `?story=<arg>` when an argument is supplied.
5. If `200`: print the handoff `content` into context, optionally prefaced with `title`
   and `age`.
6. If `404`: print `No handoff found.`

Verify the file's structure matches the existing command style (headings, fenced bash,
explicit status-code handling).

---

## Task 7 — `/throughline:start` handoff injection + mode files

**Goal:** After `/start` fetches the story and PATCHes the active story, fetch the latest
story handoff and inject it as `## Last handoff` into the mode-file context; absence/curl
failure leaves behavior unchanged.

**Files touched**
- `plugin/commands/start.md`
- `plugin/commands/lib/start/backlog.md`
- `plugin/commands/lib/start/in-progress.md`
- `plugin/commands/lib/start/done.md`

### Content (no test — verify by inspection)
1. In `start.md`, add a step after 3b (the active-story PATCH):
   `GET /api/handoffs/latest?story=<story-id>` using the existing bearer/Host curl
   pattern. If `200`, inject `content` under a `## Last handoff` heading into the mode-file
   context. If `404` or curl fails, proceed unchanged.
2. Update the trailing "story context available to the mode file" sentence in `start.md`
   (currently lists `id`, `title`, `status`, `body`, `linked_spec_path`,
   `linked_plan_path`, `created_at`, `port`, `token`) to also mention `## Last handoff`
   may be present.
3. In each of `backlog.md`, `in-progress.md`, `done.md`, add a one-line instruction to
   read the `## Last handoff` context if present.

---

## Task 8 — `bootstrap.sh` SessionStart nudge

**Goal:** After a successful daemon probe, best-effort fetch the latest handoff and append
ONE nudge line to the `additionalContext` emitted by `emit_context()`. Any failure is
swallowed; existing constitution/guidelines context is unchanged.

**Files touched**
- `plugin/hooks/bootstrap.sh`

### Content (no test — verify by inspection)
- Inside `emit_context()` (where `RUNTIME` exists and the probe has succeeded), read
  `PORT` and `TOKEN` from `runtime.json` via `jq`, then
  `curl -sf --max-time 2 -H "Authorization: Bearer $TOKEN" -H "Host: 127.0.0.1:$PORT"
  "http://127.0.0.1:$PORT/api/handoffs/latest"` (swallow errors with `2>/dev/null` /
  `|| true`).
- If a handoff is returned, parse `age` and `title` with `jq` and append exactly one line
  to the `additionalContext` string:
  `⏮ Recent handoff (<age>): <title>. Run /throughline:resume to load it.`
- Surface the latest handoff regardless of age (no cutoff). On any failure (daemon flake,
  missing token, parse error, no handoff / `404`), emit context exactly as today — the
  nudge is purely additive and must never break session start.
- Keep the change minimal and inside the existing `emit_context` flow so both probe
  branches (`if probe` and the spawn-then-probe loop) benefit.

---

## Final verification

1. `cd packages/server && bun test` — full server suite green.
2. Re-read the three plugin `.md` surfaces and `bootstrap.sh` against their sibling files
   for pattern consistency.
3. Confirm no `packages/web/src` change was made (so no `bun run build` needed).
4. Leave all changes uncommitted. Do NOT `git add` / commit / push.
```