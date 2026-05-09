# Design: Claude Control — Foundation (Weeks 1–2)

**Date:** 2026-05-06
**Scope:** Weeks 1–2 of the claude-control plugin MVP. Weeks 3–4 (Superpowers integration, stories, standup) and Weeks 5–8 (dashboard, distribution) are separate specs.
**Source:** PRD at `docs/features/claude-control-plugin/PRD.md` + hooks API audit against live Anthropic docs.

---

## 1. Goal

Deliver a working plugin foundation: hooks fire from Claude Code, reach a local Bun daemon, get persisted to SQLite, and respond with `{}`. Nothing more. The foundation proves the full stack is wired before any feature logic is added.

**Success criteria for Weeks 1–2:**
- `claude --plugin-dir ./plugin` starts a session, bootstrap spawns the daemon
- Every hook event is received by the daemon, validated, persisted, and returns `{}`
- Observer contract test is green: no handler can ever return a decision field
- Full round-trip integration test passes: POST → `{}` response + event row in SQLite

---

## 2. Hooks API corrections (from live docs audit)

The PRD contained several assumptions about the Claude Code hooks API that needed correction. These are the authoritative decisions going into implementation:

| PRD assumption | Reality | Decision |
|---|---|---|
| HTTP hooks support `async: true` | HTTP hooks are always synchronous — `async` flag is ignored | Use **command hooks** (shell scripts) for all events instead of HTTP |
| `FileChanged` matcher supports glob patterns | Matcher accepts **literal filenames only** — no wildcards or directories | Drop `FileChanged` from `hooks.json`; daemon does its own file watching via `Bun.watch` / chokidar (Weeks 3–4) |
| `SubagentStop` field: `last_assistant_message` | Actual field name is **`output`** | Use `output` in Zod schema |
| `SubagentStop` field: `agent_id` | Actual field is **`subagent_id`** | Use `subagent_id` in Zod schema |
| `~/.claude-control/` for runtime data | Use **`$CLAUDE_PLUGIN_DATA`** env var (provided by Claude Code for plugin persistent storage) | Replace all hardcoded home-dir paths with `$CLAUDE_PLUGIN_DATA` |
| Token distributed via `CLAUDE_ENV_FILE` | Not needed — shell scripts read `runtime.json` directly | `CLAUDE_ENV_FILE` not used in foundation |

**New hooks added (not in PRD):**

| Hook | Reason |
|---|---|
| `SessionEnd` | Definitive session termination; `Stop` fires per-turn, not per-session. Use `SessionEnd` to set `sessions.status = 'ended'` |
| `UserPromptExpansion` | Fires on slash command expansion — detects `/cc:start`, `/cc:story`, etc. |
| `PreCompact` / `PostCompact` | Context compaction lifecycle events; annotate session timeline |

**Phase inference via `InstructionsLoaded`:** confirmed to exist with fields `file_path`, `memory_type`, `load_reason`. Use as primary phase signal; artifact presence on disk as fallback. `memory_type = 'Managed'` is the expected value for plugin skill files. Mark phase as `unknown` if neither signal fires — do not guess.

---

## 3. Monorepo structure

pnpm workspace with three packages. Only `shared` and `server` are implemented in Weeks 1–2. `web` is a stub directory so the workspace resolves.

```
claude-control/
├── package.json                  ← pnpm workspace root, scripts: dev, build, test
├── pnpm-workspace.yaml
├── tsconfig.base.json            ← strict: true, moduleResolution: bundler
├── biome.json                    ← lint + format (replaces eslint + prettier)
├── packages/
│   ├── shared/                   ← Zod schemas, contract types
│   │   ├── package.json          ← name: @cc/shared
│   │   └── src/
│   │       ├── events.ts         ← HookEventSchema discriminated union
│   │       ├── api.ts            ← REST + WS contract types (stubs for now)
│   │       └── index.ts
│   ├── server/                   ← Bun daemon
│   │   ├── package.json          ← name: @cc/server
│   │   ├── src/
│   │   │   ├── index.ts          ← entry point, arg parsing
│   │   │   ├── server.ts         ← Bun.serve + route table
│   │   │   ├── hooks/            ← one handler file per event group
│   │   │   │   ├── index.ts      ← dispatch by event_name
│   │   │   │   └── handlers.ts   ← all handlers, all return {}
│   │   │   ├── security/
│   │   │   │   └── index.ts      ← token check, Host validation, rate limit
│   │   │   ├── store/
│   │   │   │   ├── index.ts      ← SQLite queries
│   │   │   │   └── migrate.ts    ← run migrations on startup
│   │   │   └── lifecycle/
│   │   │       └── index.ts      ← SIGTERM handler, idle shutdown timer
│   │   └── migrations/
│   │       └── 001_initial.sql
│   └── web/
│       └── package.json          ← name: @cc/web, stub only
└── plugin/                       ← plugin artifact (not a build target)
    ├── .claude-plugin/
    │   └── plugin.json
    ├── hooks/
    │   ├── hooks.json
    │   ├── bootstrap.sh          ← probe + spawn daemon
    │   └── forward.sh            ← port discovery + curl forward
    ├── skills/
    │   └── claude-control/
    │       └── SKILL.md          ← explains plugin to Claude
    └── README.md
```

