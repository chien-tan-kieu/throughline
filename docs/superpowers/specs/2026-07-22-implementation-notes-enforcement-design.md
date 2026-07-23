# Enforcing "Maintain Running Implementation Notes"

## Problem

`plugin/constitution.md` requires the agent to maintain a running
`implementation-notes.md` at the repo root while it works (Decisions outside
the spec, Deviations, Trade-offs, Anything else). In practice this rule is
read but not followed: `plugin/hooks/bootstrap.sh` injects the entire
constitution into context once, at `SessionStart`, via
`additionalContext`. As a session progresses — more tool calls, more
context, possibly a compaction — that one-shot injection loses salience and
the rule is never revisited.

The plugin's other hooks (`plugin/hooks/hooks.json` /
`plugin/hooks/forward.sh`) are wired for every lifecycle event already, but
today they are purely observational: they forward events to the local
daemon for the dashboard and never influence the agent's behavior mid-session.
`bootstrap.sh` states this explicitly: *"This plugin only observes — it
never blocks tool calls."*

## Goals

- Re-surface the "maintain running implementation notes" rule at a point in
  the session where the agent can still act on it, instead of relying on a
  single `SessionStart` injection.
- Keep the intervention self-correcting and bounded — never a hard,
  indefinite block.
- Avoid adding any new tool-call-level gating (Edit/Write stay unblocked, in
  keeping with the plugin's existing "observe only" stance for tool calls).

## Non-goals

- Blocking or denying any `PreToolUse` call. That principle is preserved
  as-is.
- Judging note *quality* or *content*. The mechanism only detects whether
  `implementation-notes.md` is stale relative to other changes — it cannot
  and does not evaluate whether an entry was meaningful.
- Enforcement outside a git repository. If the project root isn't a git
  work tree, the check is skipped entirely (see Edge Cases).

## Design

### Trigger point

A new hook script, `plugin/hooks/notes-check.sh`, is registered on the
`Stop` event in `plugin/hooks/hooks.json`, in addition to the existing
`forward.sh` entry for `Stop` (both run; order doesn't matter since they're
independent). `Stop` fires every time the agent's turn ends, giving the
rule a chance to resurface on every turn instead of only once per session.

### Detection logic

No new tool-call bookkeeping is introduced. The script uses git state,
which is already an accurate record of what changed regardless of how it
changed (`Edit`, `Write`, `NotebookEdit`, or a `Bash` command like `sed`/`mv`):

1. Resolve `PROJECT_ROOT` the same way existing hooks do
   (`${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}`).
2. If `PROJECT_ROOT` is not inside a git work tree, exit 0 immediately (no
   check performed — see Edge Cases).
3. Run `git status --porcelain` and collect changed files (modified,
   added, deleted, untracked-and-not-ignored), excluding
   `implementation-notes.md` and anything under `.throughline/`.
4. If that filtered list is empty, exit 0 — nothing changed, so there's
   nothing to log (this naturally covers read-only/investigation turns
   without any special-casing).
5. Otherwise:
   - If `implementation-notes.md` does not exist, treat it as stale.
   - If it exists, `stat` its mtime and compare against the newest mtime
     among the other changed files. If any other changed file is newer,
     treat it as stale.
6. If stale, emit a block decision (see below). If not stale (notes file is
   the most recently touched file, or the previous consecutive-block cap
   was already hit — see below), exit 0.

### Block-to-continue behavior

When staleness is detected and the per-session strike count (see State)
is below the cap, the script writes to stdout:

```json
{
  "decision": "block",
  "reason": "You've modified files since implementation-notes.md was last updated. If any of these changes involved a decision outside the spec, a deviation from it, or a speed/simplicity/correctness trade-off, log it now (one or two lines, under the right section). If none of this turn's changes warrant an entry, say so and proceed."
}
```

This forces the agent to address the reason before the turn is allowed to
end, but explicitly authorizes it to conclude "nothing worth logging" — the
hook cannot judge relevance, only staleness, so the escape valve has to be
textual and agent-driven.

### State & loop safety (2-strike cap)

To guarantee this can never deadlock a session (e.g., the agent keeps
editing without ever touching the notes file, or repeatedly judges nothing
is worth logging while the mtime staleness condition mechanically persists),
the script tracks a small per-session counter at
`.throughline/notes-nudge/<session_id>.count` (session id comes from the
hook's stdin JSON payload's `session_id` field — the same field
`packages/server/src/server.ts` reads when ingesting forwarded events).

- Each consecutive `Stop` where staleness is detected increments the
  counter and (while `< 2`) blocks.
- The moment `implementation-notes.md` becomes the newest touched file
  (i.e., staleness resolves), the counter resets to 0.
- On the counter's 3rd consecutive staleness detection, the script fails
  open: it does not block, and resets the counter to 0 (so a *later*, fresh
  round of edits after this point starts a clean 2-strike cycle).

This mirrors the constitution's own "escalate to advisor after 2 failed
iterations" convention (`plugin/constitution.md`), reusing a cap the rest of
the document already establishes as the project's threshold for "stop
forcing the same corrective action and let it through."

### Exclusions

- `implementation-notes.md` itself (obviously — it can't be stale relative
  to itself).
- `.throughline/**` — the plugin's own runtime/state directory, including
  the new `notes-nudge/` counter files, must never count as "other changed
  files" or the check would trigger on its own bookkeeping.
- Standard git exclusions apply for free: `.gitignore`d files never show up
  in `git status --porcelain` untracked output.

## Edge Cases

| Case | Behavior |
|---|---|
| Not a git repo | Hook exits 0 silently; no check, no nudge. Matches existing hooks' pattern of failing open rather than breaking the session. |
| `implementation-notes.md` doesn't exist yet, other files changed | Treated as stale — first block's reason implicitly asks the agent to create it. |
| Only `implementation-notes.md` changed | Not stale; no block. |
| Turn was pure investigation (no file changes) | `git status --porcelain` filtered list is empty; no block. |
| Agent explicitly judges nothing is loggable | Allowed to proceed (the reason text says so); if the underlying file mtimes are still "stale" the next `Stop` will trigger again, consuming a strike, until the 2-strike cap fails open. |
| Daemon not running / `.throughline/runtime.json` missing | Irrelevant — this check is fully independent of the daemon, unlike `forward.sh`. |
| Multiple stale files touched across several turns before ever writing notes | Still just one reason message per `Stop`, listing that notes are behind; strike count still caps at 2. |

## Files touched

- `plugin/hooks/notes-check.sh` (new) — the detection + block script.
- `plugin/hooks/notes-check.test.sh` (new) — the standalone bash test
  harness described in Testing approach below.
- `plugin/hooks/hooks.json` — add a `notes-check.sh` entry under `Stop`,
  alongside the existing `forward.sh` entry.
- `.throughline/notes-nudge/` — new runtime state directory (created
  on demand by the script, like `.throughline/` already is by
  `bootstrap.sh`).

## Testing approach

Since this is a shell hook driven by git state and stdin JSON (session id),
it's tested by invoking the script directly with crafted inputs against a
scratch git repo fixture, rather than through `bun:test`/`vitest`:

1. No git repo → script exits 0, no output.
2. Clean working tree → exits 0, no output.
3. Only `implementation-notes.md` changed → exits 0, no output.
4. Other file changed, notes file missing → emits block decision (strike 1).
5. Other file changed, notes file older → emits block decision (strike 1),
   then simulate a 2nd `Stop` with the same state → block again (strike 2),
   then a 3rd → exits 0 (fails open), counter resets.
6. Notes file touched after the other file (newer mtime) → exits 0, no
   block, counter resets to 0.
7. `.throughline/**`-only changes → treated as no qualifying change.
