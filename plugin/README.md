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
Use `--plugin-dir` instead — it loads the plugin for that session without a permanent install.
Point it at the **repo root**, not `./plugin`: the plugin manifest is
`.claude-plugin/plugin.json`, which declares `"hooks": "./plugin/hooks/hooks.json"` relative
to the repo root, so `--plugin-dir` needs the root to find it.

```bash
# From the repo root
claude --plugin-dir .
```

On `SessionStart`, `bootstrap.sh` probes the daemon's healthz endpoint and spawns it if not
running. Every subsequent hook fires `forward.sh`, which POSTs the event payload to the daemon.

## Verifying it works

After starting a session with `--plugin-dir`, from whatever directory you ran it in
(the daemon and its data are project-local, keyed off `CLAUDE_PROJECT_DIR`/the current
git repo, not a fixed home-directory path):

```bash
# Confirm the daemon is running and see its port
cat .throughline/runtime.json

# Query recorded events
sqlite3 .throughline/throughline.db \
  "SELECT event_name, session_id, datetime(ts/1000, 'unixepoch', 'localtime') FROM events ORDER BY ts DESC LIMIT 20;"
```

## Running tests and the daemon directly

```bash
# Run the test suite
bun test --cwd packages/server

# Start the daemon in watch mode (dev)
bun run --watch packages/server/src/index.ts
```
