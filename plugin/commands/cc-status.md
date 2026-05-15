---
description: Show Claude Control daemon status, active session, and inferred phase
allowed-tools:
  - Bash
  - Read
---

Show the Claude Control daemon status.

1. Read `~/.claude-control/runtime.json`. If the file does not exist, print "Daemon not running." and stop.

2. Parse the JSON and extract `port` and `token`.

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
   Daemon:  running  (port <port>, pid <pid>)
   Session: <id of most recent session, or "none">
   Phase:   <inferred_phase of most recent session, or "unknown">
   Story:   <active_story_id of most recent session, or "none">
   ```
