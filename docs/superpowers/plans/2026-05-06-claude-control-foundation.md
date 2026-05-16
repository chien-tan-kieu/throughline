# Claude Control Foundation (Weeks 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire a working end-to-end foundation: Claude Code hook events fire shell scripts, reach a local Bun daemon via HTTP, get validated with Zod, persisted to SQLite, and return `{}` — proving the full stack before any feature logic is added.

**Architecture:** pnpm workspace with three packages (`@cc/shared`, `@cc/server`, `@cc/web` stub). The `plugin/` directory is a plain artifact (not a workspace package) containing shell scripts that forward hook events via `curl`. The Bun daemon is a singleton enforced by port binding; it writes `runtime.json` so the shell scripts can discover it.

**Tech Stack:** Bun 1.x (runtime, test runner, SQLite via `bun:sqlite`), pnpm (workspace), Zod 3.x (schema validation), Biome (lint + format), TypeScript (strict, no build step needed — Bun runs `.ts` directly).

**Reference spec:** `docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md`

---

## File Map

Files created or modified by this plan:

```
claude-control/
├── package.json                                   ← workspace root (Task 1)
├── pnpm-workspace.yaml                            ← workspace config (Task 1)
├── tsconfig.base.json                             ← shared TS config (Task 1)
├── biome.json                                     ← lint + format (Task 1)
├── packages/
│   ├── shared/
│   │   ├── package.json                           ← @cc/shared (Task 1)
│   │   └── src/
│   │       ├── events.ts                          ← 14 Zod event schemas (Task 2)
│   │       ├── api.ts                             ← REST/WS stubs (Task 2)
│   │       └── index.ts                           ← re-exports (Task 2)
│   ├── server/
│   │   ├── package.json                           ← @cc/server (Task 1)
│   │   ├── migrations/
│   │   │   └── 001_initial.sql                    ← sessions + events tables (Task 3)
│   │   └── src/
│   │       ├── bus.ts                             ← Bus interface + stubBus (Task 4)
│   │       ├── store/
│   │       │   ├── migrate.ts                     ← migration runner (Task 3)
│   │       │   └── index.ts                       ← persistEvent, upsertSession, endSession (Task 4)
│   │       ├── security/
│   │       │   └── index.ts                       ← checkAuth, RateLimiter (Task 5)
│   │       ├── hooks/
│   │       │   ├── index.ts                       ← handleHookEvent dispatcher (Task 6)
│   │       │   ├── handlers.ts                    ← per-event stubs, all return {} (Task 6)
│   │       │   └── __tests__/
│   │       │       └── observer-contract.test.ts  ← observer contract test (Task 6)
│   │       ├── server.ts                          ← createServer with onActivity + rateLimit (Task 7)
│   │       ├── lifecycle/
│   │       │   └── index.ts                       ← port range binding, runtime.json, idle timer (Task 8)
│   │       ├── index.ts                           ← entry point + startDaemon export (Task 8)
│   │       └── __tests__/
│   │           ├── server.test.ts                 ← HTTP server unit tests (Task 7)
│   │           ├── daemon.test.ts                 ← daemon + port fallback tests (Task 8)
│   │           └── integration.test.ts            ← full round-trip tests (Task 9)
│   └── web/
│       └── package.json                           ← @cc/web stub (Task 1)
├── packages/server/src/__tests__/
│   └── integration.test.ts                        ← full round-trip test (Task 9)
└── plugin/
    ├── .claude-plugin/
    │   └── plugin.json                            ← plugin metadata (Task 10)
    ├── hooks/
    │   ├── hooks.json                             ← all 14 command hooks (Task 10)
    │   ├── bootstrap.sh                           ← probe + spawn daemon (Task 10)
    │   └── forward.sh                             ← port discovery + curl forward (Task 10)
    ├── skills/
    │   └── claude-control/
    │       └── SKILL.md                           ← explains plugin to Claude (Task 10)
    └── README.md                                  ← plugin usage instructions (Task 10)
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `packages/shared/package.json`
- Create: `packages/server/package.json`
- Create: `packages/web/package.json`

No tests for pure config — this task ends with a successful `pnpm install`.

- [x] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "claude-control",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "cd packages/server && bun run --watch src/index.ts",
    "test": "pnpm -r test",
    "lint": "bunx biome check ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "typescript": "^5.7.0"
  }
}
```

- [x] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [x] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ESNext",
    "lib": ["ESNext"],
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

- [x] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignore": ["graphify-out/", "node_modules/", "dist/"]
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

- [x] **Step 5: Create `packages/shared/package.json`**

```json
{
  "name": "@cc/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "zod": "^3.25.0"
  }
}
```

- [x] **Step 6: Create `packages/server/package.json`**

```json
{
  "name": "@cc/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@cc/shared": "workspace:*"
  }
}
```

- [x] **Step 7: Create `packages/web/package.json`** (stub only)

```json
{
  "name": "@cc/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "echo 'no tests yet' && exit 0"
  }
}
```

- [x] **Step 8: Install dependencies**

```bash
cd /path/to/claude-control && pnpm install
```

Expected: lockfile created, `node_modules/@cc/shared` symlinked, no errors.

