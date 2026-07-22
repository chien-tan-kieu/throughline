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

test_not_a_git_repo
test_clean_tree
test_only_notes_changed
test_other_changed_notes_missing
test_notes_newer_no_block

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
