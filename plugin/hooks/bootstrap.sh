#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
RUNTIME="${PROJECT_ROOT}/.claude-control/runtime.json"
LOG="${PROJECT_ROOT}/.claude-control/daemon.log"
mkdir -p "${PROJECT_ROOT}/.claude-control"

probe() {
  local port pid
  port=$(jq -r '.port' "$RUNTIME" 2>/dev/null)
  pid=$(jq -r '.pid' "$RUNTIME" 2>/dev/null)
  [ -z "$port" ] || [ -z "$pid" ] && return 1
  kill -0 "$pid" 2>/dev/null && curl -sf --max-time 2 "http://127.0.0.1:$port/api/healthz" > /dev/null 2>&1
}

emit_context() {
  local plugin_constitution="$CLAUDE_PLUGIN_ROOT/plugin/constitution.md"
  local project_constitution="$PROJECT_ROOT/.claude/constitution.md"
  local status="Claude Control is observing this session. This plugin only observes — it never blocks tool calls."

  if [ -f "$project_constitution" ]; then
    {
      printf '## Karpathy Guidelines (from plugin)\n\n'
      cat "$plugin_constitution"
      printf '\n---\n\n## Project-Specific Guidelines (from .claude/constitution.md)\n\n'
      cat "$project_constitution"
      printf '\n---\n%s' "$status"
    } | jq -Rs '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":.}}'
  else
    jq -Rs --arg s "$status" \
      '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":("## Karpathy Guidelines (from plugin)\n\n" + . + "\n---\n" + $s)}}' \
      "$plugin_constitution"
  fi
}

if [ -f "$RUNTIME" ] && probe; then
  emit_context
  exit 0
fi

if [ -f "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" ]; then
  bun run "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  "$CLAUDE_PLUGIN_ROOT/bin/cc-daemon" >> "$LOG" 2>&1 &
fi

for i in $(seq 1 30); do
  sleep 0.1
  if [ -f "$RUNTIME" ] && probe; then
    emit_context
    exit 0
  fi
done

exit 0
