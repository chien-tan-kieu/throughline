---
description: Print the Claude Control dashboard URL for the browser
allowed-tools:
  - Read
---

Open the Claude Control dashboard.

1. Read `~/.claude-control/runtime.json`. If the file does not exist, print "Daemon not running. Start it with: bun run src/index.ts" and stop.

2. Parse the JSON and extract `port` and `token`.

3. Print:
   ```
   Open this URL in your browser:
   http://127.0.0.1:<port>/?token=<token>
   ```
