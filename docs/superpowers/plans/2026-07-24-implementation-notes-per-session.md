# Per-Session Implementation Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flat `implementation-notes.md` at repo root with one gitignored per-session notes file under `.throughline/notes/`, resolved via a session-id-keyed pointer file so `notes-check.sh` can locate a human-chosen filename it has no context to invent itself.

**Architecture:** `notes-check.sh` looks up `.throughline/notes/<session_id>.pointer` (one line: a filename) instead of a fixed `implementation-notes.md` path. No pointer, or a pointer whose target is missing, is treated as staleness exactly like "notes file doesn't exist" today. The block reason forks: first-time-this-session tells the agent to pick a topic slug, create the file, and write the pointer; subsequent staleness reuses the existing nudge, naming the resolved file.

**Tech Stack:** Bash (hook script + test harness), `jq` for JSON in/out, `git status --porcelain` for change detection — no new dependencies, matches every other hook in `plugin/hooks/`.

## Global Constraints

- No new runtime dependencies — stay within bash + `jq`, matching every existing hook in `plugin/hooks/`.
- `.throughline/` stays gitignored as-is (`.gitignore:11`) — no `.gitignore` changes needed since the new paths already live under it.
- The 2-strike cap (`CAP=2`) and its counter file at `.throughline/notes-nudge/<session_id>.count` are unchanged — only how `NOTES_FILE` is resolved changes, not the staleness/loop-safety logic around it.
- Design source of truth: `docs/superpowers/specs/2026-07-24-implementation-notes-per-session-design.md`.

---

### Task 1: Pointer-based resolution in `notes-check.sh`

**Files:**
- Modify: `plugin/hooks/notes-check.sh` (full rewrite of resolution + reason logic)
- Modify: `plugin/hooks/notes-check.test.sh` (full rewrite of fixtures/assertions)

**Interfaces:**
- Consumes: hook stdin JSON payload `{"session_id": "..."}` (unchanged from today).
- Produces: on staleness, stdout JSON `{"decision":"block","reason":"..."}` (unchanged shape; reason text now forks on pointer presence). Exit code always 0.

- [ ] **Step 1: Overwrite the test harness with pointer-aware fixtures**

Replace the full contents of `plugin/hooks/notes-check.test.sh` with:

