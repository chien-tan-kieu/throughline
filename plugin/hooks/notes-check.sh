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
