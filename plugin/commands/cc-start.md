---
description: Load a story and launch the Superpowers brainstorming workflow
allowed-tools:
  - Bash
  - Read
---

Start a story by feeding it into the Superpowers brainstorming workflow.

Usage: `/cc:start <story-id>`

1. Read `~/.claude-control/runtime.json` for `port` and `token`.

2. Fetch the story:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     http://127.0.0.1:<port>/api/stories/<story-id>
   ```
   If 404, print "Story <story-id> not found." and stop.

3. Return this prompt expansion to Claude (do not execute it yourself — output it as the next user message):

   ```
   I want to work on this story:

   **ID:** <id>
   **Title:** <title>
   **Status:** <status>

   <body>

   Please invoke the Superpowers brainstorming skill to explore this story's requirements, identify design decisions, and help me write a spec.
   ```
