# Per-Session Implementation Notes

## Problem

`implementation-notes.md` (root) is a single flat file shared across every
Claude Code session that ever touches this repo. It has no versioning or
identifier of any kind:

- Two sessions working close together (or a session resumed after a gap)
  append to the same file with no indication of which session wrote what.
- There is no way to tell, after the fact, which entry came from which
  session — reconstructing that requires cross-referencing git blame/mtimes
  against session transcripts, if those even still exist.
- `plugin/hooks/notes-check.sh` (see
  `docs/superpowers/specs/2026-07-22-implementation-notes-enforcement-design.md`)
  already keys its strike counter by `session_id`
  (`.throughline/notes-nudge/<session_id>.count`) but the notes content
  itself has no equivalent separation.

## Goals

- Give each session its own notes file, so entries are automatically
  attributed to the session that wrote them and concurrent/resumed sessions
  can never interleave or clobber each other's entries.
- Keep the detection mechanism in `notes-check.sh` fully deterministic —
  the hook is a bash script with no access to conversation context, so it
  cannot itself choose a human-readable name for a session's notes file.
- Preserve the existing staleness/2-strike behavior from the enforcement
  design; only the *location* of the notes file changes, not the check that
  decides whether it's stale.

## Non-goals

- Turn-level granularity. A session is treated as one unit; entries within
  a session's file stay as plain bullets under the same four sections as
  today, with no per-turn timestamps.
- Reviewer/PR visibility. This supersedes the root `implementation-notes.md`
  entirely — see Trade-offs. Anyone wanting a reviewer-facing summary would
  need a separate, explicit mechanism (out of scope here).
- Automatic pruning/archiving of old session note files. They accumulate in
  `.throughline/notes/` like any other local working log; cleanup is a
  future concern if it ever becomes one, not part of this design.

## Design

### File layout

```
.throughline/notes/<topic-slug>-<YYYYMMDDHHMMSS>.md   ← one per session, the actual notes
.throughline/notes/<session_id>.pointer                ← one line: the filename above
.throughline/notes-nudge/<session_id>.count            ← unchanged, existing strike counter
```

`.throughline/` is already gitignored (`.gitignore:11`), so every file
above is local-only by construction — no new `.gitignore` entry needed, and
no risk of these files leaking into `git status --porcelain` as "changed
files" that would confuse the staleness check.

### Why a pointer file (topic slug vs. session id)

The notes filename uses a short, human-readable topic slug plus a
timestamp (e.g. `notes-versioning-20260724153000.md`) instead of the raw
session UUID, so a person skimming `.throughline/notes/` can tell what a
session was about without opening every file. But choosing that slug
requires understanding what the session is doing — something only the
agent (with conversation context) can do, not the bash hook.

This is resolved with one level of indirection: the hook always knows the
session id (from the hook payload, same as today), and looks up
`.throughline/notes/<session_id>.pointer` to find which file that session
is using. The agent is responsible for creating both the notes file and
its pointer, together, the first time it's asked to log something.

Two alternatives were considered and rejected:

- **Glob by mtime window** (guess the right file by matching mtimes near
  session start, no pointer file): ambiguous when multiple sessions start
  close together, and fragile if the notes file is created late in a long
  session.
- **Hook picks the name itself** (e.g. always `<session_id>.md`, no slug):
  simpler, but gives up the readability goal entirely — this was the
  starting point the pointer design improves on.

### Hook resolution logic (`notes-check.sh`)

Replace the current fixed path:

```bash
NOTES_FILE="${PROJECT_ROOT}/implementation-notes.md"
```

with pointer resolution:

```bash
NOTES_DIR="${PROJECT_ROOT}/.throughline/notes"
POINTER_FILE="${NOTES_DIR}/${SESSION_ID}.pointer"

NOTES_FILE=""
if [ -f "$POINTER_FILE" ]; then
  NOTES_FILENAME=$(cat "$POINTER_FILE")
  NOTES_FILE="${NOTES_DIR}/${NOTES_FILENAME}"
fi
```

Everywhere the existing script checks `[ ! -f "$NOTES_FILE" ]` to decide
staleness, an empty `$NOTES_FILE` (no pointer yet) now falls into that same
branch — "notes file doesn't exist" and "no pointer registered yet" are
treated identically, since both mean nothing has been logged for this
session.

The `CHANGED` filter's existing exclusion of `^implementation-notes\.md$`
is removed (the root file no longer plays this role). The `^\.throughline/`
exclusion already covers `.throughline/notes/**`, so no new exclusion rule
is needed for the pointer or notes files.

