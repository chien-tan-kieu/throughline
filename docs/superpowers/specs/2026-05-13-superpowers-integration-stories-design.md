# Claude Control — Superpowers Integration + Stories (Phase 2)

> Status: Draft  
> Date: 2026-05-13  
> Follows: `docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md`  
> Deferred to Phase 3: standup generator, handoff generator (`/claude-control:standup`, `/claude-control:handoff`)

---

## 1. Goal

Wire the daemon to the Superpowers workflow and add story management so the system is useful before the Dashboard exists. By the end of this phase:

- The daemon watches Superpowers spec/plan files and keeps parsed state in SQLite.
- Checkbox changes in plan files are detected, diffed, and broadcast over WebSocket.
- Phase is inferred from `InstructionsLoaded` events and artifact presence.
- Stories can be created, read, updated, and archived via REST and slash commands.
- A WebSocket server is ready for the Dashboard to subscribe to in Phase 3.
- Four slash commands are functional: `/claude-control:status`, `/claude-control:open`, `/claude-control:story`, `/claude-control:start`.

---

## 2. Scope

### In Phase 2

- `SuperpowersWatcher` — file watcher + plan parser + checkbox diff + phase inference
- `StoryService` — story CRUD, file watcher, SQLite cache
- `WsServer` — WebSocket upgrade handler, topic fan-out
- REST API routes — sessions, events, stories CRUD, plans, specs (replaces 501 stubs)
- Database migration `002_superpowers.sql` — plan_tasks, plan_steps, stories tables
- `@cc/shared` additions — `plan.ts`, `story.ts`, updated `api.ts`
- Slash commands — `/claude-control:status`, `/claude-control:open`, `/claude-control:story`, `/claude-control:start`

### Deferred to Phase 3

- Standup generator (`/claude-control:standup`, `GET /api/standup`)
- Handoff generator (`/claude-control:handoff`, `POST /api/handoff/:storyId`)
- Dashboard SPA (React/Vite)

---

## 3. Architecture

Service objects (Approach B): stateful subsystems are classes with `start()`/`stop()` lifecycle methods. `index.ts` instantiates them and wires them together. The bus is used only for WS fan-out, not as the primary communication mechanism between subsystems.

```
index.ts
  ├─ opens SQLite (runMigrations)
  ├─ creates Bus
  ├─ creates SuperpowersWatcher(cwd, db, bus) → .start()
  ├─ creates StoryService(cwd, db, bus) → .start()
  ├─ creates WsServer(bus)
  └─ creates Server(config + services) → Bun.serve
```

The `fetch` handler in `server.ts` receives service instances and routes:
- `GET /ws` → `WsServer.upgrade()`
- `POST /hooks/:event` → existing hook dispatcher (extended for InstructionsLoaded + PostToolUse plan-file detection)
- `GET|POST|PATCH|DELETE /api/*` → `mountApiRoutes()`

---

## 4. Module structure

```
packages/
├── shared/src/
│   ├── plan.ts          ← PlanTask, PlanStep, ParsedPlan + parsePlan()
│   ├── story.ts         ← Story, StoryFrontmatter + parseFrontmatter()
│   ├── api.ts           ← REST + WS contract types (replaces `never` stub)
│   └── index.ts         ← re-exports plan, story, api
└── server/src/
    ├── superpowers/
    │   ├── index.ts     ← SuperpowersWatcher class
    │   ├── parser.ts    ← parsePlan(), parseSpec()
    │   ├── diff.ts      ← diffCheckboxState()
    │   ├── phase.ts     ← inferPhase()
    │   └── __tests__/
    ├── stories/
    │   ├── index.ts     ← StoryService class
    │   ├── template.ts  ← scaffoldStory()
    │   └── __tests__/
    ├── ws/
    │   ├── index.ts     ← WsServer class
    │   └── __tests__/
    └── api/
        ├── index.ts     ← mountApiRoutes()
        ├── sessions.ts
        ├── events.ts
        ├── stories.ts
        ├── plans.ts
        └── specs.ts

plugin/commands/
    ├── status.md
    ├── open.md
    ├── story.md
    └── start.md
```

---

## 5. Plan parser (`@cc/shared`)

### Types

