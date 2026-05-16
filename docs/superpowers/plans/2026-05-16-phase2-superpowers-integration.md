# Phase 2: Superpowers Integration + Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the daemon to Superpowers plan/spec files, add story CRUD, WebSocket fan-out, REST API routes, and four slash commands.

**Architecture:** Service classes (`SuperpowersWatcher`, `StoryService`, `WsServer`) are instantiated in `startDaemon`, wired through an upgraded `Bus` that supports `subscribe()`, and exposed via new REST routes and a WebSocket endpoint on the existing Bun HTTP server. Shared types live in `@cc/shared`; all services live in `@cc/server`.

**Tech Stack:** Bun runtime, TypeScript strict mode, `bun:test`, `bun:sqlite`, `node:fs` (watch/readFile/writeFile), Zod (already in `@cc/shared`), Biome linter.

---

## File Map

**Create (new files):**
- `packages/shared/src/plan.ts` — `ParsedPlan`, `PlanTask`, `PlanStep` types + `parsePlan()`
- `packages/shared/src/story.ts` — `StoryFrontmatter`, `Story`, `StoryDetail`, `StoryPatch` types + `parseFrontmatter()`
- `packages/shared/src/api.ts` — `Phase`, `Session`, `EventRecord`, `WSOut` and other contract types
- `packages/shared/src/__tests__/plan.test.ts`
- `packages/shared/src/__tests__/story.test.ts`
- `packages/server/migrations/002_superpowers.sql`
- `packages/server/src/superpowers/parser.ts` — re-exports `parsePlan`, adds `parseSpec()`
- `packages/server/src/superpowers/diff.ts` — `diffCheckboxState()`
- `packages/server/src/superpowers/phase.ts` — `inferPhase()`, `advancePhase()`
- `packages/server/src/superpowers/index.ts` — `SuperpowersWatcher` class
- `packages/server/src/superpowers/__tests__/parser.test.ts`
- `packages/server/src/superpowers/__tests__/diff.test.ts`
- `packages/server/src/superpowers/__tests__/phase.test.ts`
- `packages/server/src/superpowers/__tests__/watcher.test.ts`
- `packages/server/src/stories/template.ts` — `scaffoldStory()`
- `packages/server/src/stories/index.ts` — `StoryService` class
- `packages/server/src/stories/__tests__/service.test.ts`
- `packages/server/src/ws/index.ts` — `WsServer` class + `WsData` type
- `packages/server/src/ws/__tests__/ws.test.ts`
- `packages/server/src/api/index.ts` — `mountApiRoutes()`, `ApiCtx`
- `packages/server/src/api/sessions.ts`
- `packages/server/src/api/stories.ts`
- `packages/server/src/api/superpowers.ts`
- `packages/server/src/api/__tests__/routes.test.ts`
- `plugin/commands/status.md`
- `plugin/commands/open.md`
- `plugin/commands/story.md`
- `plugin/commands/start.md`

**Modify (existing files):**
- `packages/shared/src/index.ts` — re-export plan, story, api modules
- `packages/server/src/bus.ts` — add `BusEvent` union, `subscribe()` to `Bus`, `createBus()` factory
- `packages/server/src/hooks/handlers.ts` — wrap HookEvent in `{ type: "hook", data }` before publishing
- `packages/server/src/server.ts` — add `/ws` upgrade, route `/api/*` to `mountApiRoutes`, add `websocket:` handlers, accept optional `wsServer` + `apiCtx` in config
- `packages/server/src/index.ts` — use `createBus()`, add `cwd` option, instantiate and wire services

---

### Task 1: `@cc/shared/plan.ts` — types + parsePlan

**Files:**
- Create: `packages/shared/src/plan.ts`
- Create: `packages/shared/src/__tests__/plan.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/plan.test.ts
import { describe, expect, test } from "bun:test";
import { parsePlan } from "../plan.ts";

describe("parsePlan", () => {
  test("extracts title and single task with files and steps", () => {
    const content = `# My Feature Plan

### Task 1: Setup

**Files:**
- src/index.ts
- src/utils.ts