### Block reason text

The reason forks on whether a pointer already exists, so the agent always
knows exactly what to do next:

- **No pointer yet** (first staleness detection this session): reason
  instructs the agent to pick a short topic slug, create
  `.throughline/notes/<slug>-<timestamp>.md`, and register it by writing
  that filename (nothing else) into
  `.throughline/notes/<session_id>.pointer`.
- **Pointer exists, target file stale**: same nudge as the current design
  ("log a decision/deviation/trade-off, or say nothing applies"), with the
  resolved filename named in the message so the agent doesn't need to
  re-derive it.

### State & loop safety

Unchanged from the existing design: the 2-strike cap at
`.throughline/notes-nudge/<session_id>.count` still governs how many
consecutive `Stop` events can block before failing open. Nothing about the
counter's key (`session_id`) or cap (2) changes — only what "the notes
file" resolves to.

## Trade-offs

- **Reviewer visibility is given up.** The root `implementation-notes.md`
  was committed and PR-visible; per-session files under `.throughline/` are
  gitignored and local-only. This was an explicit choice: the priority is
  per-session traceability and collision-safety over reviewer-facing
  summaries. If reviewer visibility is wanted later, it needs its own
  mechanism (e.g. a rollup step), not addressed here.
- **Two writes instead of one** on first log per session (the notes file
  and its pointer) versus a single file today. Accepted as the minimum
  necessary to let the hook resolve a human-chosen name deterministically.

## Migration

The current root `implementation-notes.md` has never been committed to git
(`git log -- implementation-notes.md` is empty), so this is a clean cutover
with no history to preserve:

1. Carry its one existing entry (the plugin-enable decision) into the
   current session's new per-session file.
2. Delete the root `implementation-notes.md`. If left in place, it would
   show up as an ordinary "changed file" in `git status --porcelain` (it's
   untracked) and get folded into the staleness check as noise.

## Files touched

- `plugin/hooks/notes-check.sh` — replace fixed `NOTES_FILE` path with
  pointer resolution; update the block reason text; drop the now-dead
  `implementation-notes.md` exclusion from the `CHANGED` filter.
- `plugin/hooks/notes-check.test.sh` — rewrite fixtures/assertions for
  pointer-based resolution (exact test cases left to the implementation
  plan).
- `plugin/constitution.md` — rewrite the "Maintain running implementation
  notes" section to describe the per-session file + pointer mechanism
  instead of "a running `implementation-notes.md` at the repo root," and
  note that it's now a local working log, not reviewer-facing.
- `implementation-notes.md` (root) — deleted as part of migration.
- `.throughline/notes/` — new runtime directory (created on demand, same
  pattern as `.throughline/notes-nudge/`).

## Edge Cases

| Case | Behavior |
|---|---|
| No pointer file for this session yet | Treated as stale, same as "notes file doesn't exist" in the current design — reason text asks the agent to create the file and register the pointer. |
| Pointer exists but its target file was deleted/moved | `[ -f "$NOTES_FILE" ]` fails → treated as stale, same code path as no pointer. |
| Two sessions running concurrently | Each has its own `<session_id>.pointer`, resolving to its own file — no interleaving possible. |
| Session resumed later (same session id) | Pointer still resolves to the same file from earlier in that session; staleness check picks up where it left off. |
| Root `implementation-notes.md` recreated by old habit/muscle memory | No longer excluded from `CHANGED`; it's just an ordinary untracked file. Harmless — at worst it's one more "changed file" that the (now-correct) per-session notes file needs to be newer than. |

## Testing approach

Same shell-script-against-scratch-git-repo approach as the existing
`notes-check.test.sh` harness — this is bash driven by git state and stdin
JSON, not `bun:test`/`vitest`. New/changed cases relative to the current 9:

1. No pointer file → stale (block, strike 1) — replaces "notes file
   missing" case.
2. Pointer file exists, target missing → stale (block) — new case.
3. Pointer exists, target newer than other changes → not stale, no block —
   replaces "notes file touched after other file."
4. Pointer exists, target older → stale, 2-strike-then-fail-open sequence
   unchanged from today.
5. Two sessions with independent pointers/counters don't interfere — new
   case, exercises the concurrency-safety goal directly.
6. `.throughline/notes/**`-only changes still excluded from `CHANGED`
   (covers both the pointer file and the notes file itself).
