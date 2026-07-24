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
  sleep 1.1
  echo change >> "$repo/README.md"
  sleep 1.1
  register_notes "$repo" "sA" "topic-a-20260101000000.md"

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
