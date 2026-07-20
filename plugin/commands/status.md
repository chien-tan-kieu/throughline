---
description: Show Throughline daemon status, active session, and inferred phase
allowed-tools:
  - Bash
  - Read
---

Show the Throughline daemon status.

1. Ensure daemon is running:
   ```bash
   bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and extract `port` and `token` from the JSON output.

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
   Daemon:  running  (port <port>, pid <pid>, v<version>)
   Session: <id of most recent session, or "none">
   Phase:   <inferred_phase of most recent session, or "unknown">
   Story:   <active_story_id of most recent session, or "none">
   ```