- [x] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json biome.json packages/
git commit -m "chore: scaffold pnpm workspace with shared, server, web packages"
```

---

## Task 2: `@cc/shared` — Zod event schemas

**Files:**
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/api.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/__tests__/events.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/events.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { HookEventSchema } from "../events.ts";

const base = {
  session_id: "sess-1",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  permission_mode: "default" as const,
};

describe("HookEventSchema discriminated union", () => {
  test("parses SessionStart", () => {
    const result = HookEventSchema.parse({ ...base, hook_event_name: "SessionStart" });
    expect(result.hook_event_name).toBe("SessionStart");
  });

  test("parses PreToolUse with required fields", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    expect(result.hook_event_name).toBe("PreToolUse");
  });

  test("parses SubagentStop with corrected field names", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "SubagentStop",
      agent_type: "general-purpose",
      subagent_id: "sub-abc",
      stop_reason: "completed",
      output: "done",
    });
    expect(result.hook_event_name).toBe("SubagentStop");
    if (result.hook_event_name === "SubagentStop") {
      expect(result.subagent_id).toBe("sub-abc");
      expect(result.output).toBe("done");
    }
  });

  test("parses InstructionsLoaded with memory_type enum", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "InstructionsLoaded",
      file_path: "/tmp/CLAUDE.md",
      memory_type: "Managed",
      load_reason: "startup",
    });
    expect(result.hook_event_name).toBe("InstructionsLoaded");
  });

  test("rejects unknown hook_event_name", () => {
    expect(() =>
      HookEventSchema.parse({ ...base, hook_event_name: "Unknown" })
    ).toThrow();
  });

  test("rejects invalid permission_mode", () => {
    expect(() =>
      HookEventSchema.parse({ ...base, hook_event_name: "SessionStart", permission_mode: "invalid" })
    ).toThrow();
  });

  test("all 14 event names parse without error", () => {
    const events: Array<[string, Record<string, unknown>]> = [
      ["SessionStart", {}],
      ["SessionEnd", {}],
      ["UserPromptSubmit", { prompt: "hello" }],
      ["UserPromptExpansion", {}],
      ["PreToolUse", { tool_name: "Bash", tool_input: {} }],
      ["PostToolUse", { tool_name: "Bash", tool_input: {}, tool_response: {} }],
      ["PostToolUseFailure", { tool_name: "Bash", tool_input: {}, error: "oops" }],
      ["SubagentStart", { agent_type: "general-purpose", prompt: "go", subagent_id: "s1", parent_session_id: "p1" }],
      ["SubagentStop", { agent_type: "general-purpose", subagent_id: "s1", stop_reason: "completed", output: "done" }],
      ["Stop", {}],
      ["Notification", { message: "hi" }],
      ["InstructionsLoaded", { file_path: "/tmp/f", memory_type: "Managed", load_reason: "startup" }],
      ["PreCompact", {}],
      ["PostCompact", {}],
    ];
    for (const [name, extra] of events) {
      expect(() =>
        HookEventSchema.parse({ ...base, hook_event_name: name, ...extra })
      ).not.toThrow();
    }
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/shared && bun test
```

Expected: `FAIL — Cannot find module '../events.ts'`

- [x] **Step 3: Create `packages/shared/src/events.ts`**

```typescript
import { z } from "zod";

const BaseHookSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.string(),
  permission_mode: z.enum([
    "default",
    "plan",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
  ]),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
});

const SessionStartSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SessionStart"),
  model: z.string().optional(),
});

const SessionEndSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SessionEnd"),
});

const UserPromptSubmitSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("UserPromptSubmit"),
  prompt: z.string(),
});

const UserPromptExpansionSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("UserPromptExpansion"),
  expansion: z.string().optional(),
});

const PreToolUseSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PreToolUse"),
  tool_name: z.string(),
  tool_input: z.unknown(),
});

const PostToolUseSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostToolUse"),
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_response: z.unknown(),
});

const PostToolUseFailureSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostToolUseFailure"),
  tool_name: z.string(),
  tool_input: z.unknown(),
  error: z.string(),
});

const SubagentStartSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SubagentStart"),
  agent_type: z.string(),
  prompt: z.string(),
  subagent_id: z.string(),
  parent_session_id: z.string(),
});

const SubagentStopSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SubagentStop"),
  agent_type: z.string(),
  subagent_id: z.string(),
  stop_reason: z.enum(["completed", "error", "user_interrupt"]),
  output: z.string(),
});

const StopSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("Stop"),
  stop_reason: z.string().optional(),
});

const NotificationSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("Notification"),
  message: z.string(),
  level: z.string().optional(),
});

const InstructionsLoadedSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("InstructionsLoaded"),
  file_path: z.string(),
  memory_type: z.enum(["Project", "User", "Local", "Managed"]),
  load_reason: z.string(),
  globs: z.array(z.string()).optional(),
  trigger_file_path: z.string().optional(),
  parent_file_path: z.string().optional(),
});

const PreCompactSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PreCompact"),
});

const PostCompactSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostCompact"),
});

export const HookEventSchema = z.discriminatedUnion("hook_event_name", [
  SessionStartSchema,
  SessionEndSchema,
  UserPromptSubmitSchema,
  UserPromptExpansionSchema,
  PreToolUseSchema,
  PostToolUseSchema,
  PostToolUseFailureSchema,
  SubagentStartSchema,
  SubagentStopSchema,
  StopSchema,
  NotificationSchema,
  InstructionsLoadedSchema,
  PreCompactSchema,
  PostCompactSchema,
]);

export type HookEvent = z.infer<typeof HookEventSchema>;
```

- [x] **Step 4: Create `packages/shared/src/api.ts`** (stubs for Weeks 5–6)

```typescript
// REST + WebSocket contract types — implemented in Weeks 5-6.
export type ApiStub = never;
```

