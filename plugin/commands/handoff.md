---
description: Generate a handoff document for a story. Usage: /claude-control:handoff <story-id>
allowed-tools:
  - Bash
---

Generate a handoff document for the specified story and write it to disk.

Usage: `/claude-control:handoff <story-id>`

The story ID is the full ID like `US-2026-05-17-billing-engine`.

1. Ensure the daemon is running (same bootstrap as other commands):
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

2. Read `~/.claude-control/runtime.json` and extract `port` and `token`.

3. POST to generate the handoff:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/handoff/<story-id>"
   ```

4. If the response status is 201, print:
   ```
   Handoff written to <filePath>

   <content>
   ```
   If 404, print: "Story not found: <story-id>"
   If 400, print: "Invalid story ID format. Expected: US-YYYY-MM-DD-<slug>"
