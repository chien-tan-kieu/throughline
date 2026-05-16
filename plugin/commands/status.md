---
description: Show Claude Control daemon status, active session, and inferred phase
allowed-tools:
  - Bash
  - Read
---

Show the Claude Control daemon status.

1. Ensure daemon is running:
   ```bash
   bash -c '
     RUNTIME=~/.claude-control/runtime.json
     probe() { PORT=$(jq -r .port "$RUNTIME" 2>/dev/null); curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; }
     if [ -f "$RUNTIME" ] && probe; then exit 0; fi
     LOG=~/.claude-control/daemon.log
     ROOT=$(cat ~/.claude/plugins/known_marketplaces.json 2>/dev/null | jq -r '"'"'."claude-control-local".installLocation'"'"' 2>/dev/null)
     [ -z "$ROOT" ] && echo "Cannot locate claude-control install." && exit 1
     bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
     for i in $(seq 1 30); do sleep 0.1; [ -f "$RUNTIME" ] && probe && exit 0; done
     echo "Daemon failed to start. Check $LOG." && exit 1
   '
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Read `~/.claude-control/runtime.json` and extract `port` and `token`.

3. Run:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" http://127.0.0.1:<port>/api/healthz
   ```
   If it fails or returns non-200, print "Daemon unreachable on port <port>." and stop.

4. Run:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" http://127.0.0.1:<port>/api/sessions
   ```

5. Print a summary:
   ```
   Daemon:  running  (port <port>, pid <pid>)
   Session: <id of most recent session, or "none">
   Phase:   <inferred_phase of most recent session, or "unknown">
   Story:   <active_story_id of most recent session, or "none">
   ```
