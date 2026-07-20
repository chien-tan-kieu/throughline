---
description: Load a story and launch the appropriate workflow based on its status
allowed-tools:
  - Bash
  - Read
  - Skill
---

Start a story by loading it and dispatching to the appropriate workflow for its status.

Usage: `/throughline:start <story-id>`

1. Ensure daemon is running:
   ```bash
   bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
   ```
   If the script prints an error, stop and show it. Otherwise continue.

2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and parse `port` and `token` from the JSON output.

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

3c. Fetch the latest handoff for this story to surface prior context:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/handoffs/latest?story=<story-id>"
   ```
   If the response status is 200, take its `content` field and make it available to the mode file under a `## Last handoff` heading. If the response is 404 or the curl fails, proceed unchanged — there is simply no last handoff.

4. Determine the mode file based on the story's `status` field:

   | Status | Mode file |
   |--------|-----------|
   | `backlog` | `backlog.md` |
   | `in-progress` | `in-progress.md` |
   | `done` | `done.md` |

   If the status is not one of the above, print: "Unrecognized status '<status>' — defaulting to backlog mode." and use `backlog.md`.

   Resolve the install location and construct the absolute path to the mode file:

   ```bash
   INSTALL=$(jq -r '."throughline-local".installLocation' ~/.claude/plugins/known_marketplaces.json 2>/dev/null)
   if [ -z "$INSTALL" ] || [ "$INSTALL" = "null" ]; then echo "Cannot resolve throughline install location."; exit 1; fi
   echo "$INSTALL/plugin/commands/lib/start/<mode-file>"
   ```

   Replace `<mode-file>` with the filename from the table above.

   Use the `Read` tool on the absolute path returned by that command. If the `Read` tool returns an error (e.g., file not found), print: "Mode file not found for status '<status>' — defaulting to backlog mode." and load `backlog.md` instead (re-run the bash block above with `<mode-file>` replaced by `backlog.md`). Then follow the instructions in the loaded file exactly. The story context available to the mode file is: `id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`. When a prior handoff exists (step 3c returned 200), a `## Last handoff` section with its content is also available.
