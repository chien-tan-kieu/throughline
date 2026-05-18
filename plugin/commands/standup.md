---
description: Show today's standup digest from Claude Control (shipped yesterday, in-progress, blockers)
allowed-tools:
  - Bash
---

Generate and display the daily standup digest.

1. Ensure the daemon is running:
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
   If the script prints an error, stop and show it.

2. Read `~/.claude-control/runtime.json` and extract `port` and `token`.

3. Fetch the standup digest:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/standup"
   ```

4. Format and print the digest as markdown:

   ```
   ## Standup — <date>

   ### Shipped Yesterday
   - <storyId> (<size>) — <detail>
   (or "(none)" if shipped array is empty)

   ### In Progress
   - <storyId> (<size>) — <detail>
   (or "(none)" if inProgress array is empty)

   ### Blockers
   - <storyId> — <detail>
   (or "(none)" if blockers array is empty)
   ```

   Print the formatted markdown to the terminal.
