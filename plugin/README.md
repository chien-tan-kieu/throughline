# claude-control plugin

Observer plugin for Claude Code. Records hook events to a local SQLite database.

## Local development

Claude Code does not support installing plugins from local paths via `claude plugins install`.
Use `--plugin-dir` instead — it loads the plugin for that session without a permanent install:

```bash
# From the repo root
claude --plugin-dir ./plugin
```

On `SessionStart`, `bootstrap.sh` probes the daemon's healthz endpoint and spawns it if not
running. Every subsequent hook fires `forward.sh`, which POSTs the event payload to the daemon.

## Verifying it works

After starting a session with `--plugin-dir`:

```bash
# Confirm the daemon is running and see its port
cat ~/.claude-control/runtime.json

# Query recorded events
sqlite3 ~/.claude-control/claude-control.db \
  "SELECT event_name, session_id, datetime(ts/1000, 'unixepoch', 'localtime') FROM events ORDER BY ts DESC LIMIT 20;"
```

Data directory defaults to `~/.claude-control`. Override with `CLAUDE_PLUGIN_DATA`:

```bash
CLAUDE_PLUGIN_DATA=/tmp/cc-test claude --plugin-dir ./plugin
```

## Running tests and the daemon directly

```bash
# Run the test suite
bun test --cwd packages/server

# Start the daemon in watch mode (dev)
bun run --watch packages/server/src/index.ts
```
