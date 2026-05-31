---
description: Print the Claude Control dashboard URL for the browser
allowed-tools:
  - Bash
  - Read
---

Open the Claude Control dashboard.

1. Ensure daemon is running:
   ```bash
   bash -c '
     PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
     RUNTIME="$PROJECT_ROOT/.claude-control/runtime.json"
     probe() { PORT=$(jq -r .port "$RUNTIME" 2>/dev/null); PID=$(jq -r .pid "$RUNTIME" 2>/dev/null); [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null || return 1; curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; }
     if [ -f "$RUNTIME" ] && probe; then exit 0; fi
     LOG="$PROJECT_ROOT/.claude-control/daemon.log"
     ROOT=$(cat ~/.claude/plugins/known_marketplaces.json 2>/dev/null | jq -r '"'"'."claude-control-local".installLocation'"'"' 2>/dev/null)
     [ -z "$ROOT" ] && echo "Cannot locate claude-control install." && exit 1
     bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
     for i in $(seq 1 30); do sleep 0.1; [ -f "$RUNTIME" ] && probe && exit 0; done
     echo "Daemon failed to start. Check $LOG." && exit 1
   '
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude-control/runtime.json"` and parse `port` and `token` from the JSON output.

3. Print:
   ```
   Open this URL in your browser:
   http://127.0.0.1:<port>/#token=<token>
   ```
