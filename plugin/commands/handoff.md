---
description: Generate a handoff document for a story. Usage: /throughline:handoff <story-id>
allowed-tools:
  - Bash
---

Generate a handoff document for the specified story and write it to disk.

Usage: `/throughline:handoff <story-id>`

The story ID is the full ID like `US-2026-05-17-billing-engine`.

1. Ensure the daemon is running (same bootstrap as other commands):
   ```bash
   bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
   ```

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and extract `port` and `token` from the JSON output.

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