```ts
interface ParsedPlan {
  path: string
  title: string       // first H1 line
  tasks: PlanTask[]
}

interface PlanTask {
  index: number       // 1-based
  title: string       // text after "Task N:"
  files: string[]     // lines captured under **Files:** block
  steps: PlanStep[]
}

interface PlanStep {
  index: number       // 1-based within task
  label: string       // text after `- [ ] ` or `- [x] `
  state: "todo" | "done"
}
```

### `parsePlan(content: string, path: string): ParsedPlan`

Line-by-line state machine — no external dependencies:

1. Scan for first `# ` line → `title`
2. On `### Task N:` → open new task, capture title text
3. On `**Files:**` inside a task → enter files-block mode; capture subsequent `- ` lines until blank line
4. On `- [ ] ` or `- [x] ` → append step to current task
5. Unrecognised lines → skipped silently

Parser never throws. Malformed entries are skipped with no error.

### `parseSpec(content: string, path: string): { path: string; title: string; body: string }`

Extracts the first H1 as title, returns full content as body. No structural parsing needed for specs.

---

## 6. Checkbox diff (`@cc/server`)

### `diffCheckboxState(prev: ParsedPlan, next: ParsedPlan): CheckboxDiff[]`

```ts
interface CheckboxDiff {
  taskIndex: number
  stepIndex: number
  from: "todo" | "done"
  to: "todo" | "done"
}
```

Zips tasks and steps by index. Returns only entries where `from !== to`. If task counts differ (plan file restructured), diffs only the overlapping range and ignores the rest.

---

## 7. `SuperpowersWatcher`

```ts
class SuperpowersWatcher {
  constructor(cwd: string, db: Database, bus: Bus)
  start(): Promise<void>
  stop(): void
  getParsedPlan(path: string): ParsedPlan | null
  getSpecBody(path: string): string | null
}
```

**`start()`:**
1. Checks if `docs/superpowers/specs/` and `docs/superpowers/plans/` exist under `cwd`. If not, schedules a retry every 30s (Superpowers not installed yet).
2. Calls `Bun.watch` on both directories. Falls back to a 5s polling interval if `Bun.watch` throws (Windows edge case).
3. On any change event, debounces 200ms then calls `handleFileChange(path)`.
4. On startup, eagerly parses all existing plan files and populates `plan_tasks`/`plan_steps`.

**`handleFileChange(path)`:**
- If plan file: read → `parsePlan()` → `diffCheckboxState(cached, next)` → update `plan_tasks`/`plan_steps` in DB → `bus.publish({ type: "plan.changed", data: { path, tasks } })` → call `inferPhase()`
- If spec file: read → `bus.publish({ type: "spec.changed", data: { path } })`

**PostToolUse hook integration:** when `tool_name` is `Edit` or `Write` and the input path resolves to a plan file under `docs/superpowers/plans/`, the hook handler calls `watcher.handleFileChange(path)` directly (no wait for FS event).

---

## 8. Phase inference

### `inferPhase(sessionId: string, db: Database, cwd: string): Phase | null`

Queries `events` table for the session's most recent `InstructionsLoaded` events (up to last 20) and checks artifact presence on disk.

```ts
type Phase = "brainstorm" | "spec" | "plan" | "implement"
```

Signal priority (first match wins):

| Signal | Phase |
|---|---|
| `InstructionsLoaded` event with path containing `executing-plans` or `subagent-driven-development` | `implement` |
| `InstructionsLoaded` with path containing `writing-plans` | `plan` |
| `InstructionsLoaded` with path containing `brainstorming` | `brainstorm` |
| Checkbox state change detected in plan file | `implement` |
| New file detected in `docs/superpowers/plans/` | `plan` |
| New file detected in `docs/superpowers/specs/` | `spec` |

**Forward-only constraint:** phase only advances within a session. `implement` never regresses to `brainstorm`. Comparison uses the enum order: `brainstorm < spec < plan < implement`.

On phase change: `UPDATE sessions SET inferred_phase = ? WHERE id = ?` + `bus.publish({ type: "phase.inferred", data: { sessionId, phase } })`.

---

## 9. Story format

Stories live at `<repo>/docs/superpowers/stories/<id>.md`. The file is the canonical source of truth; SQLite is a cache rebuilt from files on `StoryService.start()`.

```markdown
---
id: US-2026-05-13-oauth-login
title: Add OAuth login
size: M
status: in-progress
created: 2026-05-13
linked_spec: docs/superpowers/specs/2026-05-13-oauth-design.md
linked_plan: docs/superpowers/plans/2026-05-13-oauth.md
---

## Story

As a [...], I want [...], so that [...].

## Acceptance criteria

- [ ] ...

## Notes

(optional)
```

