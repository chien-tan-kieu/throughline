---
description: Manage Claude Control stories — new, list, or size subcommands
allowed-tools:
  - Bash
  - Read
---

Manage stories. Usage: `/claude-control:story <subcommand> [args]`

**Step 0: Ensure daemon is running**

Run this to check and auto-start if needed:
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
If the script prints an error, stop and show it to the user. Otherwise continue.

Read `~/.claude-control/runtime.json` to get `port` and `token`. All curl commands use:
- Header: `Authorization: Bearer <token>`
- Header: `Host: 127.0.0.1:<port>`
- Base URL: `http://127.0.0.1:<port>`

**Subcommand: `new <title>`**

POST to `/api/stories` with body `{"title": "<title>"}`:
```bash
curl -s -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>"}' \
  http://127.0.0.1:<port>/api/stories
```
Print: `Created story <id> at <file_path>`

**Subcommand: `list`**

GET `/api/stories`:
```bash
curl -s \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  http://127.0.0.1:<port>/api/stories
```
Print a table with columns: ID | Title | Size | Status

**Subcommand: `size <id> <S|M|L>`**

PATCH `/api/stories/<id>` with body `{"size": "<S|M|L>"}`:
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  -H "Content-Type: application/json" \
  -d '{"size": "<S|M|L>"}' \
  http://127.0.0.1:<port>/api/stories/<id>
```
Print: `Updated <id> size to <S|M|L>`
