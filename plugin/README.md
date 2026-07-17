# throughline plugin

A Kanban board + Spec-Driven Development lifecycle tracker for Claude Code, built on a passive observer. It records hook events to a local SQLite database and pairs them with stories and a board so you can see where your Superpowers work stands — brainstorm → spec → plan → implement — across sessions. Built for solo-developer-with-AI flow, not team Scrum: continuous flow over a board, with `standup` and `handoff` as context utilities rather than ceremonies.

## Installing (end users)

Add a marketplace entry pointing at this repo's `dist` branch — a curated
build (bundled server, built web assets, plugin resources only; no source,
tests, or dev tooling):

```json
{
  "throughline": {
    "source": { "source": "github", "repo": "chien-tan-kieu/throughline", "ref": "dist" },
    "installLocation": "..."
  }
}
```

Use `"ref": "dist"` to always track the latest release, or pin to an exact
past release with `"ref": "vX.Y.Z"`. List available versions with:

```bash
git ls-remote --tags https://github.com/chien-tan-kieu/throughline
```

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
cat ~/.throughline/runtime.json

# Query recorded events
sqlite3 ~/.throughline/throughline.db \
  "SELECT event_name, session_id, datetime(ts/1000, 'unixepoch', 'localtime') FROM events ORDER BY ts DESC LIMIT 20;"
```

Data directory defaults to `~/.throughline`. Override with `CLAUDE_PLUGIN_DATA`:

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
