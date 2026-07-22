# Implementation Notes Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the constitution's "maintain running implementation notes" rule self-enforcing by adding a `Stop`-hook that detects when `implementation-notes.md` is stale relative to other file changes and forces the agent to address it before the turn ends, bounded by a 2-strike fail-open cap.

**Architecture:** A new standalone bash script, `plugin/hooks/notes-check.sh`, registered on the `Stop` event in `plugin/hooks/hooks.json` alongside the existing `forward.sh` entry. It uses `git status --porcelain` + file mtimes (no tool-call tracking, no daemon dependency) to detect staleness, and a tiny per-session counter file under `.throughline/notes-nudge/` to cap forced continuation at 2 consecutive triggers before failing open.

**Tech Stack:** bash, `jq` (already a repo dependency, used by `forward.sh`/`bootstrap.sh`), `git`. No new language runtime or package.

## Global Constraints

- Hook scripts in this repo follow the existing convention seen in `plugin/hooks/forward.sh` and `plugin/hooks/bootstrap.sh`: `#!/bin/bash` shebang, no `set -e`, resolve the project root via `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}`, and fail open (exit 0, no output) on any unexpected condition rather than erroring the session.
- `jq` is the existing dependency for JSON handling in hooks — reuse it, don't add a new tool.
- The plugin's tool-call gating (`PreToolUse`) must remain untouched — this feature only adds a `Stop` hook.
- `.throughline/` is already gitignored at the repo root (confirmed in `.gitignore`); new state lives at `.throughline/notes-nudge/<session_id>.count`.
- No test framework exists for shell scripts in this repo (`bun:test`/`vitest` cover the TypeScript packages only). Tests for this feature are a plain bash harness (`plugin/hooks/notes-check.test.sh`) run directly with `bash`, following the spec's stated testing approach.

---

### Task 1: Script skeleton + baseline pass-through cases

**Files:**
- Create: `plugin/hooks/notes-check.sh`
- Create: `plugin/hooks/notes-check.test.sh`

**Interfaces:**
- Produces: `notes-check.sh` reads a JSON payload on stdin (only `session_id` matters, used starting Task 3) and reads `CLAUDE_PROJECT_DIR` from the environment. On success paths covered by this task, it always exits 0 with empty stdout.
- Produces (test harness): `assert_eq expected actual label`, `assert_contains haystack needle label`, `setup_repo` (returns path to a fresh temp git repo with a committed `README.md`), `run_hook repo session` (invokes the script against that repo, returns its stdout).

- [ ] **Step 1: Write the test harness with the two baseline cases**

Create `plugin/hooks/notes-check.test.sh`:

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

test_not_a_git_repo() {
  local dir
  dir=$(mktemp -d)
  local out
  out=$(run_hook "$dir" "s1")
  assert_eq "" "$out" "not a git repo: no output"
  rm -rf "$dir"
}

test_clean_tree() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  local out
  out=$(run_hook "$repo" "s2")
  assert_eq "" "$out" "clean tree: no output"
  rm -rf "$repo"
}

