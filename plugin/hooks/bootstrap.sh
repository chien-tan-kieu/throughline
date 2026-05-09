#!/bin/bash
RUNTIME="${CLAUDE_PLUGIN_DATA}/runtime.json"
LOG="${CLAUDE_PLUGIN_DATA}/daemon.log"
mkdir -p "$CLAUDE_PLUGIN_DATA"

probe() { curl -sf --max-time 2 "http://127.0.0.1:$1/api/healthz" > /dev/null 2>&1; }

if [ -f "$RUNTIME" ]; then
  PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null)
  if probe "$PORT"; then
    echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control is observing this session. This plugin only observes — it never blocks tool calls."}}'
    exit 0
  fi
fi

if [ -f "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" ]; then
  bun run "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  "$CLAUDE_PLUGIN_ROOT/bin/cc-daemon" >> "$LOG" 2>&1 &
fi

for i in $(seq 1 30); do
  sleep 0.1
  if [ -f "$RUNTIME" ]; then
    PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null) && probe "$PORT" && \
      echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control started."}}' && exit 0
  fi
done

exit 0
