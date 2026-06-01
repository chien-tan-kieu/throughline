---
description: Show today's standup digest from Claude Control (shipped yesterday, in-progress, blockers)
allowed-tools:
  - Bash
---

Generate and display the daily standup digest.

1. Ensure the daemon is running:
   ```bash
   bash -c 'S=$(jq -r ".[\"claude-control-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate claude-control install."; exit 1; }'
   ```
   If the script prints an error, stop and show it.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude-control/runtime.json"` and extract `port` and `token` from the JSON output.

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