**Biome** is chosen over ESLint + Prettier: one config file, native Bun support, fast.

`plugin/` is a plain directory, not a workspace package — it is an artifact that gets shipped, not built.

---

## 4. Shared package — Zod schemas

All hook event types live in `packages/shared/src/events.ts` as a discriminated union on `hook_event_name`. This provides TypeScript narrowing throughout the daemon.

```typescript
// Base fields present on every hook event
const BaseHookSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.string(),
  permission_mode: z.enum([
    'default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions',
  ]),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
});
```

Per-event schemas extend the base. Corrections from PRD applied:

```typescript
const SubagentStopSchema = BaseHookSchema.extend({
  hook_event_name: z.literal('SubagentStop'),
  agent_type: z.string(),
  subagent_id: z.string(),       // corrected: was agent_id in PRD
  stop_reason: z.enum(['completed', 'error', 'user_interrupt']),
  output: z.string(),            // corrected: was last_assistant_message in PRD
});

const SubagentStartSchema = BaseHookSchema.extend({
  hook_event_name: z.literal('SubagentStart'),
  agent_type: z.string(),
  prompt: z.string(),
  subagent_id: z.string(),       // corrected: was agent_id in PRD
  parent_session_id: z.string(), // enables P1 tree visualization
});

const InstructionsLoadedSchema = BaseHookSchema.extend({
  hook_event_name: z.literal('InstructionsLoaded'),
  file_path: z.string(),
  memory_type: z.enum(['Project', 'User', 'Local', 'Managed']),
  load_reason: z.string(),
  globs: z.array(z.string()).optional(),
  trigger_file_path: z.string().optional(),
  parent_file_path: z.string().optional(),
});
```

All 14 events in the discriminated union:

```typescript
export const HookEventSchema = z.discriminatedUnion('hook_event_name', [
  SessionStartSchema,
  SessionEndSchema,          // new
  UserPromptSubmitSchema,
  UserPromptExpansionSchema, // new
  PreToolUseSchema,
  PostToolUseSchema,
  PostToolUseFailureSchema,
  SubagentStartSchema,
  SubagentStopSchema,
  StopSchema,
  NotificationSchema,
  InstructionsLoadedSchema,
  PreCompactSchema,          // new
  PostCompactSchema,         // new
]);

export type HookEvent = z.infer<typeof HookEventSchema>;
```

The shared package exports only schemas and types — no runtime logic. Both `@cc/server` and `@cc/web` depend on it.

---

## 5. Daemon design

**Runtime:** Bun 1.x. Single-process, singleton enforced by port binding.

**Startup sequence:**

1. Attempt to bind `127.0.0.1:47821`. If taken, try 47822–47830. If all taken, log error and exit.
2. Generate token: `crypto.randomBytes(32).toString('hex')`
3. Write `$CLAUDE_PLUGIN_DATA/runtime.json` at mode `0600`:
   ```json
   { "port": 47821, "token": "a3f8c2...", "pid": 12345, "started_at": "...", "version": "0.1.0" }
   ```
4. Run SQLite migrations (idempotent `IF NOT EXISTS`)
5. Start 4-hour idle timer: reset on each hook event, self-exit on expiry

**Route table:**

| Route | Auth | Handler |
|---|---|---|
| `GET /api/healthz` | none | `{"status":"ok"}` |
| `POST /hooks/:eventName` | Bearer token | validate → persist → bus stub → `{}` |
| `GET /api/*` | Bearer token | 501 stub (implemented Weeks 5–6) |
| `WS /ws` | token query param | stub (implemented Weeks 5–6) |

**Security gate (applied to all routes except `/api/healthz`):**

1. `Host` header must be `127.0.0.1[:<port>]` or `localhost[:<port>]` — reject with 403 otherwise (DNS rebinding mitigation)
2. `Authorization: Bearer <token>` must match `runtime.json` token — reject with 401 otherwise
3. Rate limit: 1000 events/min per `session_id` — return 200 with empty body beyond limit (don't persist, don't crash)

