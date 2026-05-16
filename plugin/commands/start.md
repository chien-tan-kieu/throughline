---
description: Load a story and launch the Superpowers brainstorming workflow
allowed-tools:
  - Bash
  - Read
---

Start a story by feeding it into the Superpowers brainstorming workflow.

Usage: `/claude-control:start <story-id>`

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

2. Read `~/.claude-control/runtime.json` for `port` and `token`.

3. Fetch the story:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     http://127.0.0.1:<port>/api/stories/<story-id>
   ```
   If 404, print "Story <story-id> not found." and stop.

4. Return this prompt expansion to Claude (do not execute it yourself — output it as the next user message):

   ```
   I want to work on this story:

   **ID:** <id>
   **Title:** <title>
   **Status:** <status>

   <body>

   Please invoke the Superpowers brainstorming skill to explore this story's requirements, identify design decisions, and help me write a spec.
   ```