### Frontmatter parser (`@cc/shared/story.ts`)

Hand-rolled: splits content on `---` boundaries, parses `key: value` lines, validates with Zod. Required fields: `id`, `title`, `status`, `created`. Optional: `size`, `linked_spec`, `linked_plan`.

---

## 10. `StoryService`

```ts
class StoryService {
  constructor(cwd: string, db: Database, bus: Bus)
  start(): Promise<void>
  stop(): void
  list(): Story[]
  get(id: string): StoryDetail | null
  create(title: string): Story
  update(id: string, patch: StoryPatch): Story
  archive(id: string): void
}
```

**`start()`:**
1. Ensures `docs/superpowers/stories/` exists (creates it if not).
2. Scans `*.md` files, parses frontmatter, upserts `stories` table.
3. Starts `Bun.watch` on the directory; on change → re-parse → update DB → `bus.publish({ type: "story.changed", data: { id, op } })`.

**`create(title)`:** generates id as `US-YYYY-MM-DD-<slug>` (slug = kebab-case of title, truncated to 40 chars). Calls `scaffoldStory()` from `template.ts`. Writes file. Upserts DB. Returns story row.

**`update(id, patch)`:** reads file, updates matching frontmatter fields, re-writes file, then updates the DB row directly. Does not wait for the file watcher to fire.

**`archive(id)`:** moves file to `docs/superpowers/stories/archive/<id>.md`. Updates DB `status = 'archived'`.

**Story id validation:** regex `^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$`. Rejects `..` and path separators. Applied before any file operation.

---

## 11. WebSocket server

```ts
class WsServer {
  constructor(bus: Bus)
  upgrade(req: Request, server: BunServer, token: string): boolean
}
```

Uses Bun's native WebSocket support (`websocket:` option on `Bun.serve`). No external library.

**Upgrade:** validates `?token=` query param against the daemon token. Rejects with 401 if missing or wrong. On success, calls `server.upgrade(req)`.

**Internal state:** `Map<WebSocket, Set<string>>` — client to subscribed topics.

**Client → server messages:**
- `{ type: "subscribe", topics: string[] }` — adds topics for this client
- `{ type: "unsubscribe", topics: string[] }` — removes topics
- `{ type: "ping" }` — server responds `{ type: "pong" }`

**Bus → WS fan-out:** `WsServer` subscribes to all bus events on construction. On each bus event, it serialises to JSON and sends to all clients whose topic set includes the event's topic.

**Topics:**
- `events` — all hook events
- `events:<sessionId>` — events for a specific session
- `plan:<path>` — plan changes for a specific file
- `stories` — all story changes
- `subagents:<sessionId>` — subagent lifecycle for a session

**WS message types** (server → client):

```ts
type WSOut =
  | { type: "event";            data: EventRecord }
  | { type: "plan.changed";     data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed";     data: { path: string } }
  | { type: "story.changed";    data: { id: string; op: "create" | "update" | "delete" } }
  | { type: "phase.inferred";   data: { sessionId: string; phase: Phase } }
  | { type: "subagent.started"; data: SubagentNode }
  | { type: "subagent.stopped"; data: { agent_id: string; summary: string } }
  | { type: "session.started";  data: Session }
  | { type: "session.ended";    data: { id: string } }
  | { type: "pong" }
```

---

## 12. REST API

`mountApiRoutes(req, url, ctx)` replaces the current `501` stub. `ctx` carries `{ db, watcher, stories }`.

All routes require Bearer token auth (via existing `checkAuth`). All errors return `{ error: string }` with appropriate HTTP status. `:path` params are URL-decoded and validated against `..` traversal before any file read.

### Sessions & events

| Method | Path | Response |
|---|---|---|
| GET | `/api/sessions` | `Session[]` |
| GET | `/api/sessions/:id` | `Session & { events: EventRecord[] }` (last 50) |
| GET | `/api/events?session=&since=&limit=` | `{ events: EventRecord[]; cursor: number }` (max 200) |

