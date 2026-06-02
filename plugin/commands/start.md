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
   bash -c 'S=$(jq -r ".[\"claude-control-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate claude-control install."; exit 1; }'
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude-control/runtime.json"` and parse `port` and `token` from the JSON output.

3. Fetch the story:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     http://127.0.0.1:<port>/api/stories/<story-id>
   ```
   If 404, print "Story <story-id> not found." and stop.

3b. Record the active story for the dashboard:
   ```bash
   curl -s -X PATCH \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     -H "Content-Type: application/json" \
     -d '{"active_story_id":"<story-id>"}' \
     http://127.0.0.1:<port>/api/sessions/current || true
   ```
   (Best-effort — ignore any errors.)

4. Invoke the `superpowers:brainstorming` skill directly via the Skill tool, passing the story as context:

   ```
   skill: superpowers:brainstorming
   args: |
     I want to work on this story:

     **ID:** <id>
     **Title:** <title>
     **Status:** <status>

     <body>
   ```

   Do not ask the user to invoke the skill — invoke it yourself immediately.