test_not_a_git_repo
test_clean_tree

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run the harness and verify it fails**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: fails immediately with `bash: plugin/hooks/notes-check.sh: No such file or directory` (the script doesn't exist yet).

- [ ] **Step 3: Write the minimal script to make both tests pass**

Create `plugin/hooks/notes-check.sh`:

```bash
#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

cat >/dev/null

cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | cut -c4- | grep -v '^implementation-notes\.md$' | grep -v '^\.throughline/' || true)

[ -z "$CHANGED" ] && exit 0

exit 0
```

Make it executable:

Run: `chmod +x plugin/hooks/notes-check.sh`

- [ ] **Step 4: Run the harness and verify it passes**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `2 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/notes-check.sh plugin/hooks/notes-check.test.sh
git commit -m "feat(hooks): add notes-check.sh skeleton with baseline pass-through cases"
```

---

### Task 2: Staleness detection + block decision

**Files:**
- Modify: `plugin/hooks/notes-check.sh`
- Modify: `plugin/hooks/notes-check.test.sh`

**Interfaces:**
- Consumes: `run_hook`, `setup_repo`, `assert_eq`, `assert_contains` from Task 1.
- Produces: on stdout, `notes-check.sh` now emits `{"decision":"block","reason":"..."}` (via `jq -n`) whenever a file other than `implementation-notes.md`/`.throughline/**` has a newer mtime than `implementation-notes.md` (or `implementation-notes.md` doesn't exist at all). Otherwise still empty stdout / exit 0. No cap yet — this task always blocks when stale (cap added in Task 3).

- [ ] **Step 1: Add three test cases to the harness**

In `plugin/hooks/notes-check.test.sh`, insert before the `test_not_a_git_repo` / `test_clean_tree` calls at the bottom:

```bash
test_only_notes_changed() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  echo note >> "$repo/implementation-notes.md"
  local out
  out=$(run_hook "$repo" "s3")
  assert_eq "" "$out" "only notes changed: no output"
  rm -rf "$repo"
}

test_other_changed_notes_missing() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  (cd "$repo" && git add -A && git commit -qm init)
  echo change >> "$repo/README.md"
  local out
  out=$(run_hook "$repo" "s4")
  assert_contains "$out" '"decision":"block"' "notes missing: blocks"
  rm -rf "$repo"
}

test_notes_newer_no_block() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  echo note > "$repo/implementation-notes.md"
  (cd "$repo" && git add -A && git commit -qm init)
  sleep 1.1
  echo change >> "$repo/README.md"
  sleep 1.1
  echo logged >> "$repo/implementation-notes.md"
  local out
  out=$(run_hook "$repo" "s5")
  assert_eq "" "$out" "notes newer than other changes: no block"
  rm -rf "$repo"
}
```

And update the call list to:

```bash
test_not_a_git_repo
test_clean_tree
test_only_notes_changed
test_other_changed_notes_missing
test_notes_newer_no_block
```

- [ ] **Step 2: Run the harness and verify the new tests fail**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `test_other_changed_notes_missing` fails (`FAIL: notes missing: blocks`) because the script never emits a block decision yet. `2 passed` (baseline) at minimum, with failures reported for the new cases (`test_only_notes_changed` and `test_notes_newer_no_block` happen to pass already since the stub always outputs nothing — that's fine, they're not truly red, but `test_other_changed_notes_missing` must be observed failing before proceeding).

- [ ] **Step 3: Extend the script with staleness detection and the block decision**

Replace the full contents of `plugin/hooks/notes-check.sh`:

```bash
#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
NOTES_FILE="${PROJECT_ROOT}/implementation-notes.md"

cat >/dev/null

cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | cut -c4- | grep -v '^implementation-notes\.md$' | grep -v '^\.throughline/' || true)

[ -z "$CHANGED" ] && exit 0

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

STALE=0
if [ ! -f "$NOTES_FILE" ]; then
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
  if [ "$NEWEST" -gt "$NOTES_MTIME" ]; then
    STALE=1
  fi
fi

[ "$STALE" -eq 0 ] && exit 0

REASON="You've modified files since implementation-notes.md was last updated. If any of these changes involved a decision outside the spec, a deviation from it, or a speed/simplicity/correctness trade-off, log it now (one or two lines, under the right section). If none of this turn's changes warrant an entry, say so and proceed."

jq -n --arg reason "$REASON" '{"decision":"block","reason":$reason}'
exit 0
```

- [ ] **Step 4: Run the harness and verify all tests pass**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `5 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/notes-check.sh plugin/hooks/notes-check.test.sh
git commit -m "feat(hooks): detect stale implementation-notes.md and emit block decision"
```

---

### Task 3: Strike counter + fail-open cap

**Files:**
- Modify: `plugin/hooks/notes-check.sh`
- Modify: `plugin/hooks/notes-check.test.sh`

**Interfaces:**
- Consumes: `run_hook`, `setup_repo`, `assert_eq`, `assert_contains`, `PASS`/`FAIL` counters from Tasks 1–2.
- Produces: `notes-check.sh` now reads `session_id` from the stdin JSON payload and persists a strike counter at `${PROJECT_ROOT}/.throughline/notes-nudge/${SESSION_ID}.count`. Blocks (as in Task 2) on strikes 1 and 2 for a given stale condition; on strike 3 it fails open (exit 0, empty stdout, counter file removed). The counter file is removed as soon as staleness resolves (i.e. `implementation-notes.md` becomes the newest changed file).

- [ ] **Step 1: Add three test cases to the harness**

In `plugin/hooks/notes-check.test.sh`, add before the closing call list:

```bash
test_stale_blocks_twice_then_fails_open() {
  local repo
  repo=$(setup_repo)
  echo hi > "$repo/README.md"
  echo note > "$repo/implementation-notes.md"
  (cd "$repo" && git add -A && git commit -qm init)
  sleep 1.1
  echo change >> "$repo/README.md"
  local session="s6"

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
  echo note > "$repo/implementation-notes.md"
  (cd "$repo" && git add -A && git commit -qm init)
  sleep 1.1
  echo change >> "$repo/README.md"
  local session="s7"

  run_hook "$repo" "$session" > /dev/null
  local counter_file="$repo/.throughline/notes-nudge/$session.count"
  assert_eq "1" "$(cat "$counter_file" 2>/dev/null)" "strike 1: counter written"

  sleep 1.1
  echo logged >> "$repo/implementation-notes.md"
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
  out=$(run_hook "$repo" "s8")
  assert_eq "" "$out" ".throughline-only changes excluded: no output"
  rm -rf "$repo"
}
```

And update the call list to:

```bash
test_not_a_git_repo
test_clean_tree
test_only_notes_changed
test_other_changed_notes_missing
test_notes_newer_no_block
test_stale_blocks_twice_then_fails_open
test_resolving_notes_resets_counter
test_throughline_dir_excluded
```

- [ ] **Step 2: Run the harness and verify the new tests fail**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `test_stale_blocks_twice_then_fails_open` fails at "strike 3: fails open" (the script currently blocks every time, uncapped). `test_resolving_notes_resets_counter` fails at "strike 1: counter written" (no counter file is ever created yet). `test_throughline_dir_excluded` already passes (unrelated to this task, already handled by the exclusion grep from Task 1).

- [ ] **Step 3: Extend the script with the session counter and cap**

Replace the full contents of `plugin/hooks/notes-check.sh`:

```bash
#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
NOTES_FILE="${PROJECT_ROOT}/implementation-notes.md"
STATE_DIR="${PROJECT_ROOT}/.throughline/notes-nudge"
CAP=2

PAYLOAD=$(cat -)
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"
COUNTER_FILE="${STATE_DIR}/${SESSION_ID}.count"

cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | cut -c4- | grep -v '^implementation-notes\.md$' | grep -v '^\.throughline/' || true)

[ -z "$CHANGED" ] && exit 0

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

STALE=0
if [ ! -f "$NOTES_FILE" ]; then
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
  if [ "$NEWEST" -gt "$NOTES_MTIME" ]; then
    STALE=1
  fi
fi

if [ "$STALE" -eq 0 ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

mkdir -p "$STATE_DIR"
COUNT=0
[ -f "$COUNTER_FILE" ] && COUNT=$(cat "$COUNTER_FILE")
COUNT=$((COUNT + 1))

if [ "$COUNT" -gt "$CAP" ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

echo "$COUNT" > "$COUNTER_FILE"

REASON="You've modified files since implementation-notes.md was last updated. If any of these changes involved a decision outside the spec, a deviation from it, or a speed/simplicity/correctness trade-off, log it now (one or two lines, under the right section). If none of this turn's changes warrant an entry, say so and proceed."

jq -n --arg reason "$REASON" '{"decision":"block","reason":$reason}'
exit 0
```

- [ ] **Step 4: Run the harness and verify all tests pass**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `8 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/notes-check.sh plugin/hooks/notes-check.test.sh
git commit -m "feat(hooks): cap notes-check blocking at 2 strikes and reset on resolution"
```

---

### Task 4: Wire into hooks.json

**Files:**
- Modify: `plugin/hooks/hooks.json:70-79` (the `Stop` array)

**Interfaces:**
- Consumes: `plugin/hooks/notes-check.sh` from Tasks 1–3 (must already be executable and pass its test suite).
- Produces: registers `notes-check.sh` as a second command under the `Stop` event, run after the existing `forward.sh` entry.

- [ ] **Step 1: Verify current hooks.json is valid JSON before editing**

Run: `jq empty plugin/hooks/hooks.json`
Expected: no output, exit code 0.

- [ ] **Step 2: Add the second Stop hook entry**

In `plugin/hooks/hooks.json`, the current `Stop` block is:

```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PLUGIN_ROOT/plugin/hooks/forward.sh"
          }
        ]
      }
    ],
```

Change it to:

```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PLUGIN_ROOT/plugin/hooks/forward.sh"
          },
          {
            "type": "command",
            "command": "$CLAUDE_PLUGIN_ROOT/plugin/hooks/notes-check.sh"
          }
        ]
      }
    ],
```

- [ ] **Step 3: Verify the edited file is still valid JSON**

Run: `jq empty plugin/hooks/hooks.json`
Expected: no output, exit code 0.

- [ ] **Step 4: Smoke-test the wired hook end-to-end with a realistic Stop payload**

Run:

```bash
TMPDIR=$(mktemp -d)
(cd "$TMPDIR" && git init -q && git config user.email t@t.com && git config user.name t)
echo hi > "$TMPDIR/README.md"
(cd "$TMPDIR" && git add -A && git commit -qm init)
echo change >> "$TMPDIR/README.md"
CLAUDE_PLUGIN_ROOT="$(pwd)" CLAUDE_PROJECT_DIR="$TMPDIR" \
  bash -c 'echo "{\"session_id\":\"smoke-1\",\"hook_event_name\":\"Stop\"}" | "$CLAUDE_PLUGIN_ROOT/plugin/hooks/notes-check.sh"'
rm -rf "$TMPDIR"
```

Expected: prints a single line of JSON: `{"decision":"block","reason":"You've modified files since implementation-notes.md was last updated. ..."}`.

- [ ] **Step 5: Run the full notes-check test suite one more time**

Run: `bash plugin/hooks/notes-check.test.sh`
Expected: `8 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add plugin/hooks/hooks.json
git commit -m "feat(hooks): register notes-check.sh on the Stop event"
```

---

## Self-Review Notes

- **Spec coverage:** Trigger point (Task 4), git+mtime detection (Task 2), exclusions for `implementation-notes.md`/`.throughline/**` (Task 1's `CHANGED` filter, verified in Task 3), block-to-continue reason text (Task 2), 2-strike cap + fail-open + reset (Task 3), no daemon dependency (never touched), no `PreToolUse` changes (never touched) — all covered.
- **Placeholder scan:** none found; every step has literal, runnable code and exact expected output.
- **Type/interface consistency:** `run_hook`, `setup_repo`, `assert_eq`, `assert_contains` signatures are identical across Tasks 1–3; `notes-check.sh`'s external contract (stdin JSON with `session_id`, `CLAUDE_PROJECT_DIR` env var, stdout JSON `{"decision":"block","reason":...}` or empty) is stable from Task 2 onward — Task 3 only adds internal state, doesn't change the contract.