### Stories

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/stories` | — | `Story[]` |
| GET | `/api/stories/:id` | — | `StoryDetail` |
| POST | `/api/stories` | `{ title: string }` | `Story` (201) |
| PATCH | `/api/stories/:id` | `StoryPatch` | `Story` |
| DELETE | `/api/stories/:id` | — | `{}` (archives) |

### Superpowers

| Method | Path | Response |
|---|---|---|
| GET | `/api/plans/:path` | `ParsedPlan` |
| GET | `/api/specs/:path` | `{ path: string; title: string; body: string }` |

---

## 13. Database migration `002_superpowers.sql`

```sql
ALTER TABLE sessions ADD COLUMN active_story_id  TEXT;
ALTER TABLE sessions ADD COLUMN active_plan_path  TEXT;

CREATE TABLE IF NOT EXISTS stories (
  id              TEXT    PRIMARY KEY,
  file_path       TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  size            TEXT,
  status          TEXT    NOT NULL DEFAULT 'backlog',
  linked_spec_path TEXT,
  linked_plan_path TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path   TEXT    NOT NULL,
  task_index  INTEGER NOT NULL,
  task_title  TEXT    NOT NULL,
  files_json  TEXT,
  ts          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_steps (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path        TEXT    NOT NULL,
  task_index       INTEGER NOT NULL,
  step_index       INTEGER NOT NULL,
  step_label       TEXT    NOT NULL,
  state            TEXT    NOT NULL DEFAULT 'todo',
  completed_at     INTEGER,
  inferred_event_id INTEGER,
  ts               INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_path ON plan_tasks(plan_path);
CREATE INDEX IF NOT EXISTS idx_plan_steps_path ON plan_steps(plan_path, task_index);
CREATE INDEX IF NOT EXISTS idx_stories_status  ON stories(status);
```

---

## 14. Slash commands

All four files live under `plugin/commands/`. Each has YAML frontmatter with `description` and `allowed-tools` restricted to `Read` and `Bash` (curl to localhost only).

**`status.md`** — reads `~/.claude-control/runtime.json`, calls `GET /api/healthz` and `GET /api/sessions` (latest), prints: daemon status, port, session id, inferred phase, active story id.

**`open.md`** — reads `runtime.json` for port + token, prints `http://127.0.0.1:<port>/?token=<token>` for the user to click.

**`story.md`** — three sub-commands:
- `new <title>` → `POST /api/stories` → prints new story id + file path
- `list` → `GET /api/stories` → formatted table: id, title, size, status
- `size <id> <S|M|L>` → `PATCH /api/stories/:id` with `{ size }` → confirms

**`start.md`** — reads `GET /api/stories/:id`, constructs and returns a prompt expansion that loads the story content and instructs Claude to invoke the Superpowers brainstorming skill. Does not write any code or spec itself — feeds the story into the brainstorming flow.

---

## 15. Testing strategy

TDD: tests written before implementation code. All tests use `bun:test`.

### `@cc/shared`

| File | Scenarios |
|---|---|
| `plan.test.ts` | Valid plan, malformed checkboxes skipped, empty file, no tasks, multi-task, mixed `[ ]`/`[x]` |
| `story.test.ts` | Valid frontmatter, missing required fields rejected, extra fields ignored, body preserved |

### `@cc/server`

| File | Scenarios |
|---|---|
| `superpowers/parser.test.ts` | `parsePlan()` fixture strings; `parseSpec()` title extraction |
| `superpowers/diff.test.ts` | No changes, single step completed, multiple steps, task count mismatch |
| `superpowers/phase.test.ts` | Each signal type; forward-only constraint; null when no signal |
| `stories/service.test.ts` | CRUD ops against temp dir + in-memory SQLite; external file edit picked up by watcher |
| `ws/ws.test.ts` | Upgrade rejected without token; subscribe/unsubscribe; fan-out to correct topics only; pong response |
| `api/routes.test.ts` | Each route: 200 happy path, 401 without auth, 404 for missing resource, 400 for bad input |

### Integration

Extend existing `integration.test.ts`: plan file edit via `PostToolUse` hook → plan re-parsed → WS message delivered to subscribed client.

---

## 16. Success criteria

Phase 2 is complete when:

1. `bun test` passes across all packages with no failures.
2. `SuperpowersWatcher` detects a checkbox change in a plan file and the diff is reflected in `plan_steps` within 250ms.
3. A `StoryService` round-trip (create → update → list → archive) works against a real temp directory.
4. A WS client connected to `/ws` receives a `plan.changed` message after a plan file edit.
5. All REST routes return correct shapes (validated by route tests).
6. All four slash command files exist in `plugin/commands/` and are syntactically valid Claude Code command files.
7. `bun run biome check` reports no errors.
