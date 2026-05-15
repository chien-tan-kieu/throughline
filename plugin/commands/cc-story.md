---
description: Manage Claude Control stories — new, list, or size subcommands
allowed-tools:
  - Bash
  - Read
---

Manage stories. Usage: `/cc:story <subcommand> [args]`

Read `~/.claude-control/runtime.json` to get `port` and `token`. All curl commands use:
- Header: `Authorization: Bearer <token>`
- Header: `Host: 127.0.0.1:<port>`
- Base URL: `http://127.0.0.1:<port>`

**Subcommand: `new <title>`**

POST to `/api/stories` with body `{"title": "<title>"}`:
```bash
curl -s -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>"}' \
  http://127.0.0.1:<port>/api/stories
```
Print: `Created story <id> at <file_path>`

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