- [ ] Write tests
- [x] Create file
`;
    const result = parsePlan(content, "plans/feature.md");
    expect(result.title).toBe("My Feature Plan");
    expect(result.path).toBe("plans/feature.md");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].index).toBe(1);
    expect(result.tasks[0].title).toBe("Setup");
    expect(result.tasks[0].files).toEqual(["src/index.ts", "src/utils.ts"]);
    expect(result.tasks[0].steps).toHaveLength(2);
    expect(result.tasks[0].steps[0]).toEqual({ index: 1, label: "Write tests", state: "todo" });
    expect(result.tasks[0].steps[1]).toEqual({ index: 2, label: "Create file", state: "done" });
  });

  test("returns empty title and tasks for empty string", () => {
    const result = parsePlan("", "empty.md");
    expect(result.title).toBe("");
    expect(result.tasks).toHaveLength(0);
  });

  test("skips malformed checkboxes", () => {
    const content = `# Plan\n\n### Task 1: Work\n\n- [?] invalid\n- [ ] valid step\n`;
    const result = parsePlan(content, "plan.md");
    expect(result.tasks[0].steps).toHaveLength(1);
    expect(result.tasks[0].steps[0].label).toBe("valid step");
  });

  test("handles multiple tasks with mixed checkbox state", () => {
    const content = `# Multi

### Task 1: First

- [x] Done step
- [ ] Todo step

### Task 2: Second

- [ ] Another step`;
    const result = parsePlan(content, "multi.md");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].steps[0].state).toBe("done");
    expect(result.tasks[0].steps[1].state).toBe("todo");
    expect(result.tasks[1].index).toBe(2);
    expect(result.tasks[1].steps[0].state).toBe("todo");
  });

  test("returns no tasks when content has no task headers", () => {
    const result = parsePlan("# Plan with no tasks\n\nSome intro text.", "plan.md");
    expect(result.title).toBe("Plan with no tasks");
    expect(result.tasks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && bun test src/__tests__/plan.test.ts
```
Expected: FAIL — `parsePlan` not found / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/shared/src/plan.ts
export interface PlanStep {
  index: number;
  label: string;
  state: "todo" | "done";
}

export interface PlanTask {
  index: number;
  title: string;
  files: string[];
  steps: PlanStep[];
}

export interface ParsedPlan {
  path: string;
  title: string;
  tasks: PlanTask[];
}

export function parsePlan(content: string, path: string): ParsedPlan {
  const lines = content.split("\n");
  let title = "";
  const tasks: PlanTask[] = [];
  let currentTask: PlanTask | null = null;
  let inFilesBlock = false;

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }

    const taskMatch = line.match(/^### Task (\d+):\s*(.+)/);
    if (taskMatch) {
      currentTask = {
        index: parseInt(taskMatch[1], 10),
        title: taskMatch[2].trim(),
        files: [],
        steps: [],
      };
      tasks.push(currentTask);
      inFilesBlock = false;
      continue;
    }

    if (!currentTask) continue;

    if (line.trim() === "**Files:**") {
      inFilesBlock = true;
      continue;
    }

    if (inFilesBlock) {
      if (line.trim() === "") {
        inFilesBlock = false;
        continue;
      }
      if (line.startsWith("- ")) {
        currentTask.files.push(line.slice(2).trim());
        continue;
      }
    }

    const todoMatch = line.match(/^- \[ \] (.+)/);
    if (todoMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: todoMatch[1].trim(),
        state: "todo",
      });
      continue;
    }

    const doneMatch = line.match(/^- \[x\] (.+)/i);
    if (doneMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: doneMatch[1].trim(),
        state: "done",
      });
    }
  }

  return { path, title, tasks };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && bun test src/__tests__/plan.test.ts
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/plan.ts packages/shared/src/__tests__/plan.test.ts
git commit -m "feat(shared): add ParsedPlan types and parsePlan state machine"
```

---

### Task 2: `@cc/shared/story.ts` — types + parseFrontmatter

**Files:**
- Create: `packages/shared/src/story.ts`
- Create: `packages/shared/src/__tests__/story.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/story.test.ts
import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../story.ts";

describe("parseFrontmatter", () => {
  test("parses all required fields from valid frontmatter", () => {
    const content = `---
id: US-2026-05-13-oauth-login
title: Add OAuth login
status: in-progress
created: 2026-05-13
---

## Story

As a user...`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("US-2026-05-13-oauth-login");
    expect(result?.title).toBe("Add OAuth login");
    expect(result?.status).toBe("in-progress");
    expect(result?.created).toBe("2026-05-13");
  });

  test("parses optional fields when present", () => {
    const content = `---
id: US-2026-05-13-oauth
title: OAuth
status: backlog
created: 2026-05-13
size: M
linked_spec: docs/superpowers/specs/oauth.md
linked_plan: docs/superpowers/plans/oauth.md
---
`;
    const result = parseFrontmatter(content);
    expect(result?.size).toBe("M");
    expect(result?.linked_spec).toBe("docs/superpowers/specs/oauth.md");
    expect(result?.linked_plan).toBe("docs/superpowers/plans/oauth.md");
  });

  test("returns null when required field is missing", () => {
    const content = `---
id: US-2026-05-13-oauth
title: OAuth
status: backlog
---
`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  test("returns null when no frontmatter delimiters found", () => {
    expect(parseFrontmatter("No frontmatter here.")).toBeNull();
  });

  test("ignores extra unknown fields", () => {
    const content = `---
id: US-2026-05-13-test
title: Test
status: backlog
created: 2026-05-13
unknown_field: ignored
---
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("US-2026-05-13-test");
  });

  test("preserves body after second --- delimiter", () => {
    const content = `---
id: US-2026-05-13-test
title: Test
status: backlog
created: 2026-05-13
---

## Story

Some body content here.`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && bun test src/__tests__/story.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/shared/src/story.ts
import { z } from "zod";

const StoryFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  created: z.string(),
  size: z.string().optional(),
  linked_spec: z.string().optional(),
  linked_plan: z.string().optional(),
});

export type StoryFrontmatter = z.infer<typeof StoryFrontmatterSchema>;

export interface Story {
  id: string;
  file_path: string;
  title: string;
  size: string | null;
  status: string;
  linked_spec_path: string | null;
  linked_plan_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface StoryDetail extends Story {
  body: string;
}

export interface StoryPatch {
  title?: string;
  status?: string;
  size?: string;
  linked_spec?: string;
  linked_plan?: string;
}

export function parseFrontmatter(content: string): StoryFrontmatter | null {
  const parts = content.split("---");
  if (parts.length < 3) return null;

  const yamlBlock = parts[1].trim();
  const record: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) record[key] = value;
  }

  const result = StoryFrontmatterSchema.safeParse(record);
  return result.success ? result.data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && bun test src/__tests__/story.test.ts
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/story.ts packages/shared/src/__tests__/story.test.ts
git commit -m "feat(shared): add Story types and YAML frontmatter parser"
```

---

### Task 3: `@cc/shared/api.ts` + update `shared/src/index.ts`

**Files:**
- Create: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `api.ts` with contract types**

```typescript
// packages/shared/src/api.ts
import type { HookEvent } from "./events.ts";
import type { PlanTask } from "./plan.ts";

export type Phase = "brainstorm" | "spec" | "plan" | "implement";

export interface Session {
  id: string;
  cwd: string;
  model: string | null;
  agent_type: string | null;
  permission_mode: string;
  started_at: number;
  ended_at: number | null;
  status: string;
  inferred_phase: Phase | null;
  active_story_id: string | null;
  active_plan_path: string | null;
}

export interface EventRecord {
  id: number;
  session_id: string;
  subagent_id: string | null;
  event_name: string;
  payload_json: string;
  ts: number;
}

export type WSOut =
  | { type: "event"; data: EventRecord }
  | { type: "plan.changed"; data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed"; data: { path: string } }
  | { type: "story.changed"; data: { id: string; op: "create" | "update" | "delete" } }
  | { type: "phase.inferred"; data: { sessionId: string; phase: Phase } }
  | { type: "pong" };

// Exported for use in hooks/handlers.ts when publishing to Bus
export type { HookEvent };
```

- [ ] **Step 2: Update `packages/shared/src/index.ts`**

Replace the entire file with:

```typescript
// packages/shared/src/index.ts
export { HookEventSchema, type HookEvent } from "./events.ts";
export { parsePlan, type ParsedPlan, type PlanTask, type PlanStep } from "./plan.ts";
export {
  parseFrontmatter,
  type StoryFrontmatter,
  type Story,
  type StoryDetail,
  type StoryPatch,
} from "./story.ts";
export { type Phase, type Session, type EventRecord, type WSOut } from "./api.ts";
```

- [ ] **Step 3: Run full shared test suite to confirm nothing broke**

```bash
cd packages/shared && bun test
```
Expected: all existing + new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Phase, Session, EventRecord, WSOut contract types"
```

---

### Task 4: Upgrade `Bus` — add `BusEvent` union + `subscribe()`, update callers

**Files:**
- Modify: `packages/server/src/bus.ts`
- Modify: `packages/server/src/hooks/handlers.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Rewrite `packages/server/src/bus.ts`**

```typescript
// packages/server/src/bus.ts
import type { HookEvent, Phase, PlanTask } from "@cc/shared";

export type BusEvent =
  | { type: "hook"; data: HookEvent }
  | { type: "plan.changed"; data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed"; data: { path: string } }
  | { type: "story.changed"; data: { id: string; op: "create" | "update" | "delete" } }
  | { type: "phase.inferred"; data: { sessionId: string; phase: Phase } };

type Handler = (event: BusEvent) => void;

export interface Bus {
  publish(event: BusEvent): void;
  subscribe(handler: Handler): () => void;
}

export function createBus(): Bus {
  const handlers = new Set<Handler>();
  return {
    publish(event) {
      for (const h of handlers) h(event);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

export const stubBus: Bus = {
  publish: () => {},
  subscribe: () => () => {},
};
```

- [ ] **Step 2: Update `packages/server/src/hooks/handlers.ts`**

Replace the `bus.publish(event)` call to wrap the HookEvent:

```typescript
// packages/server/src/hooks/handlers.ts
import type { Database } from "bun:sqlite";
import type { HookEvent } from "@cc/shared";
import type { Bus } from "../bus.ts";
import { persistEvent } from "../store/index.ts";

export async function dispatchEvent(
  event: HookEvent,
  db: Database,
  bus: Bus,
): Promise<Response> {
  persistEvent(db, event);
  bus.publish({ type: "hook", data: event });
  return new Response("{}", { status: 200 });
}
```

- [ ] **Step 3: Update `packages/server/src/index.ts`** — replace `stubBus` with `createBus()`

In `index.ts`, change this import line:

```typescript
import { stubBus } from "./bus.ts";
```

to:

```typescript
import { createBus } from "./bus.ts";
```

And change the usage from:

```typescript
const bus = stubBus;
```

Wait — in the current `index.ts` the bus is passed directly as `bus: stubBus` in the `createServer` call. Replace:

```typescript
      server = createServer({
        port,
        token,
        db,
        bus: stubBus,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit,
      });
```

with:

```typescript
      server = createServer({
        port,
        token,
        db,
        bus,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit,
      });
```

And add `const bus = createBus();` before the port-binding loop.

Full updated top of the function (replace from `const token = ...` through the port loop):

```typescript
  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("hex");

  const bus = createBus();

  const activityRef = { fn: () => {} };

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
        bus,
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
```

- [ ] **Step 4: Run full server test suite to verify nothing broke**

```bash
cd packages/server && bun test
```
Expected: all existing tests PASS (stubBus still works in test helpers; handlers.ts now wraps HookEvent correctly).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/bus.ts packages/server/src/hooks/handlers.ts packages/server/src/index.ts
git commit -m "feat(server): upgrade Bus with BusEvent union and subscribe() method"
```

---

### Task 5: Database migration `002_superpowers.sql`

**Files:**
- Create: `packages/server/migrations/002_superpowers.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- packages/server/migrations/002_superpowers.sql
ALTER TABLE sessions ADD COLUMN active_story_id  TEXT;
ALTER TABLE sessions ADD COLUMN active_plan_path  TEXT;

CREATE TABLE IF NOT EXISTS stories (
  id               TEXT    PRIMARY KEY,
  file_path        TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  size             TEXT,
  status           TEXT    NOT NULL DEFAULT 'backlog',
  linked_spec_path TEXT,
  linked_plan_path TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
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
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path         TEXT    NOT NULL,
  task_index        INTEGER NOT NULL,
  step_index        INTEGER NOT NULL,
  step_label        TEXT    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'todo',
  completed_at      INTEGER,
  inferred_event_id INTEGER,
  ts                INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_path ON plan_tasks(plan_path);
CREATE INDEX IF NOT EXISTS idx_plan_steps_path ON plan_steps(plan_path, task_index);
CREATE INDEX IF NOT EXISTS idx_stories_status  ON stories(status);
```

- [ ] **Step 2: Verify migration applies cleanly to an existing DB**

```bash
cd packages/server && bun test src/store/__tests__/migrate.test.ts
```
Expected: existing migrate tests PASS (migration system applies files in order, 002 runs after 001).

- [ ] **Step 3: Commit**

```bash
git add packages/server/migrations/002_superpowers.sql
git commit -m "feat(server): add migration 002 for stories, plan_tasks, and plan_steps tables"
```

---

### Task 6: `superpowers/parser.ts` + tests

**Files:**
- Create: `packages/server/src/superpowers/parser.ts`
- Create: `packages/server/src/superpowers/__tests__/parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/superpowers/__tests__/parser.test.ts
import { describe, expect, test } from "bun:test";
import { parsePlan, parseSpec } from "../parser.ts";

describe("parsePlan (server re-export)", () => {
  test("parses fixture plan string", () => {
    const content = `# Feature Plan\n\n### Task 1: Do work\n\n- [ ] step one\n- [x] step two\n`;
    const result = parsePlan(content, "plan.md");
    expect(result.title).toBe("Feature Plan");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].steps[0].state).toBe("todo");
    expect(result.tasks[0].steps[1].state).toBe("done");
  });
});

