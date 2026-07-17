---
description: Manage Throughline stories — new, list, or size subcommands
allowed-tools:
  - Bash
  - Read
  - Write
---

Manage stories. Usage: `/throughline:story <subcommand> [args]`

**Step 0: Ensure daemon is running**

Run this to check and auto-start if needed:
```bash
bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
```
If the script prints an error, stop and show it to the user. Otherwise continue.

Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and parse `port` and `token` from the JSON output. All curl commands use:
- Header: `Authorization: Bearer <token>`
- Header: `Host: 127.0.0.1:<port>`
- Base URL: `http://127.0.0.1:<port>`

**Subcommand: `new <title>`**

1. POST to `/api/stories` with body `{"title": "<title>"}`:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     -H "Content-Type: application/json" \
     -d '{"title": "<title>"}' \
     http://127.0.0.1:<port>/api/stories
   ```

2. From the JSON response extract: `id`, `file_path`, `title`, `status`, `created_at` (ms timestamp → convert to `YYYY-MM-DD`).

3. Using the title and any additional context the user provided, generate:
   - A user story statement: "As a **[role]**, I want to **[action]**, so that **[benefit]**." — infer role, action, and benefit from the title and context.
   - 5–8 concrete, testable acceptance criteria as checkboxes.
   - Relevant implementation notes (or omit the Notes section if nothing meaningful to add).

4. Write the generated content to `<file_path>` using the Write tool, preserving this exact frontmatter format:
   ```
   ---
   id: <id>
   title: <title>
   status: <status>
   size: 
   created: <YYYY-MM-DD>
   ---

   ## Story

   As a **[role]**, I want to **[action]**, so that **[benefit]**.

   ## Acceptance criteria

   - [ ] <criterion 1>
   - [ ] <criterion 2>
   - [ ] ...

   ## Notes

   <notes, or remove section if nothing to add>
   ```

5. Print: `Created story <id> at <file_path>`

**Subcommand: `list`**

GET `/api/stories`:
```bash
curl -s \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  http://127.0.0.1:<port>/api/stories
```
Print a table with columns: ID | Title | Size | Status

**Subcommand: `size <id> <S|M|L>`**

PATCH `/api/stories/<id>` with body `{"size": "<S|M|L>"}`:
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  -H "Content-Type: application/json" \
  -d '{"size": "<S|M|L>"}' \
  http://127.0.0.1:<port>/api/stories/<id>
```
Print: `Updated <id> size to <S|M|L>`
