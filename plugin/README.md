# claude-control plugin

Observer plugin for Claude Code. Records hook events to a local SQLite database.

## Development usage

```bash
# Start Claude Code with this plugin
claude --plugin-dir ./plugin

# Run daemon directly (watch mode)
cd packages/server && bun run --watch src/index.ts

# Run tests
cd packages/server && bun test
```

## How it works

`bootstrap.sh` runs on `SessionStart` — it probes the daemon's healthz endpoint and spawns it if not running. `forward.sh` runs on all other events and forwards the JSON payload to the daemon via curl.
