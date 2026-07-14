# Start Command Status-Branching Design

**Date:** 2026-06-07
**Status:** approved

## Overview

The `/throughline:start` command currently always invokes `superpowers:brainstorming` regardless of story status. This spec changes step 4 to branch on status — dispatching to a mode file that contains the appropriate workflow for that story's state. The mode files live under `plugin/commands/lib/start/` and are loaded at runtime via the `Read` tool.

## Motivation

A `backlog` story needs a design conversation. An `in-progress` story needs a progress review. A `done` story needs a closure review of its acceptance criteria. Treating all three identically wastes context and loses the opportunity to orient the session correctly from the first message.

## File Structure

```
plugin/commands/
  start.md                        ← updated: steps 1–3b unchanged, step 4 dispatches
  lib/
    ensure-daemon.sh              ← unchanged
    start/                        ← new
      backlog.md                  ← invoke superpowers:brainstorming
      in-progress.md              ← progress review workflow
      done.md                     ← acceptance criteria closure review
```

Mode files live under `lib/start/` rather than `commands/start/` to avoid any risk of being registered as slash commands, consistent with the existing convention that `lib/` holds non-command helpers.

## Status Enum

Confirmed values (from server code, tests, and story template):

| Value | Meaning |
|-------|---------|
| `backlog` | Not yet started |
| `in-progress` | Actively being worked on |
| `done` | Shipped |

The schema uses `z.string()` — no compile-time guard. Unrecognized values fall back to backlog behavior (see Dispatch Logic below).

## Updated `start.md` — Step 4

Steps 1–3b are unchanged (daemon bootstrap, runtime.json parse, story fetch, active story patch).

Step 4 replaces the current unconditional brainstorming invocation:

1. Run bash to resolve the install location and construct the mode file path:
   ```bash
   INSTALL=$(jq -r '."throughline-local".installLocation' ~/.claude/plugins/known_marketplaces.json)
   echo "$INSTALL/plugin/commands/lib/start/<status>.md"
   ```
2. Use the `Read` tool on the absolute path returned above.
3. Follow the instructions in the loaded file exactly.
4. **Fallback:** If the status is not one of `backlog`, `in-progress`, `done` (or the file does not exist), print a note that the status is unrecognized and proceed as if status were `backlog`.

`Read` is already in `start.md`'s `allowed-tools` — no manifest change needed.

## Mode File Behaviors

### `backlog.md`

Invokes `superpowers:brainstorming` with the story as context — identical to the current step 4. No behavior change for backlog stories.

### `in-progress.md`

Produces a structured progress report for a story currently being implemented.

**Data sources (in priority order):**

1. **Parsed plan** — fetch via `GET /api/plans/<linked_plan_path>` if `linked_plan_path` is set. The parsed plan's task and step states (`todo` / `done`) are the primary completion signal.
2. **Git log** — run `git log --oneline --since=<created_at_date>` for timeline context. `created_at` from the API is a Unix timestamp in milliseconds; convert to a date string (`date -r $((created_at/1000)) +%Y-%m-%d` on macOS) before passing to git. Used as secondary color only — not used to infer which acceptance criteria are met.
3. **Acceptance criteria** — extracted from the story body (the `## Acceptance criteria` section).

**Report structure:**

```
## Progress: <story title>

### Plan status
<task list with step completion counts, e.g. "Task 1 — 3/4 steps done">
Overall: N/M tasks complete

### Recent activity
<last 5–10 git commits as one-liners>

### Acceptance criteria
<each criterion listed, marked as likely met / outstanding based on plan completion>

### Recommended next step
<one clear next action to move toward done>
```

If no plan is linked, skip the Plan status section and note that no plan is linked. If no acceptance criteria section exists in the story body, note that and skip.

### `done.md`

Produces a closure review for a completed story.

**Data sources:**

1. **Acceptance criteria** — extracted from the story body.
2. **Git log** — `git log --oneline --since=<created_at_date>` to summarize what was shipped. Same `created_at` milliseconds-to-date conversion applies.
3. **Linked documents** — filenames of `linked_spec_path` and `linked_plan_path` (if set) as context signals. Checkbox state in the story body is **not** used to assess completion — checkboxes remain unchecked in the file even when a story is done.

**Report structure:**

```
## Closure review: <story title>

### What was shipped
<3–6 bullet points derived from git log, grouped by concern>

### Acceptance criteria review
<each criterion listed with a brief assessment of whether it was met,
 based on git commits and linked spec/plan context>

### Deliberately deferred
<anything the acceptance criteria mention that was explicitly out of scope,
 or "None identified" if everything appears covered>
```

## Testing

No automated tests for command `.md` files — they are prose instructions, not code. Verification is manual:

- Start a `backlog` story → brainstorming launches as before
- Start an `in-progress` story → progress report produced with plan status and git log
- Start a `done` story → closure review produced with AC assessment
- Start a story with an unrecognized status → fallback message printed, brainstorming proceeds
- Plugin install location unreachable → bash one-liner fails gracefully; Claude surfaces the error
