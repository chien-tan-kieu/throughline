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

jq -cn --arg reason "$REASON" '{"decision":"block","reason":$reason}'
exit 0