```bash
#!/bin/bash
# Test harness for notes-check.sh — run: bash plugin/hooks/notes-check.test.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/notes-check.sh"
PASS=0
FAIL=0

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $label"
    echo "  expected: [$expected]"
    echo "  actual:   [$actual]"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  case "$haystack" in
    *"$needle"*) PASS=$((PASS + 1)) ;;
    *)
      FAIL=$((FAIL + 1))
      echo "FAIL: $label"
      echo "  expected to contain: [$needle]"
      echo "  actual:              [$haystack]"
      ;;
  esac
}

setup_repo() {
  local dir
  dir=$(mktemp -d)
  (cd "$dir" && git init -q && git config user.email t@t.com && git config user.name t)
  echo "$dir"
}

run_hook() {
  local repo="$1" session="$2"
  CLAUDE_PROJECT_DIR="$repo" bash "$SCRIPT" <<< "{\"session_id\":\"$session\"}"
}

register_notes() {
  local repo="$1" session="$2" filename="$3"
  mkdir -p "$repo/.throughline/notes"
  echo "$filename" > "$repo/.throughline/notes/$session.pointer"
  echo note > "$repo/.throughline/notes/$filename"
}

test_not_a_git_repo() {
  local dir
  dir=$(mktemp -d)
  local out status
  out=$(run_hook "$dir" "s1")
  status=$?
  assert_eq "" "$out" "not a git repo: no output"
  assert_eq "0" "$status" "not a git repo: exits 0"
  rm -rf "$dir"
}

test_clean_tree() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  local out status
  out=$(run_hook "$repo" "s2")
  status=$?
  assert_eq "" "$out" "clean tree: no output"
  assert_eq "0" "$status" "clean tree: exits 0"
  rm -rf "$repo"
}

test_only_notes_changed() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  register_notes "$repo" "s3" "topic-20260101000000.md"
  local out
  out=$(run_hook "$repo" "s3")
  assert_eq "" "$out" "only notes dir changed: no output"
  rm -rf "$repo"
}

test_no_pointer_blocks() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  echo change >> "$repo/README.md"
  local out
  out=$(run_hook "$repo" "s4")
  assert_contains "$out" '"decision":"block"' "no pointer: blocks"
  assert_contains "$out" "pointer" "no pointer: reason mentions pointer file"
  rm -rf "$repo"
}

test_pointer_target_missing_blocks() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  mkdir -p "$repo/.throughline/notes"
  echo "ghost-20260101000000.md" > "$repo/.throughline/notes/s5.pointer"
  echo change >> "$repo/README.md"
  local out
  out=$(run_hook "$repo" "s5")
  assert_contains "$out" '"decision":"block"' "pointer target missing: blocks"
  rm -rf "$repo"
}

test_notes_newer_no_block() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  sleep 1.1
  echo change >> "$repo/README.md"
  sleep 1.1
  register_notes "$repo" "s6" "topic-20260101000000.md"
  local out
  out=$(run_hook "$repo" "s6")
  assert_eq "" "$out" "notes newer than other changes: no block"
  rm -rf "$repo"
}

test_stale_blocks_twice_then_fails_open() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  register_notes "$repo" "s7" "topic-20260101000000.md"
  sleep 1.1
  echo change >> "$repo/README.md"
  local session="s7"

  local out1
  out1=$(run_hook "$repo" "$session")
  assert_contains "$out1" '"decision":"block"' "strike 1: blocks"

  local out2
  out2=$(run_hook "$repo" "$session")
  assert_contains "$out2" '"decision":"block"' "strike 2: blocks"

  local out3
  out3=$(run_hook "$repo" "$session")
  assert_eq "" "$out3" "strike 3: fails open"
  rm -rf "$repo"
}

test_resolving_notes_resets_counter() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  register_notes "$repo" "s8" "topic-20260101000000.md"
  sleep 1.1
  echo change >> "$repo/README.md"
  local session="s8"

  run_hook "$repo" "$session" > /dev/null
  local counter_file="$repo/.throughline/notes-nudge/$session.count"
  assert_eq "1" "$(cat "$counter_file" 2>/dev/null)" "strike 1: counter written"

  sleep 1.1
  echo logged >> "$repo/.throughline/notes/topic-20260101000000.md"
  local out
  out=$(run_hook "$repo" "$session")
  assert_eq "" "$out" "resolved: no block"

  if [ -f "$counter_file" ]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: resolved: counter file removed"
  else
    PASS=$((PASS + 1))
  fi
  rm -rf "$repo"
}

test_throughline_dir_excluded() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  mkdir -p "$repo/.throughline"
  echo x > "$repo/.throughline/scratch.json"
  local out
  out=$(run_hook "$repo" "s9")
  assert_eq "" "$out" ".throughline-only changes excluded: no output"
  rm -rf "$repo"
}

test_clean_tree_resets_counter() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  register_notes "$repo" "s10" "topic-20260101000000.md"
  sleep 1.1
  echo change >> "$repo/README.md"
  local session="s10"

  run_hook "$repo" "$session" > /dev/null
  local counter_file="$repo/.throughline/notes-nudge/$session.count"
  assert_eq "1" "$(cat "$counter_file" 2>/dev/null)" "strike 1: counter written"

  (cd "$repo" && git add -A && git commit -qm "commit outstanding change")
  run_hook "$repo" "$session" > /dev/null

  if [ -f "$counter_file" ]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: clean tree resets counter: file removed"
  else
    PASS=$((PASS + 1))
  fi
  rm -rf "$repo"
}

test_independent_sessions_do_not_interfere() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  register_notes "$repo" "sA" "topic-a-20260101000000.md"
  sleep 1.1
  echo change >> "$repo/README.md"

  local outA
  outA=$(run_hook "$repo" "sA")
  assert_eq "" "$outA" "session A has fresh notes: no block"

  local outB
  outB=$(run_hook "$repo" "sB")
  assert_contains "$outB" '"decision":"block"' "session B has no pointer: blocks"
  rm -rf "$repo"
}

test_root_notes_file_no_longer_special() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  echo stray >> "$repo/implementation-notes.md"
  local out
  out=$(run_hook "$repo" "s11")
  assert_contains "$out" '"decision":"block"' "stray root file counts as a change: blocks (no pointer)"
  rm -rf "$repo"
}

test_not_a_git_repo
test_clean_tree
test_only_notes_changed
test_no_pointer_blocks
test_pointer_target_missing_blocks
test_notes_newer_no_block
test_stale_blocks_twice_then_fails_open
test_resolving_notes_resets_counter
test_throughline_dir_excluded
test_clean_tree_resets_counter
test_independent_sessions_do_not_interfere
test_root_notes_file_no_longer_special

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run the new test harness against the unmodified hook to confirm it fails**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: Multiple `FAIL:` lines (the old script still uses the fixed `implementation-notes.md` path, so pointer-based tests like `test_no_pointer_blocks` and `test_independent_sessions_do_not_interfere` fail against it). The summary line should show a nonzero fail count.

- [ ] **Step 3: Rewrite `notes-check.sh` with pointer resolution**

Replace the full contents of `plugin/hooks/notes-check.sh` with:

```bash
#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
NOTES_DIR="${PROJECT_ROOT}/.throughline/notes"
STATE_DIR="${PROJECT_ROOT}/.throughline/notes-nudge"
CAP=2

