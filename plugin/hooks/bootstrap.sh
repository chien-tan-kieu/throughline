#!/bin/bash
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
RUNTIME="${PROJECT_ROOT}/.throughline/runtime.json"
LOG="${PROJECT_ROOT}/.throughline/daemon.log"
mkdir -p "${PROJECT_ROOT}/.throughline"

probe() {
  local port pid
  port=$(jq -r '.port' "$RUNTIME" 2>/dev/null)
  pid=$(jq -r '.pid' "$RUNTIME" 2>/dev/null)
  [ -z "$port" ] || [ -z "$pid" ] && return 1
  kill -0 "$pid" 2>/dev/null && curl -sf --max-time 2 "http://127.0.0.1:$port/api/healthz" > /dev/null 2>&1
}

# Best-effort: fetch the latest handoff and emit a single nudge line. Any failure
# (daemon flake, missing token, parse error, no handoff / 404) prints nothing so
# session start is never broken.
handoff_nudge() {
  local port token resp age title
  port=$(jq -r '.port' "$RUNTIME" 2>/dev/null) || return 0
  token=$(jq -r '.token' "$RUNTIME" 2>/dev/null) || return 0
  [ -z "$port" ] || [ "$port" = "null" ] && return 0
  [ -z "$token" ] || [ "$token" = "null" ] && return 0
  resp=$(curl -sf --max-time 2 \
    -H "Authorization: Bearer $token" \
    -H "Host: 127.0.0.1:$port" \
    "http://127.0.0.1:$port/api/handoffs/latest" 2>/dev/null) || return 0
  [ -z "$resp" ] && return 0
  age=$(printf '%s' "$resp" | jq -r '.age // empty' 2>/dev/null) || return 0
  title=$(printf '%s' "$resp" | jq -r '.title // empty' 2>/dev/null) || return 0
  [ -z "$title" ] && return 0
  printf '\n\n⏮ Recent handoff (%s): %s. Run /throughline:resume to load it.' "$age" "$title"
}

emit_context() {
  local plugin_constitution="$CLAUDE_PLUGIN_ROOT/plugin/constitution.md"
  local project_constitution="$PROJECT_ROOT/.claude/constitution.md"
  local status="Throughline is observing this session. This plugin only observes — it never blocks tool calls."
  local nudge
  nudge=$(handoff_nudge)

  if [ -f "$project_constitution" ]; then
    echo "[bootstrap] Injecting constitution: plugin ($plugin_constitution) + project ($project_constitution)" | tee -a "$LOG" >&2
    {
      printf '## Karpathy Guidelines (from plugin)\n\n'
      cat "$plugin_constitution"
      printf '\n---\n\n## Project-Specific Guidelines (from .claude/constitution.md)\n\n'
      cat "$project_constitution"
      printf '\n---\n%s%s' "$status" "$nudge"
    } | jq -Rs '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":.}}'
  else
    echo "[bootstrap] Injecting constitution: ($plugin_constitution)" | tee -a "$LOG" >&2
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
  if [ ! -d "$CLAUDE_PLUGIN_ROOT/node_modules/@throughline/shared" ]; then
    (cd "$CLAUDE_PLUGIN_ROOT" && bun install --frozen-lockfile) >> "$LOG" 2>&1
  fi
  bun run "$CLAUDE_PLUGIN_ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  THROUGHLINE_WEB_DIST="$CLAUDE_PLUGIN_ROOT/bin/web" \
    bun run "$CLAUDE_PLUGIN_ROOT/bin/server.js" >> "$LOG" 2>&1 &
fi

for i in $(seq 1 30); do
  sleep 0.1
  if [ -f "$RUNTIME" ] && probe; then
    emit_context
    exit 0
  fi
done

exit 0
