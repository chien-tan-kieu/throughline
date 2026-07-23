---
description: Link a spec document to the active story
allowed-tools:
  - Bash
---

Link a spec file to the active story. Usage: `/throughline:spec [path]`

**Step 1: Ensure daemon is running**

```bash
bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
```
If the script prints an error, stop and show it. Otherwise continue.

Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and parse `port` and `token`.

**Step 2: Get the active story**

```bash
curl -s \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  http://127.0.0.1:<port>/api/sessions/current
```

Parse `activeStoryId`. If it is `null`, print: "No active story. Start one with `/throughline:start <id>`." and stop.

**Step 3: Resolve the spec path**

If ARGUMENTS is provided:
- Resolve it to an absolute path: `realpath "<arg>" 2>/dev/null || readlink -f "<arg>"`
- If the file does not exist, print: "File not found: <arg>" and stop.
- Use this absolute path as `<spec_path>`.

If ARGUMENTS is not provided:
- List available spec files:
  ```bash
  ls "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/docs/superpowers/specs/" 2>/dev/null
  ```
- Print the list. Ask the user: "Which spec file should be linked? Re-run with the filename as argument, e.g. `/throughline:spec docs/superpowers/specs/<filename>`"
- Stop.

**Step 4: Link the spec**

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  -H "Content-Type: application/json" \
  -d "{\"linked_spec\": \"<spec_path>\"}" \
  http://127.0.0.1:<port>/api/stories/<activeStoryId>
```

**Step 5: Print result**

If the response contains an `error` field, print it. Otherwise print:
`Linked <filename> to story <activeStoryId>`
