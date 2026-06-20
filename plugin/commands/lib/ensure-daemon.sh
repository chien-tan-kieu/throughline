#!/bin/bash
# Ensures the throughline daemon is running.
# Exits 0 if already healthy or successfully started.
# Exits 1 and prints a message on failure.
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
RUNTIME="$PROJECT_ROOT/.throughline/runtime.json"

probe() {
  PORT=$(jq -r .port "$RUNTIME" 2>/dev/null)
  PID=$(jq -r .pid "$RUNTIME" 2>/dev/null)
  [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null || return 1
  curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1
}

if [ -f "$RUNTIME" ] && probe; then exit 0; fi

LOG="$PROJECT_ROOT/.throughline/daemon.log"
ROOT=$(jq -r '."throughline-local".installLocation' \
  ~/.claude/plugins/known_marketplaces.json 2>/dev/null)
[ -z "$ROOT" ] || [ "$ROOT" = "null" ] && \
  echo "Cannot locate throughline install." && exit 1
bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &

for i in $(seq 1 30); do
  sleep 0.1
  [ -f "$RUNTIME" ] && probe && exit 0
done
echo "Daemon failed to start. Check $LOG." && exit 1