- [x] **Step 5: Create `packages/shared/src/index.ts`**

```typescript
export { HookEventSchema, type HookEvent } from "./events.ts";
```

- [x] **Step 6: Run tests to confirm they pass**

```bash
cd packages/shared && bun test
```

Expected: `14 pass, 0 fail`

- [x] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add Zod discriminated union for all 14 hook event types"
```

---

## Task 3: SQLite migrations

**Files:**
- Create: `packages/server/migrations/001_initial.sql`
- Create: `packages/server/src/store/migrate.ts`
- Create: `packages/server/src/store/__tests__/migrate.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/server/src/store/__tests__/migrate.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../migrate.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("runMigrations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("creates sessions and events tables", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("sessions");
    expect(tables).toContain("events");
    expect(tables).toContain("_migrations");
  });

  test("running migrations twice is idempotent", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    await runMigrations(db, MIGRATIONS_DIR);

    const count = db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM _migrations")
      .get()!.c;

    expect(count).toBe(1); // only one migration file applied once
  });

  test("sessions table has expected columns", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(sessions)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("id");
    expect(cols).toContain("cwd");
    expect(cols).toContain("status");
    expect(cols).toContain("started_at");
    expect(cols).toContain("inferred_phase");
  });

  test("events table has expected columns", async () => {
    await runMigrations(db, MIGRATIONS_DIR);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(events)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("id");
    expect(cols).toContain("session_id");
    expect(cols).toContain("subagent_id");
    expect(cols).toContain("event_name");
    expect(cols).toContain("payload_json");
    expect(cols).toContain("ts");
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/store/__tests__/migrate.test.ts
```

Expected: `FAIL — Cannot find module '../migrate.ts'`

- [x] **Step 3: Create `packages/server/migrations/001_initial.sql`**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT    PRIMARY KEY,
  cwd             TEXT    NOT NULL,
  model           TEXT,
  agent_type      TEXT,
  permission_mode TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  status          TEXT    NOT NULL DEFAULT 'active',
  inferred_phase  TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT    NOT NULL,
  subagent_id  TEXT,
  event_name   TEXT    NOT NULL,
  payload_json TEXT    NOT NULL,
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name, ts);
```

- [x] **Step 4: Create `packages/server/src/store/migrate.ts`**

```typescript
import { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations(db: Database, migrationsDir: string): Promise<void> {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = db.query("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (already) continue;

    const sql = await readFile(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.run("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", [
      file,
      Date.now(),
    ]);
  }
}
```

- [x] **Step 5: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/store/__tests__/migrate.test.ts
```

Expected: `4 pass, 0 fail`

- [x] **Step 6: Commit**

```bash
git add packages/server/migrations/ packages/server/src/store/migrate.ts packages/server/src/store/__tests__/migrate.test.ts
git commit -m "feat(server): add SQLite migration runner and initial schema"
```

---

## Task 4: Store — `persistEvent`, session management

**Files:**
- Create: `packages/server/src/bus.ts`
- Create: `packages/server/src/store/index.ts`
- Create: `packages/server/src/store/__tests__/store.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/server/src/store/__tests__/store.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../migrate.ts";
import { endSession, persistEvent, upsertSession } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

const base = {
  session_id: "sess-store-1",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  hook_event_name: "SessionStart" as const,
  permission_mode: "default" as const,
};

describe("store", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  test("upsertSession creates a session row", () => {
    upsertSession(db, base);

    const row = db
      .query<{ id: string; status: string }, []>("SELECT id, status FROM sessions")
      .get();

    expect(row?.id).toBe("sess-store-1");
    expect(row?.status).toBe("active");
  });

  test("upsertSession is idempotent (ON CONFLICT DO NOTHING)", () => {
    upsertSession(db, base);
    upsertSession(db, base);

    const count = db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions")
      .get()!.c;

    expect(count).toBe(1);
  });

  test("persistEvent inserts event row with correct fields", () => {
    persistEvent(db, { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} });

    const row = db
      .query<{ session_id: string; event_name: string; payload_json: string }, []>(
        "SELECT session_id, event_name, payload_json FROM events"
      )
      .get();

    expect(row?.session_id).toBe("sess-store-1");
    expect(row?.event_name).toBe("PreToolUse");
    const payload = JSON.parse(row!.payload_json);
    expect(payload.tool_name).toBe("Bash");
  });

  test("persistEvent promotes subagent_id column for SubagentStop", () => {
    persistEvent(db, {
      ...base,
      hook_event_name: "SubagentStop",
      agent_type: "general-purpose",
      subagent_id: "sub-xyz",
      stop_reason: "completed",
      output: "done",
    });

    const row = db
      .query<{ subagent_id: string | null }, []>("SELECT subagent_id FROM events")
      .get();

    expect(row?.subagent_id).toBe("sub-xyz");
  });

  test("persistEvent sets subagent_id to null for non-subagent events", () => {
    persistEvent(db, base);

    const row = db
      .query<{ subagent_id: string | null }, []>("SELECT subagent_id FROM events")
      .get();

    expect(row?.subagent_id).toBeNull();
  });

  test("SessionEnd event sets sessions.status to 'ended'", () => {
    upsertSession(db, base);
    persistEvent(db, { ...base, hook_event_name: "SessionEnd" });

    const row = db
      .query<{ status: string; ended_at: number | null }, []>(
        "SELECT status, ended_at FROM sessions WHERE id = ?"
      )
      .get("sess-store-1");

    expect(row?.status).toBe("ended");
    expect(row?.ended_at).not.toBeNull();
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/store/__tests__/store.test.ts
```

Expected: `FAIL — Cannot find module '../index.ts'`

- [x] **Step 3: Create `packages/server/src/bus.ts`**

```typescript
import type { HookEvent } from "@cc/shared";

export interface Bus {
  publish(event: HookEvent): void;
}

export const stubBus: Bus = { publish: () => {} };
```

- [x] **Step 4: Create `packages/server/src/store/index.ts`**

```typescript
import { Database } from "bun:sqlite";
import type { HookEvent } from "@cc/shared";

export function upsertSession(db: Database, event: HookEvent): void {
  db.run(
    `INSERT INTO sessions (id, cwd, permission_mode, started_at, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(id) DO NOTHING`,
    [event.session_id, event.cwd, event.permission_mode, Date.now()]
  );
}

export function endSession(db: Database, sessionId: string): void {
  db.run(
    `UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`,
    [Date.now(), sessionId]
  );
}

export function persistEvent(db: Database, event: HookEvent): void {
  upsertSession(db, event);

  const subagentId =
    event.hook_event_name === "SubagentStart" || event.hook_event_name === "SubagentStop"
      ? event.subagent_id
      : null;

  db.run(
    `INSERT INTO events (session_id, subagent_id, event_name, payload_json, ts)
     VALUES (?, ?, ?, ?, ?)`,
    [event.session_id, subagentId, event.hook_event_name, JSON.stringify(event), Date.now()]
  );

  if (event.hook_event_name === "SessionEnd") {
    endSession(db, event.session_id);
  }
}
```

- [x] **Step 5: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/store/__tests__/store.test.ts
```

Expected: `6 pass, 0 fail`

- [x] **Step 6: Commit**

```bash
git add packages/server/src/bus.ts packages/server/src/store/
git commit -m "feat(server): add store with persistEvent and session lifecycle management"
```

---

## Task 5: Security gate — token auth, Host check, rate limiting

**Files:**
- Create: `packages/server/src/security/index.ts`
- Create: `packages/server/src/security/__tests__/security.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/server/src/security/__tests__/security.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { RateLimiter, checkAuth } from "../index.ts";

const PORT = 47821;
const TOKEN = "secret-token-abc";

function makeRequest(overrides: {
  host?: string;
  authorization?: string;
  url?: string;
}): Request {
  const headers = new Headers();
  headers.set("host", overrides.host ?? `127.0.0.1:${PORT}`);
  if (overrides.authorization !== undefined) {
    headers.set("authorization", overrides.authorization);
  }
  return new Request(overrides.url ?? `http://127.0.0.1:${PORT}/hooks/PreToolUse`, {
    method: "POST",
    headers,
  });
}

describe("checkAuth", () => {
  test("returns null for valid host and token", () => {
    const req = makeRequest({ authorization: `Bearer ${TOKEN}` });
    expect(checkAuth(req, PORT, TOKEN)).toBeNull();
  });

  test("returns null for localhost host header", () => {
    const req = makeRequest({ host: `localhost:${PORT}`, authorization: `Bearer ${TOKEN}` });
    expect(checkAuth(req, PORT, TOKEN)).toBeNull();
  });

  test("returns 401 when Authorization header is missing", () => {
    const req = makeRequest({});
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(401);
  });

  test("returns 401 when token is wrong", () => {
    const req = makeRequest({ authorization: "Bearer wrong" });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(401);
  });

  test("returns 403 when Host is not localhost/127.0.0.1", () => {
    const req = makeRequest({ host: "evil.example.com", authorization: `Bearer ${TOKEN}` });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(403);
  });

  test("returns 403 when Host header is missing", () => {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${TOKEN}`);
    const req = new Request(`http://127.0.0.1:${PORT}/hooks/PreToolUse`, {
      method: "POST",
      headers,
    });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(403);
  });
});