describe("parseSpec", () => {
  test("extracts title from first H1 and returns full body", () => {
    const content = `# My Spec\n\nSome content here.`;
    const result = parseSpec(content, "specs/my-spec.md");
    expect(result.title).toBe("My Spec");
    expect(result.path).toBe("specs/my-spec.md");
    expect(result.body).toBe(content);
  });

  test("returns empty title when no H1 present", () => {
    const result = parseSpec("No heading here.", "spec.md");
    expect(result.title).toBe("");
    expect(result.body).toBe("No heading here.");
  });

  test("uses first H1 only, ignores subsequent H1s", () => {
    const content = `# First Title\n\n# Second Title\n\nBody.`;
    const result = parseSpec(content, "spec.md");
    expect(result.title).toBe("First Title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/superpowers/__tests__/parser.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/server/src/superpowers/parser.ts
export { parsePlan } from "@cc/shared";

export function parseSpec(
  content: string,
  path: string,
): { path: string; title: string; body: string } {
  const titleLine = content.split("\n").find((l) => l.startsWith("# "));
  const title = titleLine ? titleLine.slice(2).trim() : "";
  return { path, title, body: content };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/server && bun test src/superpowers/__tests__/parser.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/superpowers/parser.ts packages/server/src/superpowers/__tests__/parser.test.ts
git commit -m "feat(server): add superpowers parser module with parseSpec"
```

---

### Task 7: `superpowers/diff.ts` + tests

**Files:**
- Create: `packages/server/src/superpowers/diff.ts`
- Create: `packages/server/src/superpowers/__tests__/diff.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/superpowers/__tests__/diff.test.ts
import { describe, expect, test } from "bun:test";
import { diffCheckboxState } from "../diff.ts";
import type { ParsedPlan } from "@cc/shared";

function makePlan(taskSteps: Array<Array<"todo" | "done">>): ParsedPlan {
  return {
    path: "plan.md",
    title: "Test",
    tasks: taskSteps.map((steps, ti) => ({
      index: ti + 1,
      title: `Task ${ti + 1}`,
      files: [],
      steps: steps.map((state, si) => ({
        index: si + 1,
        label: `step ${si + 1}`,
        state,
      })),
    })),
  };
}

describe("diffCheckboxState", () => {
  test("returns empty array when no state changes", () => {
    const plan = makePlan([["todo", "done"]]);
    expect(diffCheckboxState(plan, plan)).toHaveLength(0);
  });

  test("detects single step completion (todo → done)", () => {
    const prev = makePlan([["todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ taskIndex: 1, stepIndex: 1, from: "todo", to: "done" });
  });

  test("detects multiple step changes across tasks", () => {
    const prev = makePlan([["todo", "todo"], ["todo"]]);
    const next = makePlan([["done", "todo"], ["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toEqual({ taskIndex: 1, stepIndex: 1, from: "todo", to: "done" });
    expect(diffs[1]).toEqual({ taskIndex: 2, stepIndex: 1, from: "todo", to: "done" });
  });

  test("diffs only overlapping range when task count differs", () => {
    const prev = makePlan([["todo"], ["todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].taskIndex).toBe(1);
  });

  test("diffs only overlapping step range within a task", () => {
    const prev = makePlan([["todo", "todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].stepIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/superpowers/__tests__/diff.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/server/src/superpowers/diff.ts
import type { ParsedPlan } from "@cc/shared";

export interface CheckboxDiff {
  taskIndex: number;
  stepIndex: number;
  from: "todo" | "done";
  to: "todo" | "done";
}

export function diffCheckboxState(
  prev: ParsedPlan,
  next: ParsedPlan,
): CheckboxDiff[] {
  const diffs: CheckboxDiff[] = [];
  const taskCount = Math.min(prev.tasks.length, next.tasks.length);
  for (let t = 0; t < taskCount; t++) {
    const prevSteps = prev.tasks[t].steps;
    const nextSteps = next.tasks[t].steps;
    const stepCount = Math.min(prevSteps.length, nextSteps.length);
    for (let s = 0; s < stepCount; s++) {
      if (prevSteps[s].state !== nextSteps[s].state) {
        diffs.push({
          taskIndex: t + 1,
          stepIndex: s + 1,
          from: prevSteps[s].state,
          to: nextSteps[s].state,
        });
      }
    }
  }
  return diffs;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/server && bun test src/superpowers/__tests__/diff.test.ts
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/superpowers/diff.ts packages/server/src/superpowers/__tests__/diff.test.ts
git commit -m "feat(server): add diffCheckboxState for plan step change detection"
```

---

### Task 8: `superpowers/phase.ts` + tests

**Files:**
- Create: `packages/server/src/superpowers/phase.ts`
- Create: `packages/server/src/superpowers/__tests__/phase.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/superpowers/__tests__/phase.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { advancePhase, inferPhase } from "../phase.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("inferPhase", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    db.run(
      "INSERT INTO sessions (id, cwd, permission_mode, started_at, status) VALUES ('s1', '/proj', 'default', 0, 'active')",
    );
  });

  afterEach(() => db.close());

  function insertEvent(sessionId: string, filePath: string) {
    db.run(
      "INSERT INTO events (session_id, event_name, payload_json, ts) VALUES (?, 'InstructionsLoaded', ?, ?)",
      [sessionId, JSON.stringify({ file_path: filePath }), Date.now()],
    );
  }

  test("returns implement for executing-plans skill path", () => {
    insertEvent("s1", "/skills/executing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });

  test("returns implement for subagent-driven-development skill path", () => {
    insertEvent("s1", "/skills/subagent-driven-development/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });

  test("returns plan for writing-plans skill path", () => {
    insertEvent("s1", "/skills/writing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("plan");
  });

  test("returns brainstorm for brainstorming skill path", () => {
    insertEvent("s1", "/skills/brainstorming/SKILL.md");
    expect(inferPhase("s1", db)).toBe("brainstorm");
  });

  test("returns null when no InstructionsLoaded events", () => {
    expect(inferPhase("s1", db)).toBeNull();
  });

  test("first match wins — implement beats plan when both present", () => {
    insertEvent("s1", "/skills/writing-plans/SKILL.md");
    insertEvent("s1", "/skills/executing-plans/SKILL.md");
    expect(inferPhase("s1", db)).toBe("implement");
  });
});

describe("advancePhase", () => {
  test("returns next phase when current is null", () => {
    expect(advancePhase(null, "spec")).toBe("spec");
  });

  test("advances to a higher phase", () => {
    expect(advancePhase("brainstorm", "plan")).toBe("plan");
    expect(advancePhase("plan", "implement")).toBe("implement");
  });

  test("stays at current when next is lower", () => {
    expect(advancePhase("implement", "brainstorm")).toBe("implement");
    expect(advancePhase("plan", "spec")).toBe("plan");
  });

  test("stays at current when next equals current", () => {
    expect(advancePhase("spec", "spec")).toBe("spec");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/superpowers/__tests__/phase.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/server/src/superpowers/phase.ts
import type { Database } from "bun:sqlite";
import type { Phase } from "@cc/shared";

const PHASE_ORDER: Phase[] = ["brainstorm", "spec", "plan", "implement"];

export function advancePhase(current: Phase | null, next: Phase): Phase {
  if (!current) return next;
  return PHASE_ORDER.indexOf(next) > PHASE_ORDER.indexOf(current) ? next : current;
}

export function inferPhase(sessionId: string, db: Database): Phase | null {
  const rows = db
    .query<{ payload_json: string }, [string, string, number]>(
      `SELECT payload_json FROM events
       WHERE session_id = ? AND event_name = ?
       ORDER BY ts DESC LIMIT ?`,
    )
    .all(sessionId, "InstructionsLoaded", 20);

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as { file_path?: string };
      const fp = payload.file_path ?? "";
      if (fp.includes("executing-plans") || fp.includes("subagent-driven-development")) {
        return "implement";
      }
      if (fp.includes("writing-plans")) return "plan";
      if (fp.includes("brainstorming")) return "brainstorm";
    } catch {
      // skip malformed
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/server && bun test src/superpowers/__tests__/phase.test.ts
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/superpowers/phase.ts packages/server/src/superpowers/__tests__/phase.test.ts
git commit -m "feat(server): add inferPhase and advancePhase with forward-only constraint"
```

---

### Task 9: `superpowers/index.ts` — `SuperpowersWatcher` class + tests

**Files:**
- Create: `packages/server/src/superpowers/index.ts`
- Create: `packages/server/src/superpowers/__tests__/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/superpowers/__tests__/watcher.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrations } from "../../store/migrate.ts";
import { stubBus } from "../../bus.ts";
import { SuperpowersWatcher } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("SuperpowersWatcher", () => {
  let db: Database;
  let cwd: string;
  let watcher: SuperpowersWatcher;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-watcher-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    await mkdir(join(cwd, "docs/superpowers/specs"), { recursive: true });
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    watcher = new SuperpowersWatcher(cwd, db, stubBus);
  });

  afterEach(async () => {
    watcher.stop();
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("start() eagerly parses existing plan files", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/my-plan.md");
    await writeFile(planPath, `# My Plan\n\n### Task 1: Setup\n\n- [ ] step one\n`);

    await watcher.start();

    const plan = watcher.getParsedPlan(planPath);
    expect(plan).not.toBeNull();
    expect(plan?.title).toBe("My Plan");
    expect(plan?.tasks[0].steps[0].state).toBe("todo");
  });

  test("getParsedPlan returns null for unknown path", async () => {
    await watcher.start();
    expect(watcher.getParsedPlan("/nonexistent/plan.md")).toBeNull();
  });

  test("handleFileChange updates plan and upserts plan_tasks rows", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/feature.md");
    await writeFile(planPath, `# Plan\n\n### Task 1: Work\n\n- [ ] todo\n`);
    await watcher.start();
    await watcher.handleFileChange(planPath);

    const rows = db
      .query<{ task_title: string }, []>("SELECT task_title FROM plan_tasks")
      .all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].task_title).toBe("Work");
  });

  test("handleFileChange publishes plan.changed bus event", async () => {
    const published: Array<{ type: string }> = [];
    const bus = {
      publish: (e: { type: string }) => published.push(e),
      subscribe: () => () => {},
    };
    const w = new SuperpowersWatcher(cwd, db, bus);
    await w.start();

    const planPath = join(cwd, "docs/superpowers/plans/test.md");
    await writeFile(planPath, `# Plan\n\n### Task 1: T\n\n- [ ] step\n`);
    await w.handleFileChange(planPath);

    expect(published.some((e) => e.type === "plan.changed")).toBe(true);
    w.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/superpowers/__tests__/watcher.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/server/src/superpowers/index.ts
import type { Database } from "bun:sqlite";
import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ParsedPlan, Phase } from "@cc/shared";
import type { Bus } from "../bus.ts";
import { diffCheckboxState } from "./diff.ts";
import { parsePlan } from "./parser.ts";
import { advancePhase, inferPhase } from "./phase.ts";

export class SuperpowersWatcher {
  private plans = new Map<string, ParsedPlan>();
  private specs = new Map<string, string>();
  private watchers: Array<{ close(): void }> = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private cwd: string,
    private db: Database,
    private bus: Bus,
  ) {}

  async start(): Promise<void> {
    const plansDir = join(this.cwd, "docs/superpowers/plans");
    const specsDir = join(this.cwd, "docs/superpowers/specs");
    try {
      await this.loadDir(plansDir, true);
      await this.loadDir(specsDir, false);
      this.watchDir(plansDir);
      this.watchDir(specsDir);
    } catch {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, 30_000);
    }
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  getParsedPlan(path: string): ParsedPlan | null {
    return this.plans.get(resolve(path)) ?? null;
  }

  getSpecBody(path: string): string | null {
    return this.specs.get(resolve(path)) ?? null;
  }

  async handleFileChange(filePath: string): Promise<void> {
    const abs = resolve(filePath);
    const plansDir = resolve(join(this.cwd, "docs/superpowers/plans"));
    const specsDir = resolve(join(this.cwd, "docs/superpowers/specs"));

    let content: string;
    try {
      content = await readFile(abs, "utf-8");
    } catch {
      return;
    }

    if (abs.startsWith(plansDir)) {
      const prev = this.plans.get(abs) ?? { path: abs, title: "", tasks: [] };
      const next = parsePlan(content, abs);
      const diffs = diffCheckboxState(prev, next);

      this.plans.set(abs, next);
      this.upsertPlan(abs, next);
      this.bus.publish({ type: "plan.changed", data: { path: abs, tasks: next.tasks } });

      if (diffs.length > 0) {
        this.maybeAdvancePhase("implement");
      } else if (prev.tasks.length === 0 && next.tasks.length > 0) {
        this.maybeAdvancePhase("plan");
      }
    } else if (abs.startsWith(specsDir)) {
      const isNew = !this.specs.has(abs);
      this.specs.set(abs, content);
      this.bus.publish({ type: "spec.changed", data: { path: abs } });
      if (isNew) this.maybeAdvancePhase("spec");
    }
  }

  private async loadDir(dir: string, isPlan: boolean): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const abs = resolve(join(dir, name));
      const content = await readFile(abs, "utf-8").catch(() => null);
      if (!content) continue;
      if (isPlan) {
        const parsed = parsePlan(content, abs);
        this.plans.set(abs, parsed);
        this.upsertPlan(abs, parsed);
      } else {
        this.specs.set(abs, content);
      }
    }
  }

  private watchDir(dir: string): void {
    const absDir = resolve(dir);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    try {
      const w = watch(absDir, { persistent: false }, (_event, filename) => {
        if (!filename?.endsWith(".md")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.handleFileChange(join(absDir, filename));
        }, 200);
      });
      this.watchers.push(w);
    } catch {
      const timer = setInterval(async () => {
        const entries = await readdir(absDir).catch(() => [] as string[]);
        for (const name of entries) {
          if (name.endsWith(".md")) await this.handleFileChange(join(absDir, name));
        }
      }, 5_000);
      this.watchers.push({ close: () => clearInterval(timer) });
    }
  }

  private upsertPlan(planPath: string, plan: ParsedPlan): void {
    const ts = Date.now();
    this.db.run(
      `DELETE FROM plan_tasks WHERE plan_path = ?`,
      [planPath],
    );
    this.db.run(
      `DELETE FROM plan_steps WHERE plan_path = ?`,
      [planPath],
    );
    for (const task of plan.tasks) {
      this.db.run(
        `INSERT INTO plan_tasks (plan_path, task_index, task_title, files_json, ts) VALUES (?, ?, ?, ?, ?)`,
        [planPath, task.index, task.title, JSON.stringify(task.files), ts],
      );
      for (const step of task.steps) {
        this.db.run(
          `INSERT INTO plan_steps (plan_path, task_index, step_index, step_label, state, ts) VALUES (?, ?, ?, ?, ?, ?)`,
          [planPath, task.index, step.index, step.label, step.state, ts],
        );
      }
    }
  }

  private maybeAdvancePhase(target: Phase): void {
    const session = this.db
      .query<{ id: string; inferred_phase: string | null }, [string]>(
        `SELECT id, inferred_phase FROM sessions WHERE cwd = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      )
      .get(this.cwd);

    if (!session) return;

    const current = (session.inferred_phase as Phase | null) ?? null;
    const next = advancePhase(current, target);
    if (next === current) return;

    this.db.run(`UPDATE sessions SET inferred_phase = ? WHERE id = ?`, [next, session.id]);
    this.bus.publish({ type: "phase.inferred", data: { sessionId: session.id, phase: next } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/server && bun test src/superpowers/__tests__/watcher.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/superpowers/index.ts packages/server/src/superpowers/__tests__/watcher.test.ts
git commit -m "feat(server): add SuperpowersWatcher with file watching, plan parsing, and phase inference"
```

---

### Task 10: `stories/template.ts` + `stories/index.ts` — `StoryService` + tests

**Files:**
- Create: `packages/server/src/stories/template.ts`
- Create: `packages/server/src/stories/index.ts`
- Create: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/stories/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrations } from "../../store/migrate.ts";
import { stubBus } from "../../bus.ts";
import { StoryService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("StoryService", () => {
  let db: Database;
  let cwd: string;
  let service: StoryService;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-stories-${Date.now()}`);
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    service = new StoryService(cwd, db, stubBus);
    await service.start();
  });

  afterEach(async () => {
    service.stop();
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("create() returns a story with generated id and writes a file", async () => {
    const story = await service.create("Add OAuth login");
    expect(story.id).toMatch(/^US-\d{4}-\d{2}-\d{2}-/);
    expect(story.title).toBe("Add OAuth login");
    expect(story.status).toBe("backlog");
    const row = db.query<{ id: string }, []>("SELECT id FROM stories").get();
    expect(row?.id).toBe(story.id);
  });

  test("list() returns created story and excludes archived ones", async () => {
    await service.create("Story A");
    await service.create("Story B");
    const stories = service.list();
    expect(stories).toHaveLength(2);
  });

  test("get() returns story detail with body", async () => {
    const created = await service.create("Detail Story");
    const detail = service.get(created.id);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(created.id);
    expect(typeof detail?.body).toBe("string");
  });

  test("update() patches status and reflects in list()", async () => {
    const story = await service.create("Update Me");
    await service.update(story.id, { status: "in-progress" });
    const row = db
      .query<{ status: string }, [string]>("SELECT status FROM stories WHERE id = ?")
      .get(story.id);
    expect(row?.status).toBe("in-progress");
  });

  test("archive() moves story to archived status", async () => {
    const story = await service.create("Archive Me");
    await service.archive(story.id);
    const all = service.list();
    expect(all.find((s) => s.id === story.id)).toBeUndefined();
    const row = db
      .query<{ status: string }, [string]>("SELECT status FROM stories WHERE id = ?")
      .get(story.id);
    expect(row?.status).toBe("archived");
  });

  test("get() returns null for invalid id format", () => {
    expect(service.get("../etc/passwd")).toBeNull();
    expect(service.get("not-a-valid-id")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `stories/template.ts`**

```typescript
// packages/server/src/stories/template.ts
export function scaffoldStory(id: string, title: string, created: string): string {
  return `---
id: ${id}
title: ${title}
status: backlog
created: ${created}
---

## Story

As a [...], I want [...], so that [...].

## Acceptance criteria

- [ ] ...

## Notes

(optional)
`;
}
```

- [ ] **Step 4: Create `stories/index.ts`**

```typescript
// packages/server/src/stories/index.ts
import type { Database } from "bun:sqlite";
import { watch } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, type Story, type StoryDetail, type StoryPatch } from "@cc/shared";
import type { Bus } from "../bus.ts";
import { scaffoldStory } from "./template.ts";

const STORY_ID_REGEX = /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function updateFrontmatterField(yaml: string, key: string, value: string): string {
  const regex = new RegExp(`^(${key}:).*$`, "m");
  return regex.test(yaml) ? yaml.replace(regex, `$1 ${value}`) : `${yaml}\n${key}: ${value}`;
}

function applyPatch(content: string, patch: StoryPatch): string {
  const parts = content.split("---");
  if (parts.length < 3) return content;
  let yaml = parts[1];
  if (patch.title) yaml = updateFrontmatterField(yaml, "title", patch.title);
  if (patch.status) yaml = updateFrontmatterField(yaml, "status", patch.status);
  if (patch.size !== undefined) yaml = updateFrontmatterField(yaml, "size", patch.size ?? "");
  if (patch.linked_spec !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_spec", patch.linked_spec ?? "");
  if (patch.linked_plan !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_plan", patch.linked_plan ?? "");
  return ["", yaml, ...parts.slice(2)].join("---");
}

export class StoryService {
  private storiesDir: string;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(
    private cwd: string,
    private db: Database,
    private bus: Bus,
  ) {
    this.storiesDir = join(cwd, "docs/superpowers/stories");
  }

  async start(): Promise<void> {
    await mkdir(this.storiesDir, { recursive: true });
    await this.loadAll();
    this.watcher = watch(this.storiesDir, { persistent: false }, async (_event, filename) => {
      if (!filename?.endsWith(".md")) return;
      const filePath = join(this.storiesDir, filename);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (!content) return;
      const fm = parseFrontmatter(content);
      if (!fm) return;
      await this.upsertRow(fm.id, filePath, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
      this.bus.publish({ type: "story.changed", data: { id: fm.id, op: "update" } });
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  list(): Story[] {
    return this.db
      .query<Story, []>(
        `SELECT id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at
         FROM stories WHERE status != 'archived' ORDER BY created_at DESC`,
      )
      .all();
  }

  get(id: string): StoryDetail | null {
    if (!STORY_ID_REGEX.test(id)) return null;
    const row = this.db
      .query<Story, [string]>("SELECT * FROM stories WHERE id = ?")
      .get(id);
    if (!row) return null;
    let content: string;
    try {
      content = readFileSync(row.file_path, "utf-8");
    } catch {
      return null;
    }
    const parts = content.split("---");
    const body = parts.slice(2).join("---").trim();
    return { ...row, body };
  }

  async create(title: string): Promise<Story> {
    const today = new Date().toISOString().slice(0, 10);
    const id = `US-${today}-${toSlug(title)}`;
    const filePath = join(this.storiesDir, `${id}.md`);
    await writeFile(filePath, scaffoldStory(id, title, today), "utf-8");
    const ts = Date.now();
    this.db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [id, filePath, title, ts, ts],
    );
    this.bus.publish({ type: "story.changed", data: { id, op: "create" } });
    return this.db.query<Story, [string]>("SELECT * FROM stories WHERE id = ?").get(id)!;
  }

  async update(id: string, patch: StoryPatch): Promise<Story | null> {
    if (!STORY_ID_REGEX.test(id)) return null;
    const row = this.db
      .query<{ file_path: string }, [string]>("SELECT file_path FROM stories WHERE id = ?")
      .get(id);
    if (!row) return null;
    const content = await readFile(row.file_path, "utf-8");
    await writeFile(row.file_path, applyPatch(content, patch), "utf-8");
    const ts = Date.now();
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [ts];
    if (patch.title) { sets.push("title = ?"); vals.push(patch.title); }
    if (patch.status) { sets.push("status = ?"); vals.push(patch.status); }
    if (patch.size !== undefined) { sets.push("size = ?"); vals.push(patch.size ?? null); }
    vals.push(id);
    this.db.run(`UPDATE stories SET ${sets.join(", ")} WHERE id = ?`, vals);
    this.bus.publish({ type: "story.changed", data: { id, op: "update" } });
    return this.db.query<Story, [string]>("SELECT * FROM stories WHERE id = ?").get(id)!;
  }

  async archive(id: string): Promise<void> {
    if (!STORY_ID_REGEX.test(id)) return;
    const row = this.db
      .query<{ file_path: string }, [string]>("SELECT file_path FROM stories WHERE id = ?")
      .get(id);
    if (!row) return;
    const archiveDir = join(this.storiesDir, "archive");
    await mkdir(archiveDir, { recursive: true });
    await rename(row.file_path, join(archiveDir, `${id}.md`));
    this.db.run(
      "UPDATE stories SET status = 'archived', updated_at = ? WHERE id = ?",
      [Date.now(), id],
    );
    this.bus.publish({ type: "story.changed", data: { id, op: "delete" } });
  }

  private async loadAll(): Promise<void> {
    const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const filePath = join(this.storiesDir, name);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (!content) continue;
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      await this.upsertRow(fm.id, filePath, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
    }
  }

  private upsertRow(
    id: string,
    filePath: string,
    status: string,
    size: string | null,
    linkedSpec: string | null,
    linkedPlan: string | null,
  ): void {
    const ts = Date.now();
    const title = id; // will be overwritten by frontmatter title if available; good enough for upsert
    this.db.run(
      `INSERT OR REPLACE INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, COALESCE((SELECT title FROM stories WHERE id = ?), ?), ?, ?, ?, ?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?), ?)`,
      [id, filePath, id, title, size, status, linkedSpec, linkedPlan, id, ts, ts],
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```
Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/stories/template.ts packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(server): add StoryService with CRUD, file watcher, and Bus integration"
```

---

### Task 11: `ws/index.ts` — `WsServer` + tests

**Files:**
- Create: `packages/server/src/ws/index.ts`
- Create: `packages/server/src/ws/__tests__/ws.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/ws/__tests__/ws.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { createBus } from "../../bus.ts";
import { WsServer } from "../index.ts";
import { runMigrations } from "../../store/migrate.ts";
import { createServer } from "../../server.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");
const TOKEN = "ws-test-token";

describe("WsServer", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let bus: ReturnType<typeof createBus>;
  let wsServer: WsServer;

  beforeAll(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    bus = createBus();
    wsServer = new WsServer(bus);
    server = createServer({ port: 0, token: TOKEN, db, bus, wsServer });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    wsServer.stop();
    server.stop(true);
    db.close();
  });

  test("upgrade rejected without token returns 401", async () => {
    const res = await fetch(`${base}/ws`, {
      headers: { Host: `127.0.0.1:${server.port}`, Upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  test("connects and receives pong on ping", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

    const pong = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      ws.send(JSON.stringify({ type: "ping" }));
    });

    const msg = JSON.parse(pong) as { type: string };
    expect(msg.type).toBe("pong");
    ws.close();
  });

  test("fan-out delivers plan.changed only to subscribed client", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

    ws.send(JSON.stringify({ type: "subscribe", topics: ["plan:/some/path.md"] }));
    await new Promise((r) => setTimeout(r, 50));

    const received = await new Promise<string>((resolve) => {
      ws.addEventListener("message", (e) => resolve(e.data as string));
      bus.publish({
        type: "plan.changed",
        data: { path: "/some/path.md", tasks: [] },
      });
    });

    const msg = JSON.parse(received) as { type: string };
    expect(msg.type).toBe("plan.changed");
    ws.close();
  });

  test("unsubscribe stops delivery", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

    ws.send(JSON.stringify({ type: "subscribe", topics: ["stories"] }));
    await new Promise((r) => setTimeout(r, 30));
    ws.send(JSON.stringify({ type: "unsubscribe", topics: ["stories"] }));
    await new Promise((r) => setTimeout(r, 30));

    let received = false;
    ws.addEventListener("message", () => { received = true; });
    bus.publish({ type: "story.changed", data: { id: "US-2026-05-13-test", op: "create" } });
    await new Promise((r) => setTimeout(r, 80));

    expect(received).toBe(false);
    ws.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/ws/__tests__/ws.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/server/src/ws/index.ts`**

```typescript
// packages/server/src/ws/index.ts
import type { Server as BunServer, ServerWebSocket } from "bun";
import type { BusEvent, Bus, WSOut } from "../bus.ts";

export type WsData = { topics: Set<string> };

export class WsServer {
  private sockets = new Set<ServerWebSocket<WsData>>();
  private unsubscribe: (() => void) | null = null;

  constructor(private bus: Bus) {
    this.unsubscribe = bus.subscribe((event) => this.fanOut(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  upgrade(req: Request, server: BunServer, token: string): boolean {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== token) return false;
    return server.upgrade<WsData>(req, { data: { topics: new Set() } });
  }

  handleOpen(ws: ServerWebSocket<WsData>): void {
    this.sockets.add(ws);
  }

  handleClose(ws: ServerWebSocket<WsData>): void {
    this.sockets.delete(ws);
  }

  handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string; topics?: unknown };

    if (m.type === "subscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics) if (typeof t === "string") ws.data.topics.add(t);
    } else if (m.type === "unsubscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics) if (typeof t === "string") ws.data.topics.delete(t);
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" } satisfies WSOut));
    }
  }

  private fanOut(event: BusEvent): void {
    const pairs = this.toWsMessages(event);
    for (const [msg, topic] of pairs) {
      const json = JSON.stringify(msg);
      for (const ws of this.sockets) {
        if (ws.data.topics.has(topic)) ws.send(json);
      }
    }
  }

  private toWsMessages(event: BusEvent): Array<[WSOut, string]> {
    switch (event.type) {
      case "hook": {
        const out: WSOut = {
          type: "event",
          data: {
            id: 0,
            session_id: event.data.session_id,
            subagent_id: null,
            event_name: event.data.hook_event_name,
            payload_json: JSON.stringify(event.data),
            ts: Date.now(),
          },
        };
        return [
          [out, "events"],
          [out, `events:${event.data.session_id}`],
        ];
      }
      case "plan.changed":
        return [[{ type: "plan.changed", data: event.data }, `plan:${event.data.path}`]];
      case "spec.changed":
        return [[{ type: "spec.changed", data: event.data }, "specs"]];
      case "story.changed":
        return [[{ type: "story.changed", data: event.data }, "stories"]];
      case "phase.inferred":
        return [
          [
            { type: "phase.inferred", data: event.data },
            `events:${event.data.sessionId}`,
          ],
        ];
    }
  }
}
```

- [ ] **Step 4: Update `server.ts` to accept `wsServer` option and handle `/ws`**

Current `ServerConfig` in `packages/server/src/server.ts` needs two new optional fields. Also the `Bun.serve` call needs `websocket:` handlers and the `/ws` route.

Replace the entire contents of `packages/server/src/server.ts` with:

```typescript
// packages/server/src/server.ts
import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import type { Bus } from "./bus.ts";
import type { ApiCtx } from "./api/index.ts";
import type { WsData, WsServer } from "./ws/index.ts";
import { handleHookEvent } from "./hooks/index.ts";
import { mountApiRoutes } from "./api/index.ts";
import { RateLimiter, checkAuth } from "./security/index.ts";

export interface ServerConfig {
  port: number;
  token: string;
  db: Database;
  bus: Bus;
  onActivity?: () => void;
  rateLimit?: { limit: number; windowMs: number };
  wsServer?: WsServer;
  apiCtx?: ApiCtx;
}

export function createServer(config: ServerConfig): Server {
  const { token, db, bus } = config;
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit.limit, config.rateLimit.windowMs)
    : new RateLimiter();

  return Bun.serve<WsData>({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/healthz") {
        return Response.json({ status: "ok" });
      }

      if (req.method === "GET" && url.pathname === "/ws") {
        if (!config.wsServer) return new Response("Not Found", { status: 404 });
        const upgraded = config.wsServer.upgrade(req, server, token);
        if (upgraded) return undefined as unknown as Response;
        return new Response("Unauthorized", { status: 401 });
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
        if (config.apiCtx) return mountApiRoutes(req, url, config.apiCtx);
        return new Response("{}", { status: 501 });
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      message(ws, msg) {
        config.wsServer?.handleMessage(ws, msg);
      },
      open(ws) {
        config.wsServer?.handleOpen(ws);
      },
      close(ws) {
        config.wsServer?.handleClose(ws);
      },
    },
  });
}
```

- [ ] **Step 5: Run WS tests**

```bash
cd packages/server && bun test src/ws/__tests__/ws.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 6: Run full server suite to confirm nothing regressed**

```bash
cd packages/server && bun test
```
Expected: all tests PASS (existing `server.test.ts` tests still pass because `wsServer` + `apiCtx` are optional).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/ws/index.ts packages/server/src/ws/__tests__/ws.test.ts packages/server/src/server.ts
git commit -m "feat(server): add WsServer with subscribe/fanout and wire into Bun.serve websocket handlers"
```

---

### Task 12: REST API routes + tests

**Files:**
- Create: `packages/server/src/api/index.ts`
- Create: `packages/server/src/api/sessions.ts`
- Create: `packages/server/src/api/stories.ts`
- Create: `packages/server/src/api/superpowers.ts`
- Create: `packages/server/src/api/__tests__/routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/api/__tests__/routes.test.ts
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { createBus } from "../../bus.ts";
import { createServer } from "../../server.ts";
import { runMigrations } from "../../store/migrate.ts";
import { SuperpowersWatcher } from "../../superpowers/index.ts";
import { StoryService } from "../../stories/index.ts";
import type { ApiCtx } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");
const TOKEN = "api-test-token";

describe("REST API routes", () => {
  let db: Database;
  let server: ReturnType<typeof createServer>;
  let base: string;
  let cwd: string;

  beforeAll(async () => {
    cwd = join(tmpdir(), `cc-api-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    await mkdir(join(cwd, "docs/superpowers/specs"), { recursive: true });

    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);

    const bus = createBus();
    const watcher = new SuperpowersWatcher(cwd, db, bus);
    await watcher.start();
    const stories = new StoryService(cwd, db, bus);
    await stories.start();

    const apiCtx: ApiCtx = { db, watcher, stories };
    server = createServer({ port: 0, token: TOKEN, db, bus, apiCtx });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    server.stop(true);
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  const auth = { Authorization: `Bearer ${TOKEN}`, Host: `` };

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Host: `127.0.0.1:${server.port}`,
      Authorization: `Bearer ${TOKEN}`,
      ...extra,
    };
  }

  // Sessions
  test("GET /api/sessions returns 200 with array", async () => {
    const res = await fetch(`${base}/api/sessions`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/sessions/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/sessions/unknown-sess`, { headers: headers() });
    expect(res.status).toBe(404);
  });

  test("GET /api/events returns 200 with events + cursor", async () => {
    const res = await fetch(`${base}/api/events`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; cursor: number };
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.cursor).toBe("number");
  });

  // Stories
  test("GET /api/stories returns 200 with array", async () => {
    const res = await fetch(`${base}/api/stories`, { headers: headers() });
    expect(res.status).toBe(200);
  });

  test("POST /api/stories creates story and returns 201", async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "API Test Story" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toMatch(/^US-\d{4}-\d{2}-\d{2}-/);
  });

  test("POST /api/stories returns 400 when title is missing", async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/stories/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/stories/US-2099-01-01-nonexistent`, {
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /api/stories/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${base}/api/stories/US-2099-01-01-nonexistent`, {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/plans/:path returns 404 for unknown plan", async () => {
    const res = await fetch(`${base}/api/plans/unknown.md`, { headers: headers() });
    expect(res.status).toBe(404);
  });

  test("GET /api/plans/:path returns 400 for path traversal", async () => {
    const res = await fetch(`${base}/api/plans/..%2Fetc%2Fpasswd`, { headers: headers() });
    expect(res.status).toBe(400);
  });

  test("any /api route returns 401 without auth", async () => {
    const res = await fetch(`${base}/api/sessions`, {
      headers: { Host: `127.0.0.1:${server.port}` },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && bun test src/api/__tests__/routes.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/server/src/api/sessions.ts`**

```typescript
// packages/server/src/api/sessions.ts
import type { Database } from "bun:sqlite";
import type { EventRecord, Session } from "@cc/shared";

export function mountSessionRoutes(req: Request, url: URL, db: Database): Response {
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const sessions = db
      .query<Session, []>("SELECT * FROM sessions ORDER BY started_at DESC")
      .all();
    return Response.json(sessions);
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const session = db
      .query<Session, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    const events = db
      .query<EventRecord, [string]>(
        "SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT 50",
      )
      .all(id);
    return Response.json({ ...session, events });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const sessionFilter = url.searchParams.get("session");
    const since = Number(url.searchParams.get("since") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 200);
    const events = sessionFilter
      ? db
          .query<EventRecord, [string, number, number]>(
            "SELECT * FROM events WHERE session_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?",
          )
          .all(sessionFilter, since, limit)
      : db
          .query<EventRecord, [number, number]>(
            "SELECT * FROM events WHERE ts > ? ORDER BY ts ASC LIMIT ?",
          )
          .all(since, limit);
    const cursor = events.length > 0 ? events[events.length - 1].ts : since;
    return Response.json({ events, cursor });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 4: Create `packages/server/src/api/stories.ts`**

```typescript
// packages/server/src/api/stories.ts
import type { StoryPatch } from "@cc/shared";
import type { StoryService } from "../stories/index.ts";

export async function mountStoryRoutes(
  req: Request,
  url: URL,
  stories: StoryService,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/stories") {
    return Response.json(stories.list());
  }

  if (req.method === "POST" && url.pathname === "/api/stories") {
    let body: { title?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (!body.title || typeof body.title !== "string") {
      return Response.json({ error: "title required" }, { status: 400 });
    }
    const story = await stories.create(body.title);
    return Response.json(story, { status: 201 });
  }

  const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);
  if (storyMatch) {
    const id = decodeURIComponent(storyMatch[1]);

    if (req.method === "GET") {
      const detail = stories.get(id);
      if (!detail) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(detail);
    }

    if (req.method === "PATCH") {
      let patch: StoryPatch;
      try {
        patch = await req.json();
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }
      const updated = await stories.update(id, patch);
      if (!updated) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(updated);
    }

    if (req.method === "DELETE") {
      await stories.archive(id);
      return Response.json({});
    }
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 5: Create `packages/server/src/api/superpowers.ts`**

```typescript
// packages/server/src/api/superpowers.ts
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { parseSpec } from "../superpowers/parser.ts";

function validatePath(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes("..")) return null;
  return decoded;
}

export function mountSuperpowersRoutes(
  req: Request,
  url: URL,
  watcher: SuperpowersWatcher,
): Response {
  const planMatch = url.pathname.match(/^\/api\/plans\/(.+)$/);
  if (req.method === "GET" && planMatch) {
    const path = validatePath(planMatch[1]);
    if (!path) return Response.json({ error: "invalid path" }, { status: 400 });
    const plan = watcher.getParsedPlan(path);
    if (!plan) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(plan);
  }

  const specMatch = url.pathname.match(/^\/api\/specs\/(.+)$/);
  if (req.method === "GET" && specMatch) {
    const path = validatePath(specMatch[1]);
    if (!path) return Response.json({ error: "invalid path" }, { status: 400 });
    const body = watcher.getSpecBody(path);
    if (!body) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(parseSpec(body, path));
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 6: Create `packages/server/src/api/index.ts`**

```typescript
// packages/server/src/api/index.ts
import type { Database } from "bun:sqlite";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import type { StoryService } from "../stories/index.ts";
import { mountSessionRoutes } from "./sessions.ts";
import { mountStoryRoutes } from "./stories.ts";
import { mountSuperpowersRoutes } from "./superpowers.ts";

export interface ApiCtx {
  db: Database;
  watcher: SuperpowersWatcher;
  stories: StoryService;
}

export function mountApiRoutes(
  req: Request,
  url: URL,
  ctx: ApiCtx,
): Response | Promise<Response> {
  if (url.pathname.startsWith("/api/sessions") || url.pathname === "/api/events") {
    return mountSessionRoutes(req, url, ctx.db);
  }
  if (url.pathname.startsWith("/api/stories")) {
    return mountStoryRoutes(req, url, ctx.stories);
  }
  if (url.pathname.startsWith("/api/plans") || url.pathname.startsWith("/api/specs")) {
    return mountSuperpowersRoutes(req, url, ctx.watcher);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 7: Run route tests**

```bash
cd packages/server && bun test src/api/__tests__/routes.test.ts
```
Expected: all 11 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/api/
git commit -m "feat(server): add REST API routes for sessions, stories, plans, and specs"
```

---

### Task 13: Wire up `index.ts` — services + WsServer + ApiCtx

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Update `startDaemon` to add `cwd`, instantiate and wire all services**

Replace the entire contents of `packages/server/src/index.ts` with:

```typescript
// packages/server/src/index.ts
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ApiCtx } from "./api/index.ts";
import { createBus } from "./bus.ts";
import {
  registerShutdownHandler,
  startIdleTimer,
  writeRuntimeJson,
} from "./lifecycle/index.ts";
import { createServer } from "./server.ts";
import { runMigrations } from "./store/migrate.ts";
import { SuperpowersWatcher } from "./superpowers/index.ts";
import { StoryService } from "./stories/index.ts";
import { WsServer } from "./ws/index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");
const VERSION = "0.2.0";

export interface DaemonOptions {
  port?: number;
  dataDir?: string;
  cwd?: string;
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

  const cwd = options.cwd ?? process.cwd();

  const db = new Database(join(dataDir, "claude-control.db"));
  await runMigrations(db, MIGRATIONS_DIR);

  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("hex");

  const bus = createBus();

  const watcher = new SuperpowersWatcher(cwd, db, bus);
  const stories = new StoryService(cwd, db, bus);
  const wsServer = new WsServer(bus);

  await watcher.start();
  await stories.start();

  const apiCtx: ApiCtx = { db, watcher, stories };

  const activityRef = { fn: () => {} };

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
        bus,
        wsServer,
        apiCtx,
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
      wsServer.stop();
      watcher.stop();
      stories.stop();
      db.close();
      bound.stop(true);
    },
  };
}

if (import.meta.main) {
  await startDaemon();
  console.log("Claude Control daemon started.");
}
```

- [ ] **Step 2: Run full server test suite**

```bash
cd packages/server && bun test
```
Expected: all tests PASS.

- [ ] **Step 3: Run full repo test suite**

```bash
cd /path/to/repo/root && pnpm test
```
Expected: all tests PASS across all packages.

- [ ] **Step 4: Run Biome lint**

```bash
bunx biome check packages/
```
Expected: no errors. Fix any reported issues before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): wire SuperpowersWatcher, StoryService, WsServer into startDaemon"
```

---

### Task 14: Extend integration test — PostToolUse → plan re-parse → WS delivery

**Files:**
- Modify: `packages/server/src/__tests__/integration.test.ts`

- [ ] **Step 1: Add the WS fan-out integration test**

Append this new `describe` block to `packages/server/src/__tests__/integration.test.ts`:

```typescript
describe("plan file change via PostToolUse → WS delivery", () => {
  let daemon: DaemonHandle;
  let cwd: string;

  beforeAll(async () => {
    cwd = join(tmpdir(), `cc-ws-integration-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/plans"), { recursive: true });
    daemon = await startDaemon({ port: 0, dataDir: join(tmpdir(), `cc-ws-data-${Date.now()}`), cwd });
  });

  afterAll(async () => {
    await daemon.stop();
    await import("node:fs/promises").then((fs) => fs.rm(cwd, { recursive: true, force: true }));
  });

  test("PostToolUse Edit on plan file triggers plan.changed WS message within 500ms", async () => {
    const planPath = join(cwd, "docs/superpowers/plans/test.md");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(planPath, `# Test Plan\n\n### Task 1: Work\n\n- [ ] step one\n`),
    );

    const ws = new WebSocket(`ws://127.0.0.1:${daemon.port}/ws?token=${daemon.token}`);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
    ws.send(JSON.stringify({ type: "subscribe", topics: [`plan:${planPath}`] }));
    await new Promise((r) => setTimeout(r, 50));

    const received = new Promise<{ type: string }>((resolve) => {
      ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)));
    });

    await fetch(`http://127.0.0.1:${daemon.port}/hooks/PostToolUse`, {
      method: "POST",
      headers: {
        Host: `127.0.0.1:${daemon.port}`,
        Authorization: `Bearer ${daemon.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "ws-integration-sess",
        transcript_path: "/tmp/t.json",
        cwd,
        hook_event_name: "PostToolUse",
        permission_mode: "default",
        tool_name: "Edit",
        tool_input: { file_path: planPath },
        tool_response: {},
      }),
    });

    const msg = await Promise.race([
      received,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
    ]);

    expect(msg.type).toBe("plan.changed");
    ws.close();
  });
});
```

Also add these imports at the top of the file (after existing imports):

```typescript
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
```

And update `hooks/handlers.ts` to trigger `watcher.handleFileChange` for Edit/Write PostToolUse events. In `handlers.ts`, the `dispatchEvent` function needs to accept the watcher optionally. The cleanest approach: pass it through the server config or use a context object.

The simplest surgical change: update `handleHookEvent` in `hooks/index.ts` to accept an optional `watcher` parameter:

```typescript
// packages/server/src/hooks/index.ts
import type { Database } from "bun:sqlite";
import { type HookEvent, HookEventSchema } from "@cc/shared";
import type { Bus } from "../bus.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { dispatchEvent } from "./handlers.ts";

export async function handleHookEvent(
  _eventName: string,
  body: unknown,
  db: Database,
  bus: Bus,
  watcher?: SuperpowersWatcher,
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

  if (
    watcher &&
    event.hook_event_name === "PostToolUse" &&
    (event.tool_name === "Edit" || event.tool_name === "Write")
  ) {
    const input = event.tool_input as Record<string, unknown>;
    const filePath = (input.file_path ?? input.path) as string | undefined;
    if (filePath) {
      watcher.handleFileChange(filePath).catch(() => {});
    }
  }

  return dispatchEvent(event, db, bus);
}
```

Update `server.ts` to pass `watcher` to `handleHookEvent`:

In `server.ts`, the `handleHookEvent` call becomes:

```typescript
return handleHookEvent(hookMatch[1], body, db, bus, config.apiCtx?.watcher);
```

- [ ] **Step 2: Run the full integration test suite**

```bash
cd packages/server && bun test src/__tests__/integration.test.ts
```
Expected: all tests PASS including the new WS delivery test.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/integration.test.ts packages/server/src/hooks/index.ts packages/server/src/server.ts
git commit -m "feat(server): trigger watcher on PostToolUse Edit/Write and add WS integration test"
```

---

### Task 15: Slash commands

**Files:**
- Create: `plugin/commands/status.md`
- Create: `plugin/commands/open.md`
- Create: `plugin/commands/story.md`
- Create: `plugin/commands/start.md`

- [ ] **Step 1: Create the `plugin/commands/` directory and `status.md`**

```markdown
---
description: Show Claude Control daemon status, active session, and inferred phase
allowed-tools:
  - Bash
  - Read
---

Show the Claude Control daemon status.

1. Read `~/.claude-control/runtime.json`. If the file does not exist, print "Daemon not running." and stop.

2. Parse the JSON and extract `port` and `token`.

3. Run:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" http://127.0.0.1:<port>/api/healthz
   ```
   If it fails or returns non-200, print "Daemon unreachable on port <port>." and stop.

4. Run:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" http://127.0.0.1:<port>/api/sessions
   ```

5. Print a summary:
   ```
   Daemon:  running  (port <port>, pid <pid>)
   Session: <id of most recent session, or "none">
   Phase:   <inferred_phase of most recent session, or "unknown">
   Story:   <active_story_id of most recent session, or "none">
   ```
```

- [ ] **Step 2: Create `plugin/commands/open.md`**

```markdown
---
description: Print the Claude Control dashboard URL for the browser
allowed-tools:
  - Read
---

Open the Claude Control dashboard.

1. Read `~/.claude-control/runtime.json`. If the file does not exist, print "Daemon not running. Start it with: bun run src/index.ts" and stop.

2. Parse the JSON and extract `port` and `token`.

3. Print:
   ```
   Open this URL in your browser:
   http://127.0.0.1:<port>/?token=<token>
   ```
```

- [ ] **Step 3: Create `plugin/commands/story.md`**

```markdown
---
description: Manage Claude Control stories — new, list, or size subcommands
allowed-tools:
  - Bash
  - Read
---

Manage stories. Usage: `/claude-control:story <subcommand> [args]`

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
```

- [ ] **Step 4: Create `plugin/commands/start.md`**

```markdown
---
description: Load a story and launch the Superpowers brainstorming workflow
allowed-tools:
  - Bash
  - Read
---

Start a story by feeding it into the Superpowers brainstorming workflow.

Usage: `/claude-control:start <story-id>`

1. Read `~/.claude-control/runtime.json` for `port` and `token`.

2. Fetch the story:
   ```bash
   curl -s \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     http://127.0.0.1:<port>/api/stories/<story-id>
   ```
   If 404, print "Story <story-id> not found." and stop.

3. Return this prompt expansion to Claude (do not execute it yourself — output it as the next user message):

   ```
   I want to work on this story:

   **ID:** <id>
   **Title:** <title>
   **Status:** <status>

   <body>

   Please invoke the Superpowers brainstorming skill to explore this story's requirements, identify design decisions, and help me write a spec.
   ```
```

- [ ] **Step 5: Verify all four files exist and are syntactically valid YAML frontmatter**

```bash
ls plugin/commands/
```
Expected: `open.md  start.md  status.md  story.md`

```bash
# Check YAML frontmatter delimiter presence
grep -l "^---" plugin/commands/*.md | wc -l
```
Expected: `4`

- [ ] **Step 6: Commit**

```bash
git add plugin/commands/
git commit -m "feat(plugin): add status, open, story, start slash commands"
```

---

### Task 16: Final verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```
Expected: all tests PASS across `@cc/shared` and `@cc/server`.

- [ ] **Step 2: Run Biome check**

```bash
bunx biome check .
```
Expected: no errors. Fix any formatting or lint issues reported.

- [ ] **Step 3: Manually verify success criteria from spec**

- [ ] SC1: `bun test` passes — confirmed by Step 1
- [ ] SC2: `SuperpowersWatcher` checkbox change reflected in `plan_steps` — covered by `watcher.test.ts` Task 9 step 4
- [ ] SC3: `StoryService` round-trip — covered by `service.test.ts` Task 10 step 5
- [ ] SC4: WS client receives `plan.changed` after plan edit — covered by integration test Task 14
- [ ] SC5: REST routes return correct shapes — covered by `routes.test.ts` Task 12
- [ ] SC6: Four slash command files exist — confirmed by Task 15 step 5
- [ ] SC7: Biome clean — confirmed by Step 2

- [ ] **Step 4: Final commit if any biome fixes were made**

```bash
git add -p
git commit -m "chore: fix biome lint issues across phase 2 implementation"
```
