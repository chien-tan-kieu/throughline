#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

cat >/dev/null

cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | cut -c4- | grep -v '^implementation-notes\.md$' | grep -v '^\.throughline/' || true)

[ -z "$CHANGED" ] && exit 0

exit 0