describe("RateLimiter", () => {
  test("allows requests under limit", () => {
    const rl = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(rl.allow("sess-1")).toBe(true);
    }
  });

  test("blocks requests over limit", () => {
    const rl = new RateLimiter(3, 60_000);
    rl.allow("sess-1");
    rl.allow("sess-1");
    rl.allow("sess-1");
    expect(rl.allow("sess-1")).toBe(false);
  });

  test("tracks different sessions independently", () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.allow("sess-a")).toBe(true);
    expect(rl.allow("sess-b")).toBe(true);
    expect(rl.allow("sess-a")).toBe(false);
    expect(rl.allow("sess-b")).toBe(false);
  });

  test("resets after window expires", async () => {
    const rl = new RateLimiter(1, 10); // 10ms window
    rl.allow("sess-1");
    await new Promise((r) => setTimeout(r, 20));
    expect(rl.allow("sess-1")).toBe(true);
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/security/__tests__/security.test.ts
```

Expected: `FAIL — Cannot find module '../index.ts'`

- [x] **Step 3: Create `packages/server/src/security/index.ts`**

```typescript
interface WindowCount {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowCount>();

  constructor(
    private readonly limit = 1000,
    private readonly windowMs = 60_000
  ) {}

  allow(sessionId: string): boolean {
    const now = Date.now();
    const w = this.windows.get(sessionId);
    if (!w || now - w.windowStart > this.windowMs) {
      this.windows.set(sessionId, { count: 1, windowStart: now });
      return true;
    }
    w.count++;
    return w.count <= this.limit;
  }
}

export function checkAuth(req: Request, serverPort: number, token: string): Response | null {
  const host = req.headers.get("host") ?? "";
  const validHosts = [
    `127.0.0.1:${serverPort}`,
    `localhost:${serverPort}`,
    "127.0.0.1",
    "localhost",
  ];
  if (!validHosts.includes(host)) {
    return new Response("Forbidden", { status: 403 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/security/__tests__/security.test.ts
```

Expected: `10 pass, 0 fail`

- [x] **Step 5: Commit**

```bash
git add packages/server/src/security/
git commit -m "feat(server): add security gate with token auth, Host validation, and rate limiter"
```

---

## Task 6: Hook handlers — observer contract

**Files:**
- Create: `packages/server/src/hooks/handlers.ts`
- Create: `packages/server/src/hooks/index.ts`
- Create: `packages/server/src/hooks/__tests__/observer-contract.test.ts`

This task has two tests:
1. The observer contract: every event name → handler returns exactly `{}`
2. A malformed payload returns 400

- [x] **Step 1: Write the failing observer contract test**

Create `packages/server/src/hooks/__tests__/observer-contract.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { stubBus } from "../../bus.ts";
import { handleHookEvent } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../migrations");

const ALL_EVENTS: Array<[string, Record<string, unknown>]> = [
  ["SessionStart", {}],
  ["SessionEnd", {}],
  ["UserPromptSubmit", { prompt: "hello" }],
  ["UserPromptExpansion", {}],
  ["PreToolUse", { tool_name: "Bash", tool_input: {} }],
  ["PostToolUse", { tool_name: "Bash", tool_input: {}, tool_response: {} }],
  ["PostToolUseFailure", { tool_name: "Bash", tool_input: {}, error: "oops" }],
  ["SubagentStart", { agent_type: "general-purpose", prompt: "go", subagent_id: "s1", parent_session_id: "p1" }],
  ["SubagentStop", { agent_type: "general-purpose", subagent_id: "s1", stop_reason: "completed", output: "done" }],
  ["Stop", {}],
  ["Notification", { message: "hi" }],
  ["InstructionsLoaded", { file_path: "/tmp/f", memory_type: "Managed", load_reason: "startup" }],
  ["PreCompact", {}],
  ["PostCompact", {}],
];

const basePayload = {
  session_id: "observer-test-sess",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  permission_mode: "default",
};

describe("observer contract — every handler returns exactly {}", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  for (const [eventName, extra] of ALL_EVENTS) {
    test(`${eventName} handler returns 200 with body '{}'`, async () => {
      const payload = { ...basePayload, hook_event_name: eventName, ...extra };
      const res = await handleHookEvent(eventName, payload, db, stubBus);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("{}");
    });
  }
});

describe("handleHookEvent error cases", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  test("malformed payload returns 400", async () => {
    const res = await handleHookEvent("PreToolUse", { not_valid: true }, db, stubBus);
    expect(res.status).toBe(400);
  });

  test("unknown event name returns 400", async () => {
    const res = await handleHookEvent(
      "NotAnEvent",
      { ...basePayload, hook_event_name: "NotAnEvent" },
      db,
      stubBus
    );
    expect(res.status).toBe(400);
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/hooks/__tests__/observer-contract.test.ts
```

Expected: `FAIL — Cannot find module '../index.ts'`

- [x] **Step 3: Create `packages/server/src/hooks/handlers.ts`**

```typescript
import type { HookEvent } from "@cc/shared";
import type { Database } from "bun:sqlite";
import type { Bus } from "../bus.ts";
import { persistEvent } from "../store/index.ts";

export async function dispatchEvent(
  event: HookEvent,
  db: Database,
  bus: Bus
): Promise<Response> {
  persistEvent(db, event);
  bus.publish(event);
  return new Response("{}", { status: 200 });
}
```

- [x] **Step 4: Create `packages/server/src/hooks/index.ts`**

```typescript
import { HookEventSchema, type HookEvent } from "@cc/shared";
import type { Database } from "bun:sqlite";
import type { Bus } from "../bus.ts";
import { dispatchEvent } from "./handlers.ts";

export async function handleHookEvent(
  _eventName: string,
  body: unknown,
  db: Database,
  bus: Bus
): Promise<Response> {
  let event: HookEvent;
  try {
    event = HookEventSchema.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return dispatchEvent(event, db, bus);
}
```

- [x] **Step 5: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/hooks/__tests__/observer-contract.test.ts
```

Expected: `16 pass, 0 fail`

- [x] **Step 6: Commit**

```bash
git add packages/server/src/hooks/
git commit -m "feat(server): add hook handlers with observer contract (all events return {})"
```

---

## Task 7: HTTP server — route table

**Files:**
- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/__tests__/server.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/server.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../store/migrate.ts";
import { stubBus } from "../bus.ts";
import { createServer } from "../server.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations");
const TOKEN = "test-server-token";

describe("HTTP server", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    server = createServer({ port: 0, token: TOKEN, db, bus: stubBus });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
    db.close();
  });

  test("GET /api/healthz returns {status: ok} without auth", async () => {
    const res = await fetch(`${base}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("POST /hooks/PreToolUse with valid auth returns {}", async () => {
    const res = await fetch(`${base}/hooks/PreToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "srv-test-sess",
        transcript_path: "/tmp/t.json",
        cwd: "/tmp",
        hook_event_name: "PreToolUse",
        permission_mode: "default",
        tool_name: "Bash",
        tool_input: {},
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
  });

  test("POST /hooks/PreToolUse without auth returns 401", async () => {
    const res = await fetch(`${base}/hooks/PreToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${server.port}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/sessions returns 501 (stub)", async () => {
    const res = await fetch(`${base}/api/sessions`, {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(res.status).toBe(501);
  });

  test("unknown route returns 404", async () => {
    const res = await fetch(`${base}/not-a-route`, {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(res.status).toBe(404);
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/__tests__/server.test.ts
```

Expected: `FAIL — Cannot find module '../server.ts'`

- [x] **Step 3: Create `packages/server/src/server.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import type { Bus } from "./bus.ts";
import { handleHookEvent } from "./hooks/index.ts";
import { RateLimiter, checkAuth } from "./security/index.ts";

export interface ServerConfig {
  port: number;
  token: string;
  db: Database;
  bus: Bus;
  onActivity?: () => void;
  rateLimit?: { limit: number; windowMs: number };
}

export function createServer(config: ServerConfig): Server {
  const { token, db, bus } = config;
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit.limit, config.rateLimit.windowMs)
    : new RateLimiter();

  return Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/healthz") {
        return Response.json({ status: "ok" });
      }

      const authError = checkAuth(req, server.port, token);
      if (authError) return authError;

      const hookMatch = url.pathname.match(/^\/hooks\/(\w+)$/);
      if (req.method === "POST" && hookMatch) {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sessionId = (body as Record<string, unknown>)?.session_id as string | undefined;
        if (sessionId && !rateLimiter.allow(sessionId)) {
          return new Response("{}", { status: 200 });
        }

        config.onActivity?.();
        return handleHookEvent(hookMatch[1], body, db, bus);
      }

      if (url.pathname.startsWith("/api/")) {
        return new Response("{}", { status: 501 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/__tests__/server.test.ts
```

Expected: `6 pass, 0 fail`

- [x] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/__tests__/server.test.ts
git commit -m "feat(server): add HTTP server with route table, auth gate, and 501 stubs"
```

---

## Task 8: Daemon entry point and lifecycle

**Files:**
- Create: `packages/server/src/lifecycle/index.ts`
- Create: `packages/server/src/index.ts`

`index.ts` exports `startDaemon` (used by the integration test and `bootstrap.sh`). The main entry path (`bun run src/index.ts`) calls `startDaemon` and sets up SIGTERM + idle timer.

- [x] **Step 1: Write a failing smoke test for `startDaemon`**

Create `packages/server/src/__tests__/daemon.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDaemon, type DaemonHandle } from "../index.ts";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("startDaemon", () => {
  let handle: DaemonHandle;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = join(tmpdir(), `cc-test-${Date.now()}`);
    handle = await startDaemon({ port: 0, dataDir });
  });

  afterAll(async () => {
    await handle.stop();
  });

  test("server responds to healthz", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("writes runtime.json to dataDir", () => {
    const runtimePath = join(dataDir, "runtime.json");
    expect(existsSync(runtimePath)).toBe(true);

    const runtime = JSON.parse(readFileSync(runtimePath, "utf-8"));
    expect(runtime.port).toBe(handle.port);
    expect(typeof runtime.token).toBe("string");
    expect(runtime.token.length).toBeGreaterThan(0);
    expect(runtime.pid).toBe(process.pid);
  });

  test("token from runtime.json matches handle.token", () => {
    const runtimePath = join(dataDir, "runtime.json");
    const runtime = JSON.parse(readFileSync(runtimePath, "utf-8"));
    expect(runtime.token).toBe(handle.token);
  });
});

describe("port range fallback", () => {
  test("binds to next port when preferred port is in use", async () => {
    // Occupy 47821 so the daemon must fall back to 47822+
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 47821,
      fetch: () => new Response("busy"),
    });
    const occupiedPort = occupied.port;

    try {
      const dataDir2 = join(tmpdir(), `cc-fallback-${Date.now()}`);
      const handle2 = await startDaemon({ dataDir: dataDir2 }); // no port → tries range
      expect(handle2.port).toBeGreaterThan(occupiedPort);
      expect(handle2.port).toBeLessThanOrEqual(47830);
      await handle2.stop();
    } finally {
      occupied.stop(true);
    }
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/__tests__/daemon.test.ts
```

Expected: `FAIL — Cannot find module '../index.ts'`

- [x] **Step 3: Create `packages/server/src/lifecycle/index.ts`**

```typescript
import { Database } from "bun:sqlite";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "bun";

export interface RuntimeJson {
  port: number;
  token: string;
  pid: number;
  started_at: string;
  version: string;
}

export async function writeRuntimeJson(
  dataDir: string,
  data: RuntimeJson
): Promise<void> {
  const path = join(dataDir, "runtime.json");
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function startIdleTimer(
  server: Server,
  db: Database,
  idleMs = 4 * 60 * 60 * 1000
): { reset: () => void; cancel: () => void } {
  let timer = setTimeout(shutdown, idleMs);

  function shutdown() {
    db.close();
    server.stop(true);
    process.exit(0);
  }

  return {
    reset() {
      clearTimeout(timer);
      timer = setTimeout(shutdown, idleMs);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}

export function registerShutdownHandler(
  server: Server,
  db: Database,
  cancelIdle: () => void
): void {
  process.once("SIGTERM", () => {
    cancelIdle();
    db.close();
    server.stop(true);
    process.exit(0);
  });
}
```

- [x] **Step 4: Create `packages/server/src/index.ts`**

```typescript
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stubBus } from "./bus.ts";
import {
  registerShutdownHandler,
  startIdleTimer,
  writeRuntimeJson,
} from "./lifecycle/index.ts";
import { createServer } from "./server.ts";
import { runMigrations } from "./store/migrate.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");
const VERSION = "0.1.0";

export interface DaemonOptions {
  port?: number;
  dataDir?: string;
  rateLimit?: { limit: number; windowMs: number };
}

export interface DaemonHandle {
  port: number;
  token: string;
  db: Database;
  stop: () => Promise<void>;
}

export async function startDaemon(
  options: DaemonOptions = {},
): Promise<DaemonHandle> {
  const dataDir =
    options.dataDir ??
    process.env.CLAUDE_PLUGIN_DATA ??
    join(process.env.HOME ?? "/tmp", ".claude-control");
  await mkdir(dataDir, { recursive: true });

  const db = new Database(join(dataDir, "claude-control.db"));
  await runMigrations(db, MIGRATIONS_DIR);

  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("hex");

  // onActivity ref: wired to idleTimer.reset after timer is created
  const activityRef = { fn: () => {} };

  // Port range binding: when no port given, try 47821–47830
  const useRange = options.port === undefined;
  const startPort = options.port ?? 47821;
  const endPort = useRange ? 47830 : startPort;

  let server: import("bun").Server | undefined;
  for (let port = startPort; port <= endPort; port++) {
    try {
      server = createServer({
        port,
        token,
        db,
        bus: stubBus,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit,
      });
      break;
    } catch {
      if (port === endPort) {
        process.stderr.write(
          `Claude Control: could not bind to any port in ${startPort}–${endPort}\n`,
        );
        process.exit(1);
      }
    }
  }

  if (!server) throw new Error("Failed to bind server (unreachable)");

  const idleTimer = startIdleTimer(server, db);
  activityRef.fn = idleTimer.reset;
  registerShutdownHandler(server, db, idleTimer.cancel);

  await writeRuntimeJson(dataDir, {
    port: server.port,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
    version: VERSION,
  });

  const bound = server;
  return {
    port: server.port,
    token,
    db,
    stop: async () => {
      idleTimer.cancel();
      db.close();
      bound.stop(true);
    },
  };
}

// Run directly: bun run src/index.ts
if (import.meta.main) {
  await startDaemon();
  console.log("Claude Control daemon started.");
}
```

- [x] **Step 5: Run tests to confirm they pass**

```bash
cd packages/server && bun test src/__tests__/daemon.test.ts
```

Expected: `4 pass, 0 fail` (3 startDaemon tests + 1 port fallback test)

- [x] **Step 6: Commit**

```bash
git add packages/server/src/lifecycle/ packages/server/src/index.ts packages/server/src/__tests__/daemon.test.ts
git commit -m "feat(server): add daemon lifecycle with port range binding, runtime.json, and idle timer"
```

---

## Task 9: Integration test — full round-trip

**Files:**
- Create: `packages/server/src/__tests__/integration.test.ts`

- [x] **Step 1: Write the integration test**

Create `packages/server/src/__tests__/integration.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDaemon, type DaemonHandle } from "../index.ts";

describe("full hook round-trip", () => {
  let daemon: DaemonHandle;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-integration-${Date.now()}`);
    daemon = await startDaemon({ port: 0, dataDir });
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("POST PreToolUse → 200 {} and event row in SQLite", async () => {
    const payload = {
      session_id: "integration-sess-1",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp/project",
      hook_event_name: "PreToolUse",
      permission_mode: "default",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    };

    const res = await fetch(
      `http://127.0.0.1:${daemon.port}/hooks/PreToolUse`,
      {
        method: "POST",
        headers: {
          Host: `127.0.0.1:${daemon.port}`,
          Authorization: `Bearer ${daemon.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");

    const events = daemon.db
      .query<{ event_name: string; session_id: string }, []>(
        "SELECT event_name, session_id FROM events"
      )
      .all();

    expect(events).toHaveLength(1);
    expect(events[0].event_name).toBe("PreToolUse");
    expect(events[0].session_id).toBe("integration-sess-1");
  });

  test("SessionEnd sets session status to ended", async () => {
    const base = {
      session_id: "integration-sess-2",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp/project",
      permission_mode: "default",
    };

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/SessionStart`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...base, hook_event_name: "SessionStart" }),
    });

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/SessionEnd`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...base, hook_event_name: "SessionEnd" }),
    });

    const session = daemon.db
      .query<{ status: string }, []>(
        "SELECT status FROM sessions WHERE id = 'integration-sess-2'"
      )
      .get();

    expect(session?.status).toBe("ended");
  });

});

describe("rate limiting integration", () => {
  let daemon: DaemonHandle;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-ratelimit-${Date.now()}`);
    // Cap at 1 event per session per minute so second request is silently dropped
    daemon = await startDaemon({ port: 0, dataDir, rateLimit: { limit: 1, windowMs: 60_000 } });
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("second event from same session returns 200 but is not persisted", async () => {
    const payload = {
      session_id: "ratelimit-sess-1",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp",
      hook_event_name: "Stop",
      permission_mode: "default",
    };
    const headers = {
      Host: `127.0.0.1:${daemon.port}`,
      Authorization: `Bearer ${daemon.token}`,
      "Content-Type": "application/json",
    };

    const res1 = await fetch(`http://127.0.0.1:${daemon.port}/hooks/Stop`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);
    expect(await res1.text()).toBe("{}");

    const res2 = await fetch(`http://127.0.0.1:${daemon.port}/hooks/Stop`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe("{}");

    const count = daemon.db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM events")
      .get()!.c;
    expect(count).toBe(1); // second request was silently dropped
  });
});
```

- [x] **Step 2: Run the integration test**

```bash
cd packages/server && bun test src/__tests__/integration.test.ts
```

Expected: `3 pass, 0 fail`

- [x] **Step 3: Run the full server test suite to confirm nothing broke**

```bash
cd packages/server && bun test
```

Expected: all tests pass (observer contract × 14 + error cases × 2 + store × 6 + migrate × 4 + security × 10 + server × 6 + daemon × 4 + integration × 3 + rate-limit integration × 1 = ~50 pass, 0 fail)

- [x] **Step 4: Commit**

```bash
git add packages/server/src/__tests__/integration.test.ts
git commit -m "test(server): add integration test for full hook round-trip and session lifecycle"
```

---

## Task 10: Plugin scaffold

**Files:**
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/hooks/bootstrap.sh`
- Create: `plugin/hooks/forward.sh`
- Create: `plugin/skills/claude-control/SKILL.md`
- Create: `plugin/README.md`

No automated tests — the smoke test is manual (step 7).

- [x] **Step 1: Create `plugin/.claude-plugin/plugin.json`**

```json
{
  "name": "claude-control",
  "description": "Workflow visualizer for Claude Code + Superpowers. Observer-only.",
  "version": "0.1.0",
  "author": { "name": "claude-control contributors" },
  "license": "MIT"
}
```

- [x] **Step 2: Create `plugin/hooks/hooks.json`**

```json
{
  "hooks": {
    "SessionStart":        [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/bootstrap.sh" }] }],
    "PreToolUse":          [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "PostToolUse":         [{ "matcher": "*", "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "PostToolUseFailure":  [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "SubagentStart":       [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "SubagentStop":        [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "Stop":                [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "SessionEnd":          [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "Notification":        [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "UserPromptSubmit":    [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "UserPromptExpansion": [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "InstructionsLoaded":  [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }],
    "PreCompact":          [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh" }] }],
    "PostCompact":         [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PLUGIN_ROOT/hooks/forward.sh", "async": true }] }]
  }
}
```

- [x] **Step 3: Create `plugin/hooks/forward.sh`** then make executable

```bash
#!/bin/bash
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

```bash
chmod +x plugin/hooks/forward.sh
```

- [x] **Step 4: Create `plugin/hooks/bootstrap.sh`** then make executable

```bash
#!/bin/bash
RUNTIME="${CLAUDE_PLUGIN_DATA}/runtime.json"
LOG="${CLAUDE_PLUGIN_DATA}/daemon.log"
mkdir -p "$CLAUDE_PLUGIN_DATA"

probe() { curl -sf --max-time 2 "http://127.0.0.1:$1/api/healthz" > /dev/null 2>&1; }

if [ -f "$RUNTIME" ]; then
  PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null)
  if probe "$PORT"; then
    echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control is observing this session. This plugin only observes — it never blocks tool calls."}}'
    exit 0
  fi
fi

if [ -f "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" ]; then
  bun run "$CLAUDE_PLUGIN_ROOT/../packages/server/src/index.ts" >> "$LOG" 2>&1 &
else
  "$CLAUDE_PLUGIN_ROOT/bin/cc-daemon" >> "$LOG" 2>&1 &
fi

for i in $(seq 1 30); do
  sleep 0.1
  if [ -f "$RUNTIME" ]; then
    PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null) && probe "$PORT" && \
      echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Claude Control started."}}' && exit 0
  fi
done

exit 0
```

```bash
chmod +x plugin/hooks/bootstrap.sh
```

- [x] **Step 5: Create `plugin/skills/claude-control/SKILL.md`**

```markdown
# claude-control

This session is being observed by the Claude Control plugin.

Claude Control records hook events (tool use, session start/end, subagent lifecycle) to a local SQLite database. It **never blocks tool calls or modifies responses** — it is observer-only.

No action is required from you. The daemon runs silently in the background.
```

- [x] **Step 6: Create `plugin/README.md`**

```markdown
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
```

- [x] **Step 7: Manual smoke test**

Open a new terminal in the repo root and run:

```bash
claude --plugin-dir ./plugin
```

Then type any message. Check the daemon log:

```bash
tail -f "${CLAUDE_PLUGIN_DATA:-$HOME/.claude-control}/daemon.log"
```

Expected: daemon starts, events appear in log, Claude continues responding normally.

Verify events were stored:

```bash
DB="${CLAUDE_PLUGIN_DATA:-$HOME/.claude-control}/claude-control.db"
bun -e "const {Database} = require('bun:sqlite'); const db = new Database('$DB'); console.log(db.query('SELECT event_name, ts FROM events ORDER BY ts DESC LIMIT 10').all())"
```

Expected: rows showing `SessionStart`, `UserPromptSubmit`, `PreToolUse`, etc.

- [x] **Step 8: Commit**

```bash
git add plugin/
git commit -m "feat(plugin): add plugin scaffold with bootstrap.sh, forward.sh, and hooks.json"
```

---

## Final verification

Run the full test suite from the repo root:

```bash
pnpm test
```

Expected: all packages report pass, 0 fail.

Run lint:

```bash
bunx biome check .
```

Expected: no errors.

---

## Success criteria (from spec)

- [x] `claude --plugin-dir ./plugin` starts a session, bootstrap.sh spawns the daemon
- [x] Every hook event is received, validated, persisted, and returns `{}`
- [x] Observer contract test is green: no handler can ever return a decision field
- [x] Full round-trip integration test passes: POST → `{}` response + event row in SQLite