PAYLOAD=$(cat -)
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"
COUNTER_FILE="${STATE_DIR}/${SESSION_ID}.count"
POINTER_FILE="${NOTES_DIR}/${SESSION_ID}.pointer"

cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | cut -c4- | grep -v '^\.throughline/' || true)

if [ -z "$CHANGED" ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

NOTES_FILE=""
if [ -f "$POINTER_FILE" ]; then
  NOTES_FILENAME=$(cat "$POINTER_FILE")
  CANDIDATE="${NOTES_DIR}/${NOTES_FILENAME}"
  [ -f "$CANDIDATE" ] && NOTES_FILE="$CANDIDATE"
fi

STALE=0
if [ -z "$NOTES_FILE" ]; then
  STALE=1
else
  NOTES_MTIME=$(file_mtime "$NOTES_FILE")
  NEWEST=0
  while IFS= read -r f; do
    [ -f "${PROJECT_ROOT}/${f}" ] || continue
    MTIME=$(file_mtime "${PROJECT_ROOT}/${f}")
    if [ "$MTIME" -gt "$NEWEST" ] 2>/dev/null; then
      NEWEST=$MTIME
    fi
  done <<< "$CHANGED"
  if [ "$NEWEST" -gt "$NOTES_MTIME" ] 2>/dev/null; then
    STALE=1
  fi
fi

if [ "$STALE" -eq 0 ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

mkdir -p "$STATE_DIR" "$NOTES_DIR"
COUNT=0
[ -f "$COUNTER_FILE" ] && COUNT=$(cat "$COUNTER_FILE")
COUNT=$((COUNT + 1))

if [ "$COUNT" -gt "$CAP" ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

echo "$COUNT" > "$COUNTER_FILE"

if [ -z "$NOTES_FILE" ]; then
  REASON="You've made changes but this session has no implementation notes file yet. Pick a short topic slug for what this session is doing (e.g. 'auth-refactor'), create .throughline/notes/<slug>-<YYYYMMDDHHMMSS>.md, and register it by writing just that filename into .throughline/notes/${SESSION_ID}.pointer. Then log a decision/deviation/trade-off from this turn under the right section, or say so if nothing applies."
else
  REASON="You've modified files since $(basename "$NOTES_FILE") was last updated. If any of these changes involved a decision outside the spec, a deviation from it, or a speed/simplicity/correctness trade-off, log it now (one or two lines, under the right section). If none of this turn's changes warrant an entry, say so and proceed."
fi

jq -cn --arg reason "$REASON" '{"decision":"block","reason":$reason}'
exit 0
```

- [ ] **Step 4: Run the test harness again to confirm all pass**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `0 failed` in the summary line, no `FAIL:` lines.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/notes-check.sh plugin/hooks/notes-check.test.sh
git commit -m "$(cat <<'EOF'
feat(hooks): resolve implementation notes via per-session pointer

notes-check.sh now looks up .throughline/notes/<session_id>.pointer
instead of a fixed implementation-notes.md path, so each session
gets its own gitignored notes file without the hook needing to
invent a name for it.
EOF
)"
```

---

### Task 2: Update the constitution's notes-taking rule

**Files:**
- Modify: `plugin/constitution.md:141-152` (the "Maintain running implementation notes" section)

**Interfaces:**
- Consumes: nothing (docs-only).
- Produces: nothing consumed by later tasks.

This is a pure docs edit with no behavior change, matching the constitution's own TDD exception ("Pure config edits with no behavior change... this file") — no test cycle needed.

- [ ] **Step 1: Replace the section text**

In `plugin/constitution.md`, replace:

```markdown
### Maintain running implementation notes

While implementing any task, maintain a running `implementation-notes.md` at the repo root (create it if missing). Update it as you work, not as a summary at the end.

Record entries under four sections:
```

with:

```markdown
### Maintain running implementation notes

While implementing any task, maintain a running per-session notes file under `.throughline/notes/` (create it if missing, along with `.throughline/notes/<session_id>.pointer` pointing to it — see `plugin/hooks/notes-check.sh`). This is a local working log, not a reviewer-facing file: it is gitignored and scoped to the session that wrote it. Update it as you work, not as a summary at the end.

Record entries under four sections:
```

(The rest of the section — the four bullet points and the "Keep entries to one or two lines" paragraph — is unchanged.)

- [ ] **Step 2: Commit**

```bash
git add plugin/constitution.md
git commit -m "docs(constitution): notes-taking rule points at per-session files"
```

---

### Task 3: Migrate off the root `implementation-notes.md`

**Files:**
- Delete: `implementation-notes.md` (repo root)
- Create: `.throughline/notes/notes-versioning-<timestamp>.md` (this session's notes file)
- Create: `.throughline/notes/<current-session-id>.pointer`

**Interfaces:**
- Consumes: the current session id, `1de80479-e852-4ac1-9b5e-b109dd5e2d06` (from this conversation's hook-visible state, e.g. `.throughline/notes-nudge/1de80479-e852-4ac1-9b5e-b109dd5e2d06.count`).
- Produces: nothing consumed by later tasks — this is the one-time cutover described in the design's Migration section.

`implementation-notes.md` has never been committed (`git log -- implementation-notes.md` is empty), so this is a clean cutover with no history to preserve.

- [ ] **Step 1: Create this session's notes file, carrying over the existing entry**

Create `.throughline/notes/notes-versioning-20260724160000.md`:

```markdown
# Implementation Notes

## Decisions outside the spec

- Enabled the `throughline` plugin in `.claude/settings.json` via `extraKnownMarketplaces` (github, `dist` branch) + `enabledPlugins`, instead of the README-documented `claude --plugin-dir ./plugin` local-dev flow (`README.md:213`). Chosen so the released build (with `notes-check.sh`) loads persistently for this session, since `--plugin-dir` isn't something I can apply to an already-running session.
- Migrated notes-taking from a single root `implementation-notes.md` to per-session files under `.throughline/notes/`, resolved via `.throughline/notes/<session_id>.pointer` — see `docs/superpowers/specs/2026-07-24-implementation-notes-per-session-design.md`.

## Deviations from the spec

(none yet)

## Trade-offs

(none yet)

## Anything else

- Confirmed live: `notes-check.sh` correctly blocked `Stop` once the plugin was actually loaded — the two earlier "no block" attempts were a session-config gap (plugin not enabled), not a bug in the hook.
```

- [ ] **Step 2: Register the pointer for this session**

Run:

```bash
mkdir -p .throughline/notes
echo "notes-versioning-20260724160000.md" > .throughline/notes/1de80479-e852-4ac1-9b5e-b109dd5e2d06.pointer
```

- [ ] **Step 3: Delete the root notes file**

Run: `rm implementation-notes.md`

- [ ] **Step 4: Verify the new hook resolves this session's notes file correctly**

Run:

```bash
echo '{"session_id":"1de80479-e852-4ac1-9b5e-b109dd5e2d06"}' | bash plugin/hooks/notes-check.sh
```

Expected: empty output (the notes file's mtime is newer than any currently-changed tracked file, so no block) — confirms the pointer resolves and staleness detection works against the real repo, not just the test fixtures.

- [ ] **Step 5: Confirm nothing new needs committing for the deleted file**

Run: `git status --porcelain implementation-notes.md`
Expected: no output — the file was never tracked, so its deletion isn't a git change to stage. (`.throughline/notes/**` is gitignored, so the new files there also produce no `git status` output.)

---

## Self-Review Notes

- **Spec coverage:** Pointer resolution (Task 1), reason-text fork (Task 1 Step 3), constitution rewrite (Task 2), migration + root-file retirement (Task 3), test rewrite covering all 6 edge-case clusters from the spec's Testing approach section (Task 1 Step 1) — all covered.
- **Placeholder scan:** No TBD/TODO; every step has literal file contents or exact commands.
- **Type consistency:** `SESSION_ID`, `NOTES_DIR`, `POINTER_FILE`, `NOTES_FILE` names match between the hook script and the test harness's expectations (e.g. `<session_id>.pointer` filename convention used identically in both).