**Hook handler pipeline:**

```
POST /hooks/PreToolUse
  → security gate
  → parse body: HookEventSchema.parse(await req.json())  [400 on failure]
  → persistEvent(db, event)  [async, fire-and-forget]
  → bus.publish(...)          [no-op stub in Weeks 1-2]
  → return new Response('{}', { status: 200 })
```

Every handler ends with `return new Response('{}', { status: 200 })`. No exceptions. This is enforced by the observer contract test (see Section 8).

**What is stubbed in Weeks 1–2:**

- In-memory pub/sub bus: `bus.publish()` is a no-op function
- WS broadcast: not implemented
- All Superpowers artifact parsing: not implemented
- Story CRUD: not implemented
- REST API endpoints beyond healthz: return 501

---

## 6. Plugin scaffold

**`plugin/.claude-plugin/plugin.json`:**

```json
{
  "name": "claude-control",
  "description": "Workflow visualizer for Claude Code + Superpowers. Observer-only.",
  "version": "0.1.0",
  "author": { "name": "claude-control contributors" },
  "license": "MIT"
}
```

**`plugin/hooks/hooks.json`** — all command hooks, no HTTP:

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/bootstrap.sh" }] }],
    "PreToolUse":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "PostToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "SubagentStart":      [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "SubagentStop":       [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "Stop":               [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "SessionEnd":         [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "Notification":       [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "UserPromptSubmit":   [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "UserPromptExpansion":[{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "InstructionsLoaded": [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "PreCompact":         [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "PostCompact":        [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }]
  }
}
```

`async: true` only on events where the Claude Code docs confirm async command hook support. Events without async support (`PreToolUse`, `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `PreCompact`) are synchronous but always exit 0 immediately.

**`plugin/hooks/forward.sh`** — temporary wrapper (replaced by binary in Weeks 7–8):

```bash
#!/bin/bash
# forward.sh — reads port+token from runtime.json, curls daemon in background
RUNTIME="${CLAUDE_PLUGIN_DATA}/runtime.json"
[ -f "$RUNTIME" ] || exit 0

PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null) || exit 0
TOKEN=$(jq -r '.token' "$RUNTIME" 2>/dev/null) || exit 0
PAYLOAD=$(cat -)
EVENT=$(echo "$PAYLOAD" | jq -r '.hook_event_name' 2>/dev/null) || exit 0

echo "$PAYLOAD" | curl -sf --max-time 5 \
  -X POST "http://127.0.0.1:${PORT}/hooks/${EVENT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- > /dev/null 2>&1 &

exit 0
```

The `curl` runs in background (`&`) so the script exits immediately regardless of the `async` flag. Silently no-ops if runtime.json doesn't exist (daemon not yet started).

**`plugin/hooks/bootstrap.sh`** — probe + spawn:

```bash
#!/bin/bash
# bootstrap.sh — probe daemon health, spawn if not running
RUNTIME="${CLAUDE_PLUGIN_DATA}/runtime.json"
LOG="${CLAUDE_PLUGIN_DATA}/daemon.log"
mkdir -p "$CLAUDE_PLUGIN_DATA"

probe() { curl -sf --max-time 2 "http://127.0.0.1:$1/api/healthz" > /dev/null 2>&1; }

# Hot path: daemon already running (~30ms)
if [ -f "$RUNTIME" ]; then
  PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null)
  if probe "$PORT"; then
    echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control is observing this session. Run /cc:open for the dashboard URL. This plugin only observes — it never blocks tool calls."}}'
    exit 0
  fi
fi

# Cold path: spawn daemon
# Dev mode: server source tree exists alongside plugin
if [ -f "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" ]; then
  bun run "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  "$CLAUDE_PLUGIN_ROOT/bin/cc-daemon" >> "$LOG" 2>&1 &
fi

# Wait up to 3s (30 × 100ms polls)
for i in $(seq 1 30); do
  sleep 0.1
  if [ -f "$RUNTIME" ]; then
    PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null) && probe "$PORT" && \
      echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control started."}}' && exit 0
  fi
done

exit 0  # non-blocking — Claude Code continues regardless
```

---

## 7. SQLite schema

One migration file for Weeks 1–2. Subsequent migrations (stories, plan_tasks, plan_steps, handoffs) are added as `002_...sql` in Weeks 3–4.

