---
description: Load the latest handoff into context to resume work. Usage: /throughline:resume [story-id]
allowed-tools:
  - Bash
---

Fetch the most recent handoff and print its content into context so you can pick up where the last session left off.

Usage: `/throughline:resume [story-id]`

If a story ID is supplied (the full ID like `US-2026-05-17-billing-engine`), the latest handoff for that story is loaded. With no argument, the most recent handoff overall is loaded.

1. Ensure the daemon is running (same bootstrap as other commands):
   ```bash
   bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and extract `port` and `token` from the JSON output.

3. Fetch the latest handoff. Append `?story=<story-id>` to the URL only when a story ID argument was supplied:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/handoffs/latest"
   ```

4. If the response status is 200, print the handoff with its title and age, then its content:
   ```
   <title> (<age>)

   <content>
   ```
   If 404, print: "No handoff found."
