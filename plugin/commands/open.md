---
description: Print the Claude Control dashboard URL for the browser
allowed-tools:
  - Bash
  - Read
---

Open the Claude Control dashboard.

1. Ensure daemon is running:
   ```bash
   bash -c 'S=$(jq -r ".[\"claude-control-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate claude-control install."; exit 1; }'
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude-control/runtime.json"` and parse `port` and `token` from the JSON output.

3. Print:
   ```
   Open this URL in your browser:
   http://127.0.0.1:<port>/#token=<token>
   ```