```sql
-- migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT    PRIMARY KEY,
  cwd             TEXT    NOT NULL,
  model           TEXT,
  agent_type      TEXT,
  permission_mode TEXT,
  started_at      INTEGER NOT NULL,  -- Unix ms
  ended_at        INTEGER,
  status          TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'ended'
  inferred_phase  TEXT               -- 'brainstorm'|'spec'|'plan'|'implement'|null
  -- active_story_id, active_plan_path added in 002_superpowers.sql
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT    NOT NULL,
  subagent_id  TEXT,                 -- populated for SubagentStart / SubagentStop
  event_name   TEXT    NOT NULL,
  payload_json TEXT    NOT NULL,     -- full validated JSON payload
  ts           INTEGER NOT NULL      -- Unix ms
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name, ts);
```

`sessions.status` is set to `'ended'` when `SessionEnd` fires (not `Stop`, which fires per-turn).

`events.subagent_id` is a promoted column for subagent queries without JSON parsing. All other event-specific fields stay in `payload_json`.

No migration framework — `migrate.ts` reads migration files from `migrations/` in filename order and runs each against the database, skipping already-applied ones via a `_migrations` tracking table.

---

## 8. Testing

**Layer 1 — Unit (bun:test):**

Observer contract test — the most important test in the codebase:

```typescript
// hooks/__tests__/observer-contract.test.ts
const ALL_EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'UserPromptExpansion',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStart', 'SubagentStop', 'Stop',
  'Notification', 'InstructionsLoaded', 'PreCompact', 'PostCompact',
];

for (const event of ALL_EVENTS) {
  test(`${event} handler returns exactly {}`, async () => {
    const res = await handleHookEvent(event, makeFakePayload(event), mockDb, mockBus);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{}');
  });
}
```

Additional unit tests:
- Security: missing token → 401, wrong token → 401, non-localhost Host → 403, rate limit exceeded → 200 (no-op, not persisted)
- Validation: malformed payload → 400
- Store: `persistEvent` inserts correct session_id, event_name, ts, payload_json
- Store: `SessionEnd` handler updates `sessions.status = 'ended'`
- Migrations: running migrations twice is idempotent

**Layer 2 — Integration (one test):**

```typescript
test('full hook round-trip: POST → {} + SQLite row', async () => {
  const server = await startDaemon({ port: 0 }); // port 0 = OS assigns
  const token = server.token;
  const port = server.port;

  const res = await fetch(`http://127.0.0.1:${port}/hooks/PreToolUse`, {
    method: 'POST',
    headers: {
      'Host': `127.0.0.1:${port}`,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(makePreToolUsePayload()),
  });

  expect(res.status).toBe(200);
  expect(await res.text()).toBe('{}');

  const events = server.db.query('SELECT * FROM events').all();
  expect(events).toHaveLength(1);
  expect(events[0].event_name).toBe('PreToolUse');

  await server.stop();
});
```

Run with: `cd packages/server && bun test`

---

## 9. Dev workflow

```bash
# Start daemon in watch mode (Terminal 1)
cd packages/server && bun run --watch src/index.ts

# Start Claude Code with local plugin (Terminal 2)
claude --plugin-dir ./plugin

# After changing hooks.json or shell scripts:
/reload-plugins    # inside Claude Code session — no restart needed

# Run all tests
cd packages/server && bun test
```

No build step needed during development. `bun run --watch` handles TypeScript directly. The plugin's bootstrap script detects dev mode via the presence of `packages/server/src/index.ts` and connects to the running watch process.

For linting: `bunx biome check .` from repo root.

---

## 10. What this spec does not cover

The following are intentionally out of scope for Weeks 1–2 and will be specced separately:

- Superpowers artifact watcher, plan/spec markdown parser, checkbox diff (Weeks 3–4)
- Phase inference implementation beyond schema stubs (Weeks 3–4)
- Story CRUD, file-backed storage, watcher (Weeks 3–4)
- Standup generator, handoff generator (Weeks 3–4)
- React dashboard, Vite scaffold, WS client (Weeks 5–6)
- Cross-platform binary compilation, plugin packaging for marketplace (Weeks 7–8)
- Slash commands: `/cc:status`, `/cc:open`, `/cc:story`, `/cc:start`, `/cc:standup`, `/cc:handoff` (Weeks 3–4)

The `forward.sh` shell script is an explicitly temporary artifact. It will be replaced by a compiled Bun binary with `bootstrap` and `forward <EventName>` subcommands in Weeks 7–8. The interface boundary is clean: `hooks.json` command paths are the only coupling point between the plugin scaffold and the forwarding implementation.

---

*End of spec — Foundation (Weeks 1–2)*
