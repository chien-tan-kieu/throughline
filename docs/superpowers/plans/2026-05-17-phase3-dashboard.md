# Phase 3: Dashboard + Standup + Handoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the React dashboard SPA (5 views), StandupService, HandoffService, and two slash commands.

**Architecture:** New `packages/web` Vite+React workspace served from disk (`packages/web/dist/`) via a server.ts catch-all. TanStack Query v5 handles REST data; Zustand manages WebSocket live state. Backend adds StandupService and HandoffService with three new API routes and a migration for the handoffs table.

**Tech Stack:** Bun runtime + bun:test (backend), React 18 + Vite 5 + vitest (frontend), TanStack Query v5, Zustand, react-markdown + rehype-highlight, Tailwind CSS v3, React Router v6 (hash mode)

---

## File Map

**New files — backend:**
- `packages/server/migrations/003_handoffs.sql`
- `packages/server/src/standup/index.ts`
- `packages/server/src/standup/__tests__/service.test.ts`
- `packages/server/src/handoff/index.ts`
- `packages/server/src/handoff/__tests__/service.test.ts`
- `packages/server/src/api/standup.ts`
- `packages/server/src/api/handoff.ts`
- `packages/server/src/api/__tests__/standup-handoff.test.ts`
- `plugin/commands/standup.md`
- `plugin/commands/handoff.md`

**Modified — backend:**
- `packages/shared/src/story.ts` — narrow size union, add StandupItem/StandupDigest
- `packages/shared/src/api.ts` — add StandupItem, StandupDigest types
- `packages/server/src/api/index.ts` — add standup/handoff to ApiCtx + dispatch
- `packages/server/src/index.ts` — instantiate StandupService + HandoffService
- `packages/server/src/server.ts` — SPA catch-all at end of fetch handler

**New files — frontend (`packages/web/src/`):**
- `index.css` (all tokens + CSS classes from mockup)
- `main.tsx`, `App.tsx`
- `store/ws.ts` (Zustand)
- `hooks/useWebSocket.ts`
- `lib/api.ts`
- `components/layout/Topbar.tsx`, `Sidebar.tsx`
- `components/shared/TypeIcon.tsx`, `StatusPill.tsx`, `SizePill.tsx`, `LinkedCard.tsx`, `HierarchyStrip.tsx`, `TaskCard.tsx`, `StepRow.tsx`
- `components/stories/StoryCard.tsx`, `KanbanColumn.tsx`
- `components/standup/StandupSection.tsx`, `StatsGrid.tsx`
- `pages/PlanPage.tsx`, `StoryPage.tsx`, `SpecPage.tsx`, `StoriesPage.tsx`, `StandupPage.tsx`
- `__tests__/useWebSocket.test.ts`

**Modified — frontend:**
- `packages/web/package.json` (update from stub)
- `packages/web/vite.config.ts` (new)
- `packages/web/tsconfig.json` (new)
- `packages/web/index.html` (new)
- `packages/web/tailwind.config.js` (new)
- `packages/web/postcss.config.js` (new)
- `root package.json` — add build script

---

## Task 1: DB Migration + Shared Type Narrowing

**Files:**
- Create: `packages/server/migrations/003_handoffs.sql`
- Modify: `packages/shared/src/story.ts`
- Modify: `packages/shared/src/api.ts`

- [ ] **Step 1: Create the handoffs migration**

```sql
-- packages/server/migrations/003_handoffs.sql
CREATE TABLE IF NOT EXISTS handoffs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id     TEXT    NOT NULL,
  file_path    TEXT    NOT NULL,
  generated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handoffs_story ON handoffs(story_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_ts    ON handoffs(generated_at DESC);
```

- [ ] **Step 2: Verify migration runs with existing daemon test**

Run: `cd packages/server && bun test src/__tests__/daemon.test.ts`
Expected: PASS (existing test boots daemon which runs all migrations including 003)

- [ ] **Step 3: Narrow size union in shared types**

In `packages/shared/src/story.ts`, replace the `size` field in `StoryFrontmatterSchema` and the `Story` / `StoryPatch` interfaces:

```ts
// packages/shared/src/story.ts
import { z } from "zod";

export type StorySize = "XS" | "S" | "M" | "L" | "XL";

const StoryFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  created: z.string(),
  size: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
  linked_spec: z.string().optional(),
  linked_plan: z.string().optional(),
});

export type StoryFrontmatter = z.infer<typeof StoryFrontmatterSchema>;

export interface Story {
  id: string;
  file_path: string;
  title: string;
  size: StorySize | null;
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
  size?: StorySize | null;
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

- [ ] **Step 4: Add StandupItem and StandupDigest to shared api types**

Append to `packages/shared/src/api.ts` (after existing type exports):

```ts
import type { StorySize } from "./story.ts";

export type StandupItem = {
  storyId: string;
  title: string;
  size: StorySize | null;
  detail: string;
};

export type StandupDigest = {
  date: string;
  shipped: StandupItem[];
  inProgress: StandupItem[];
  blockers: StandupItem[];
};
```

- [ ] **Step 5: Run full server test suite to confirm no regressions**

Run: `cd packages/server && bun test`
Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/migrations/003_handoffs.sql packages/shared/src/story.ts packages/shared/src/api.ts
git commit -m "feat: add handoffs migration and narrow StorySize enum to XS-XL"
```

---

## Task 2: StandupService

**Files:**
- Create: `packages/server/src/standup/__tests__/service.test.ts`
- Create: `packages/server/src/standup/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/server/src/standup/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { StandupService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

function seedStory(
  db: Database,
  opts: { id: string; title: string; status: string; size?: string; updatedAt: number },
) {
  db.run(
    `INSERT INTO stories (id, file_path, title, size, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [opts.id, `/tmp/${opts.id}.md`, opts.title, opts.size ?? null, opts.status, opts.updatedAt, opts.updatedAt],
  );
}

function seedBlockerEvents(db: Database, sessionId: string, storyId: string, toolName: string, count: number, withinMs: number) {
  db.run(
    `INSERT INTO sessions (id, cwd, permission_mode, started_at, status, active_story_id)
     VALUES (?, '/tmp', 'auto', ?, 'active', ?)`,
    [sessionId, Date.now() - withinMs, storyId],
  );
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    db.run(
      `INSERT INTO events (session_id, event_name, payload_json, ts)
       VALUES (?, 'PostToolUseFailure', ?, ?)`,
      [sessionId, JSON.stringify({ tool_name: toolName }), now - i * 1000],
    );
  }
}

describe("StandupService", () => {
  let db: Database;
  let svc: StandupService;

  beforeEach(async () => {
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    svc = new StandupService(db);
  });

  afterEach(() => db.close());

  test("returns empty digest when no stories", () => {
    const result = svc.generate("2026-05-17");
    expect(result.date).toBe("2026-05-17");
    expect(result.shipped).toHaveLength(0);
    expect(result.inProgress).toHaveLength(0);
    expect(result.blockers).toHaveLength(0);
  });

  test("shipped includes story done in prior calendar day window", () => {
    // date = 2026-05-17 → prior day = 2026-05-16 → window [May16 00:00, May17 00:00)
    const may16noon = new Date("2026-05-16T12:00:00").getTime();
    seedStory(db, { id: "US-001", title: "Shipped Story", status: "done", updatedAt: may16noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(1);
    expect(result.shipped[0].storyId).toBe("US-001");
  });

  test("shipped excludes story done on the requested date itself (wrong day)", () => {
    const may17noon = new Date("2026-05-17T12:00:00").getTime();
    seedStory(db, { id: "US-002", title: "Today Story", status: "done", updatedAt: may17noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(0);
  });

  test("shipped excludes story done two days ago", () => {
    const may15noon = new Date("2026-05-15T12:00:00").getTime();
    seedStory(db, { id: "US-003", title: "Old Story", status: "done", updatedAt: may15noon });
    const result = svc.generate("2026-05-17");
    expect(result.shipped).toHaveLength(0);
  });

  test("inProgress returns all stories with status in-progress", () => {
    seedStory(db, { id: "US-004", title: "WIP Story", status: "in-progress", updatedAt: Date.now() });
    const result = svc.generate("2026-05-17");
    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0].storyId).toBe("US-004");
  });

  test("blockers: fewer than 3 failures = no blocker", () => {
    seedBlockerEvents(db, "sess-1", "US-005", "Edit", 2, 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(0);
  });

  test("blockers: 3 or more failures for same tool in same session = blocker", () => {
    seedStory(db, { id: "US-005", title: "Blocked Story", status: "in-progress", updatedAt: Date.now() });
    seedBlockerEvents(db, "sess-2", "US-005", "Edit", 3, 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].storyId).toBe("US-005");
  });

  test("blockers: events older than 24h are excluded", () => {
    seedStory(db, { id: "US-006", title: "Old Blocked", status: "in-progress", updatedAt: Date.now() });
    seedBlockerEvents(db, "sess-3", "US-006", "Bash", 5, 25 * 3600_000);
    const result = svc.generate("2026-05-17");
    expect(result.blockers).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd packages/server && bun test src/standup/__tests__/service.test.ts`
Expected: FAIL — "Cannot find module '../index.ts'"

- [ ] **Step 3: Implement StandupService**

```ts
// packages/server/src/standup/index.ts
import type { Database } from "bun:sqlite";
import type { StandupDigest, StandupItem } from "@cc/shared";

export class StandupService {
  constructor(private db: Database) {}

  generate(date: string): StandupDigest {
    const dayStart = new Date(`${date}T00:00:00`).getTime();
    const shipStart = dayStart - 86_400_000;
    const shipEnd = dayStart;

    const shippedRows = this.db
      .query<{ id: string; title: string; size: string | null }, [number, number]>(
        `SELECT id, title, size FROM stories
         WHERE status = 'done' AND updated_at >= ? AND updated_at < ?`,
      )
      .all(shipStart, shipEnd);

    const shipped: StandupItem[] = shippedRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: (r.size as StandupItem["size"]) ?? null,
      detail: "shipped",
    }));

    const wipRows = this.db
      .query<{ id: string; title: string; size: string | null }, []>(
        `SELECT id, title, size FROM stories WHERE status = 'in-progress'`,
      )
      .all();

    const inProgress: StandupItem[] = wipRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: (r.size as StandupItem["size"]) ?? null,
      detail: "in progress",
    }));

    const cutoff = Date.now() - 86_400_000;
    const blockerRows = this.db
      .query<{ session_id: string; active_story_id: string | null; tool_name: string }, [number]>(
        `SELECT e.session_id, s.active_story_id,
                JSON_EXTRACT(e.payload_json, '$.tool_name') AS tool_name,
                COUNT(*) AS fail_count
         FROM events e
         JOIN sessions s ON e.session_id = s.id
         WHERE e.event_name = 'PostToolUseFailure'
           AND e.ts >= ?
         GROUP BY e.session_id, tool_name
         HAVING fail_count >= 3`,
      )
      .all(cutoff);

    const seenStories = new Set<string>();
    const blockers: StandupItem[] = [];
    for (const row of blockerRows) {
      const sid = row.active_story_id;
      if (!sid || seenStories.has(sid)) continue;
      seenStories.add(sid);
      const story = this.db
        .query<{ title: string; size: string | null }, [string]>(
          `SELECT title, size FROM stories WHERE id = ?`,
        )
        .get(sid);
      blockers.push({
        storyId: sid,
        title: story?.title ?? sid,
        size: (story?.size as StandupItem["size"]) ?? null,
        detail: `${row.tool_name} failing ≥3×`,
      });
    }

    return { date, shipped, inProgress, blockers };
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd packages/server && bun test src/standup/__tests__/service.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/standup/
git commit -m "feat(standup): add StandupService with shipped/in-progress/blocker digest"
```

---

## Task 3: HandoffService

**Files:**
- Create: `packages/server/src/handoff/__tests__/service.test.ts`
- Create: `packages/server/src/handoff/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/server/src/handoff/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../../store/migrate.ts";
import { HandoffService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

async function seedStoryFile(
  cwd: string,
  db: Database,
  opts: { id: string; title: string; status: string; body?: string; linkedPlan?: string },
) {
  const storiesDir = join(cwd, "docs/superpowers/stories");
  await Bun.write(
    join(storiesDir, `${opts.id}.md`),
    `---\nid: ${opts.id}\ntitle: ${opts.title}\nstatus: ${opts.status}\ncreated: 2026-05-17\n---\n\n${opts.body ?? "Story body here."}`,
  );
  const filePath = join(storiesDir, `${opts.id}.md`);
  db.run(
    `INSERT INTO stories (id, file_path, title, size, status, linked_plan_path, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [opts.id, filePath, opts.title, opts.status, opts.linkedPlan ?? null, Date.now(), Date.now()],
  );
  return filePath;
}

describe("HandoffService", () => {
  let db: Database;
  let cwd: string;
  let svc: HandoffService;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-handoff-${Date.now()}`);
    await Bun.write(join(cwd, "docs/superpowers/stories/.keep"), "");
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    svc = new HandoffService(cwd, db);
  });

  afterEach(async () => {
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });

  test("generate() writes handoff file and inserts DB row", async () => {
    await seedStoryFile(cwd, db, { id: "US-001", title: "Test Story", status: "in-progress" });
    const result = await svc.generate("US-001");
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.content).toContain("Test Story");
    const row = db.query<{ story_id: string }, []>("SELECT story_id FROM handoffs").get();
    expect(row?.story_id).toBe("US-001");
  });

  test("generate() writes to .throughline/handoffs/<date>-<id>.md", async () => {
    await seedStoryFile(cwd, db, { id: "US-002", title: "Path Test", status: "backlog" });
    const result = await svc.generate("US-002");
    expect(result.filePath).toContain(".throughline/handoffs");
    expect(result.filePath).toContain("US-002");
  });

  test("generate() includes story body in output", async () => {
    await seedStoryFile(cwd, db, {
      id: "US-003", title: "Body Story", status: "in-progress",
      body: "As a developer\nI want things to work\nSo that I am happy",
    });
    const result = await svc.generate("US-003");
    expect(result.content).toContain("As a developer");
  });

  test("generate() throws if story not found", async () => {
    await expect(svc.generate("US-NONEXISTENT")).rejects.toThrow("Story not found");
  });

  test("generate() succeeds when story has no linked plan", async () => {
    await seedStoryFile(cwd, db, { id: "US-004", title: "No Plan Story", status: "backlog" });
    const result = await svc.generate("US-004");
    expect(result.content).toContain("(no plan yet)");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd packages/server && bun test src/handoff/__tests__/service.test.ts`
Expected: FAIL — "Cannot find module '../index.ts'"

- [ ] **Step 3: Implement HandoffService**

```ts
// packages/server/src/handoff/index.ts
import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type HandoffResult = {
  filePath: string;
  content: string;
};

type StoryRow = {
  id: string;
  title: string;
  file_path: string;
  linked_plan_path: string | null;
  linked_spec_path: string | null;
  size: string | null;
  status: string;
};

export class HandoffService {
  constructor(
    private cwd: string,
    private db: Database,
  ) {}

  async generate(storyId: string): Promise<HandoffResult> {
    const story = this.db
      .query<StoryRow, [string]>(
        `SELECT id, title, file_path, linked_plan_path, linked_spec_path, size, status
         FROM stories WHERE id = ?`,
      )
      .get(storyId);

    if (!story) throw new Error(`Story not found: ${storyId}`);

    const storyBody = await Bun.file(story.file_path).text().catch(() => "");

    let planSection = "(no plan yet)";
    if (story.linked_plan_path) {
      const planText = await Bun.file(story.linked_plan_path).text().catch(() => "");
      planSection = this.extractPlanSummary(planText);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const content = [
      `# Handoff: ${story.title}`,
      "",
      `**Story:** ${story.id} · **Status:** ${story.status} · **Size:** ${story.size ?? "—"}`,
      "",
      "## Completed Tasks",
      this.extractDoneTasks(story.linked_plan_path ? planSection : null),
      "",
      "## Next Up",
      planSection,
      "",
      "## Story Body",
      "",
      storyBody.replace(/^---[\s\S]*?---\n/, "").trim(),
    ].join("\n");

    const handoffsDir = join(this.cwd, ".throughline", "handoffs");
    await mkdir(handoffsDir, { recursive: true });

    const fileName = `${dateStr}-${storyId}.md`;
    const filePath = join(handoffsDir, fileName);
    await Bun.write(filePath, content);

    this.db.run(
      `INSERT INTO handoffs (story_id, file_path, generated_at) VALUES (?, ?, ?)`,
      [storyId, filePath, Date.now()],
    );

    return { filePath, content };
  }

  private extractPlanSummary(planText: string): string {
    const lines = planText.split("\n");
    const taskLines = lines.filter((l) => l.match(/^###\s+Task/));
    if (taskLines.length === 0) return "(no tasks in plan)";

    const incomplete = taskLines.find((l) => {
      const idx = lines.indexOf(l);
      return !lines.slice(idx, idx + 20).some((s) => s.match(/^- \[x\]/i));
    });
    return incomplete ?? taskLines[taskLines.length - 1];
  }

  private extractDoneTasks(planSection: string | null): string {
    if (!planSection) return "(no plan yet)";
    return "(see plan for completed tasks)";
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd packages/server && bun test src/handoff/__tests__/service.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/handoff/
git commit -m "feat(handoff): add HandoffService that writes markdown handoff docs"
```

---

## Task 4: Standup + Handoff API Routes

**Files:**
- Create: `packages/server/src/api/standup.ts`
- Create: `packages/server/src/api/handoff.ts`
- Create: `packages/server/src/api/__tests__/standup-handoff.test.ts`
- Modify: `packages/server/src/api/index.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write the failing API tests**

```ts
// packages/server/src/api/__tests__/standup-handoff.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DaemonHandle, startDaemon } from "../../index.ts";

describe("standup + handoff routes", () => {
  let daemon: DaemonHandle;
  let base: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    const dataDir = join(tmpdir(), `cc-api-sh-${Date.now()}`);
    const cwd = join(tmpdir(), `cc-cwd-sh-${Date.now()}`);
    await mkdir(join(cwd, "docs/superpowers/stories"), { recursive: true });
    daemon = await startDaemon({ port: 0, dataDir, cwd });
    base = `http://127.0.0.1:${daemon.port}`;
    headers = { Authorization: `Bearer ${daemon.token}`, Host: `127.0.0.1:${daemon.port}` };
  });

  afterAll(async () => {
    await daemon.stop();
  });

  test("GET /api/standup returns digest with correct date", async () => {
    const res = await fetch(`${base}/api/standup`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.date).toBe("string");
    expect(Array.isArray(body.shipped)).toBe(true);
    expect(Array.isArray(body.inProgress)).toBe(true);
    expect(Array.isArray(body.blockers)).toBe(true);
  });

  test("GET /api/standup?date=2026-05-16 uses provided date", async () => {
    const res = await fetch(`${base}/api/standup?date=2026-05-16`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-05-16");
  });

  test("POST /api/handoff/:storyId returns 404 for unknown story", async () => {
    const res = await fetch(`${base}/api/handoff/US-2026-05-17-nonexistent`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(404);
  });

  test("POST /api/handoff/:storyId returns 400 for invalid ID", async () => {
    const res = await fetch(`${base}/api/handoff/invalid-id`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/handoffs returns array", async () => {
    const res = await fetch(`${base}/api/handoffs`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd packages/server && bun test src/api/__tests__/standup-handoff.test.ts`
Expected: FAIL — routes return 404 (not yet implemented)

- [ ] **Step 3: Implement the route handlers**

```ts
// packages/server/src/api/standup.ts
import type { StandupService } from "../standup/index.ts";

export function mountStandupRoutes(
  req: Request,
  url: URL,
  standup: StandupService,
): Response {
  if (req.method === "GET" && url.pathname === "/api/standup") {
    const today = new Date().toISOString().slice(0, 10);
    const date = url.searchParams.get("date") ?? today;
    return Response.json(standup.generate(date));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
```

```ts
// packages/server/src/api/handoff.ts
import type { Database } from "bun:sqlite";
import type { HandoffService } from "../handoff/index.ts";

const STORY_ID_REGEX = /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

export async function mountHandoffRoutes(
  req: Request,
  url: URL,
  handoff: HandoffService,
  db: Database,
): Promise<Response> {
  if (req.method === "GET" && url.pathname === "/api/handoffs") {
    const rows = db
      .query<{ id: number; story_id: string; file_path: string; generated_at: number }, []>(
        `SELECT id, story_id, file_path, generated_at FROM handoffs ORDER BY generated_at DESC`,
      )
      .all();
    return Response.json(rows);
  }

  const match = url.pathname.match(/^\/api\/handoff\/(.+)$/);
  if (match && req.method === "POST") {
    const storyId = decodeURIComponent(match[1]);
    if (!STORY_ID_REGEX.test(storyId)) {
      return Response.json({ error: "invalid story ID" }, { status: 400 });
    }
    try {
      const result = await handoff.generate(storyId);
      return Response.json(result, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) return Response.json({ error: msg }, { status: 404 });
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 4: Wire into ApiCtx and index**

Replace `packages/server/src/api/index.ts`:

```ts
// packages/server/src/api/index.ts
import type { Database } from "bun:sqlite";
import type { HandoffService } from "../handoff/index.ts";
import type { StandupService } from "../standup/index.ts";
import type { StoryService } from "../stories/index.ts";
import type { SuperpowersWatcher } from "../superpowers/index.ts";
import { mountHandoffRoutes } from "./handoff.ts";
import { mountSessionRoutes } from "./sessions.ts";
import { mountStandupRoutes } from "./standup.ts";
import { mountStoryRoutes } from "./stories.ts";
import { mountSuperpowersRoutes } from "./superpowers.ts";

export interface ApiCtx {
  db: Database;
  watcher: SuperpowersWatcher;
  stories: StoryService;
  standup: StandupService;
  handoff: HandoffService;
}

export function mountApiRoutes(
  req: Request,
  url: URL,
  ctx: ApiCtx,
): Response | Promise<Response> {
  if (
    url.pathname.startsWith("/api/sessions") ||
    url.pathname === "/api/events"
  ) {
    return mountSessionRoutes(req, url, ctx.db);
  }
  if (url.pathname.startsWith("/api/stories")) {
    return mountStoryRoutes(req, url, ctx.stories);
  }
  if (
    url.pathname.startsWith("/api/plans") ||
    url.pathname.startsWith("/api/specs")
  ) {
    return mountSuperpowersRoutes(req, url, ctx.watcher);
  }
  if (url.pathname === "/api/standup") {
    return mountStandupRoutes(req, url, ctx.standup);
  }
  if (url.pathname.startsWith("/api/handoff") || url.pathname === "/api/handoffs") {
    return mountHandoffRoutes(req, url, ctx.handoff, ctx.db);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
```

In `packages/server/src/index.ts`, add imports and wire into `startDaemon`:

```ts
// Add imports after existing imports:
import { HandoffService } from "./handoff/index.ts";
import { StandupService } from "./standup/index.ts";

// Inside startDaemon(), after `const stories = new StoryService(cwd, db, bus);`:
const standupService = new StandupService(db);
const handoffService = new HandoffService(cwd, db);

// Update apiCtx:
const apiCtx: ApiCtx = { db, watcher, stories, standup: standupService, handoff: handoffService };
```

- [ ] **Step 5: Run tests, confirm they pass**

Run: `cd packages/server && bun test src/api/__tests__/standup-handoff.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && bun test`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/api/ packages/server/src/index.ts
git commit -m "feat(api): add /api/standup, /api/handoff, /api/handoffs routes"
```

---

## Task 5: Slash Commands

**Files:**
- Create: `plugin/commands/standup.md`
- Create: `plugin/commands/handoff.md`

- [ ] **Step 1: Create the standup command**

```markdown
---
description: Show today's standup digest from Throughline (shipped yesterday, in-progress, blockers)
allowed-tools:
  - Bash
---

Generate and display the daily standup digest.

1. Ensure the daemon is running:
   ```bash
   bash -c '
     RUNTIME=~/.throughline/runtime.json
     probe() { PORT=$(jq -r .port "$RUNTIME" 2>/dev/null); curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; }
     if [ -f "$RUNTIME" ] && probe; then exit 0; fi
     LOG=~/.throughline/daemon.log
     ROOT=$(cat ~/.claude/plugins/known_marketplaces.json 2>/dev/null | jq -r '"'"'."throughline-local".installLocation'"'"' 2>/dev/null)
     [ -z "$ROOT" ] && echo "Cannot locate throughline install." && exit 1
     bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
     for i in $(seq 1 30); do sleep 0.1; [ -f "$RUNTIME" ] && probe && exit 0; done
     echo "Daemon failed to start. Check $LOG." && exit 1
   '
   ```
   If the script prints an error, stop and show it.

2. Read `~/.throughline/runtime.json` and extract `port` and `token`.

3. Fetch the standup digest:
   ```bash
   curl -s -H "Authorization: Bearer <token>" -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/standup"
   ```

4. Format and print the digest as markdown:

   ```
   ## Standup — <date>

   ### Shipped Yesterday
   - <storyId> (<size>) — <detail>
   (or "(none)" if shipped array is empty)

   ### In Progress
   - <storyId> (<size>) — <detail>
   (or "(none)" if inProgress array is empty)

   ### Blockers
   - <storyId> — <detail>
   (or "(none)" if blockers array is empty)
   ```

   Print the formatted markdown to the terminal.
```

- [ ] **Step 2: Create the handoff command**

```markdown
---
description: Generate a handoff document for a story. Usage: /throughline:handoff <story-id>
allowed-tools:
  - Bash
---

Generate a handoff document for the specified story and write it to disk.

Usage: `/throughline:handoff <story-id>`

The story ID is the full ID like `US-2026-05-17-billing-engine`.

1. Ensure the daemon is running (same bootstrap as other commands):
   ```bash
   bash -c '
     RUNTIME=~/.throughline/runtime.json
     probe() { PORT=$(jq -r .port "$RUNTIME" 2>/dev/null); curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; }
     if [ -f "$RUNTIME" ] && probe; then exit 0; fi
     LOG=~/.throughline/daemon.log
     ROOT=$(cat ~/.claude/plugins/known_marketplaces.json 2>/dev/null | jq -r '"'"'."throughline-local".installLocation'"'"' 2>/dev/null)
     [ -z "$ROOT" ] && echo "Cannot locate throughline install." && exit 1
     bun run "$ROOT/packages/server/src/index.ts" >> "$LOG" 2>&1 &
     for i in $(seq 1 30); do sleep 0.1; [ -f "$RUNTIME" ] && probe && exit 0; done
     echo "Daemon failed to start. Check $LOG." && exit 1
   '
   ```

2. Read `~/.throughline/runtime.json` and extract `port` and `token`.

3. POST to generate the handoff:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Host: 127.0.0.1:<port>" \
     "http://127.0.0.1:<port>/api/handoff/<story-id>"
   ```

4. If the response status is 201, print:
   ```
   Handoff written to <filePath>

   <content>
   ```
   If 404, print: "Story not found: <story-id>"
   If 400, print: "Invalid story ID format. Expected: US-YYYY-MM-DD-<slug>"
```

- [ ] **Step 3: Commit**

```bash
git add plugin/commands/standup.md plugin/commands/handoff.md
git commit -m "feat(commands): add /throughline:standup and /throughline:handoff slash commands"
```

---

## Task 6: packages/web Scaffold

**Files:**
- Modify: `packages/web/package.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/index.html`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/tailwind.config.js`

- [ ] **Step 1: Update package.json**

```json
{
  "name": "@cc/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.28.0",
    "rehype-highlight": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
// packages/web/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DAEMON_PORT = process.env.VITE_DAEMON_PORT ?? "47821";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${DAEMON_PORT}`,
      "/ws": { target: `ws://127.0.0.1:${DAEMON_PORT}`, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Source+Code+Pro:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <title>Throughline</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create postcss.config.js and tailwind.config.js**

```js
// packages/web/postcss.config.js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

```js
// packages/web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 6: Install dependencies and verify build scaffold works**

```bash
cd packages/web && pnpm install
```

Create a temporary `src/main.tsx` with just `export {}` to allow build:

```ts
// packages/web/src/main.tsx (temporary — will be replaced in Task 7)
export {};
```

Run: `cd packages/web && pnpm build`
Expected: build succeeds, `dist/` folder created with `index.html`

- [ ] **Step 7: Commit**

```bash
git add packages/web/
git commit -m "feat(web): scaffold Vite+React workspace with TypeScript, Tailwind, vitest"
```

---

## Task 7: Global Shell — CSS, Routing, Zustand, WS, API

**Files:**
- Create: `packages/web/src/index.css`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/store/ws.ts`
- Create: `packages/web/src/hooks/useWebSocket.ts`
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/__tests__/useWebSocket.test.ts`
- Create: `packages/web/src/components/layout/Topbar.tsx`
- Create: `packages/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the useWebSocket test**

```ts
// packages/web/src/__tests__/useWebSocket.test.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { describe, expect, test, vi } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  send(_data: string) {}
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { useWsStore } from "../store/ws.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useWebSocket", () => {
  test("opens connection with correct URL", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://127.0.0.1:47821/ws?token=abc123");
  });

  test("sets connectionStatus to live on open", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "disconnected" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); });
    expect(useWsStore.getState().connectionStatus).toBe("live");
  });

  test("sets connectionStatus to disconnected on close", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "live" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); MockWebSocket.instances[0].close(); });
    expect(useWsStore.getState().connectionStatus).toBe("disconnected");
  });

  test("updates phase on phase.inferred message", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", phase: null });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => {
      MockWebSocket.instances[0].open();
      MockWebSocket.instances[0].receive({ type: "phase.inferred", data: { sessionId: "s1", phase: "implement" } });
    });
    expect(useWsStore.getState().phase).toBe("implement");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `cd packages/web && pnpm test run src/__tests__/useWebSocket.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create Zustand store**

```ts
// packages/web/src/store/ws.ts
import { create } from "zustand";

type Phase = "brainstorm" | "spec" | "plan" | "implement";

interface WsState {
  port: number;
  token: string;
  connectionStatus: "live" | "disconnected";
  phase: Phase | null;
  sessionId: string | null;
  activeStoryId: string | null;
  setPort: (port: number) => void;
  setToken: (token: string) => void;
  setConnectionStatus: (s: "live" | "disconnected") => void;
  setPhase: (p: Phase | null) => void;
  setSessionId: (id: string | null) => void;
  setActiveStoryId: (id: string | null) => void;
}

export const useWsStore = create<WsState>((set) => ({
  port: 0,
  token: "",
  connectionStatus: "disconnected",
  phase: null,
  sessionId: null,
  activeStoryId: null,
  setPort: (port) => set({ port }),
  setToken: (token) => set({ token }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setPhase: (phase) => set({ phase }),
  setSessionId: (sessionId) => set({ sessionId }),
  setActiveStoryId: (activeStoryId) => set({ activeStoryId }),
}));
```

- [ ] **Step 4: Create useWebSocket hook**

```ts
// packages/web/src/hooks/useWebSocket.ts
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useWsStore } from "../store/ws.ts";

export function useWebSocket() {
  const { port, token, setConnectionStatus, setPhase, setSessionId, setActiveStoryId } = useWsStore();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelayRef = useRef(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!port || !token) return;

    function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("live");
        retryDelayRef.current = 1000;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "plan.changed") {
            queryClient.invalidateQueries({ queryKey: ["plan", msg.data.path] });
          } else if (msg.type === "story.changed") {
            queryClient.invalidateQueries({ queryKey: ["stories"] });
            queryClient.invalidateQueries({ queryKey: ["story", msg.data.id] });
          } else if (msg.type === "phase.inferred") {
            setPhase(msg.data.phase);
            setSessionId(msg.data.sessionId);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        const delay = Math.min(retryDelayRef.current * 2, 30_000);
        retryDelayRef.current = delay;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      retryTimerRef.current && clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [port, token]);
}
```

- [ ] **Step 5: Create api.ts**

```ts
// packages/web/src/lib/api.ts
import type { StandupDigest, StoryDetail, StoryPatch, Story } from "@cc/shared";
import { useWsStore } from "../store/ws.ts";

function base() {
  const { port, token } = useWsStore.getState();
  return { url: `http://127.0.0.1:${port}`, token };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, token } = base();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Host: `127.0.0.1:${useWsStore.getState().port}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  fetchStories: () => apiFetch<Story[]>("/api/stories"),
  fetchStory: (id: string) => apiFetch<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`),
  fetchPlan: (path: string) => apiFetch<unknown>(`/api/plans/${encodeURIComponent(path)}`),
  fetchSpec: (path: string) => apiFetch<{ content: string }>(`/api/specs/${encodeURIComponent(path)}`),
  fetchStandup: (date?: string) => apiFetch<StandupDigest>(`/api/standup${date ? `?date=${date}` : ""}`),
  patchStory: (id: string, patch: StoryPatch) =>
    apiFetch<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  postHandoff: (storyId: string) =>
    apiFetch<{ filePath: string; content: string }>(`/api/handoff/${encodeURIComponent(storyId)}`, { method: "POST" }),
};
```

- [ ] **Step 6: Create main.tsx and App.tsx**

```tsx
// packages/web/src/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useWsStore } from "./store/ws.ts";

// Read port from location, token from query param
const params = new URLSearchParams(window.location.search);
const port = window.location.port ? Number(window.location.port) : 47821;
const token = params.get("token") ?? "";
useWsStore.getState().setPort(port);
useWsStore.getState().setToken(token);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

```tsx
// packages/web/src/App.tsx
import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Topbar } from "./components/layout/Topbar.tsx";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { PlanPage } from "./pages/PlanPage.tsx";
import { SpecPage } from "./pages/SpecPage.tsx";
import { StoriesPage } from "./pages/StoriesPage.tsx";
import { StandupPage } from "./pages/StandupPage.tsx";
import { StoryPage } from "./pages/StoryPage.tsx";

function Shell() {
  useWebSocket();
  return (
    <div className="app">
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<PlanPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/story/:id" element={<StoryPage />} />
            <Route path="/spec" element={<SpecPage />} />
            <Route path="/standup" element={<StandupPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
```

- [ ] **Step 7: Create index.css (all design tokens + layout classes)**

```css
/* packages/web/src/index.css */
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

@layer base {
  :root {
    --green: #3ecf8e;
    --green-link: #00c573;
    --green-border: rgba(62, 207, 142, 0.3);
    --green-glow: rgba(62, 207, 142, 0.08);
    --green-glow-strong: rgba(62, 207, 142, 0.14);
    --bg-deepest: #0f0f0f;
    --bg: #171717;
    --bg-elevated: #1c1c1c;
    --bg-hover: #1f1f1f;
    --bg-input: #212121;
    --border-faint: #242424;
    --border: #2e2e2e;
    --border-strong: #363636;
    --border-stronger: #393939;
    --text-muted: #898989;
    --text-secondary: #b4b4b4;
    --text-primary: #fafafa;
    --text-disabled: #4d4d4d;
    --type-story: var(--green);
    --type-story-bg: var(--green-glow);
    --type-task: hsl(210, 70%, 60%);
    --type-task-bg: hsla(210, 70%, 60%, 0.1);
    --size-s: var(--text-secondary);
    --size-m: hsl(45, 80%, 62%);
    --size-l: hsl(20, 75%, 60%);
    --size-xl: hsl(0, 65%, 55%);
    --warn: hsl(45, 87%, 62%);
    --topbar-h: 48px;
    --sidebar-w: 252px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'Geist', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
}

@layer components {
  .app { display: grid; grid-template-rows: var(--topbar-h) 1fr; height: 100vh; }
  .app-body { display: grid; grid-template-columns: var(--sidebar-w) 1fr; overflow: hidden; }

  /* Topbar */
  .topbar { display: flex; align-items: center; gap: 12px; padding: 0 20px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 10; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .brand-mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg, var(--green) 0%, var(--green-link) 100%); display: flex; align-items: center; justify-content: center; }
  .brand-name { font-size: 14px; font-weight: 500; }
  .topbar-divider { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
  .phase-track { display: flex; align-items: center; gap: 8px; padding: 5px 16px; background: var(--bg-elevated); border: 1px solid var(--border-faint); border-radius: 9999px; }
  .phase-step { display: flex; align-items: center; gap: 6px; font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.1px; color: var(--text-disabled); }
  .phase-step.complete { color: var(--text-muted); }
  .phase-step.active { color: var(--green); }
  .phase-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-disabled); }
  .phase-step.active .phase-dot { background: var(--green); box-shadow: 0 0 0 3px var(--green-glow); }
  .phase-step.complete .phase-dot { background: var(--text-muted); }
  .phase-sep { width: 10px; height: 1px; background: var(--border); }
  .topbar-right { display: flex; align-items: center; gap: 12px; margin-left: auto; }
  .session-id { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-muted); }
  .connection-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 9999px; font-size: 11px; font-weight: 500; color: var(--green); }
  .connection-pill.disconnected { color: var(--text-muted); }
  .pulse-dot { width: 6px; height: 6px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }

  /* Sidebar */
  .sidebar { background: var(--bg); border-right: 1px solid var(--border); overflow-y: auto; padding: 16px 0; display: flex; flex-direction: column; }
  .nav-section { padding: 0 12px; margin-bottom: 20px; }
  .nav-label { font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); padding: 0 12px 8px; }
  .active-story { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; position: relative; }
  .active-story::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, var(--green) 0%, var(--green-link) 100%); }
  .active-story-header { padding: 12px 12px 8px; }
  .active-story-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .active-story-key { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-muted); }
  .active-status-mini { margin-left: auto; font-family: 'Source Code Pro', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--green); padding: 2px 6px; background: var(--green-glow); border: 1px solid var(--green-border); border-radius: 9999px; }
  .active-story-title { font-size: 12.5px; font-weight: 500; line-height: 1.35; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .active-story-nav { background: var(--bg); border-top: 1px solid var(--border-faint); padding: 6px; }
  .facet-nav { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 4px; color: var(--text-secondary); font-size: 13px; font-weight: 500; text-align: left; transition: all 100ms ease; position: relative; }
  .facet-nav:hover { background: var(--bg-hover); color: var(--text-primary); }
  .facet-nav.active { background: var(--bg-hover); color: var(--text-primary); }
  .facet-nav.active::before { content: ''; position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 2px; height: 12px; background: var(--green); border-radius: 0 2px 2px 0; }
  .facet-nav-icon { width: 14px; height: 14px; color: var(--text-muted); flex-shrink: 0; }
  .facet-nav.active .facet-nav-icon { color: var(--green); }
  .facet-check { margin-left: auto; width: 12px; height: 12px; color: var(--text-disabled); }
  .facet-check.has { color: var(--green); }
  .nav-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 7px 12px; border-radius: 5px; color: var(--text-secondary); font-size: 13.5px; font-weight: 500; transition: background 100ms ease, color 100ms ease; position: relative; }
  .nav-item:hover, .nav-item.active { background: var(--bg-hover); color: var(--text-primary); }
  .nav-item.active::before { content: ''; position: absolute; left: -12px; top: 50%; transform: translateY(-50%); width: 2px; height: 14px; background: var(--green); border-radius: 0 2px 2px 0; }
  .nav-badge { margin-left: auto; font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-muted); background: var(--border-faint); border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; }

  /* Main + page layout */
  .main { overflow-y: auto; background: var(--bg); }
  .page-header { padding: 20px 32px 16px; border-bottom: 1px solid var(--border-faint); }
  .breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-family: 'Source Code Pro', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); }
  .breadcrumb a { color: var(--text-muted); text-decoration: none; cursor: pointer; }
  .breadcrumb a:hover { color: var(--text-primary); }
  .breadcrumb-sep { color: var(--text-disabled); }
  .breadcrumb .current { color: var(--text-primary); }
  .type-icon { width: 16px; height: 16px; border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .type-icon.story { background: var(--type-story-bg); border: 1px solid var(--type-story); color: var(--type-story); }
  .type-icon svg { width: 9px; height: 9px; }
  .issue-key-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .issue-key { font-family: 'Source Code Pro', monospace; font-size: 12px; color: var(--text-muted); font-weight: 500; }
  .issue-title { font-size: 26px; font-weight: 400; letter-spacing: -0.4px; line-height: 1.2; margin-bottom: 16px; }
  .issue-actions-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 5px; font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; cursor: pointer; }
  .status-pill.in-progress { background: var(--green-glow); border: 1px solid var(--green-border); color: var(--green); }
  .status-pill.done { background: var(--bg-input); border: 1px solid var(--border-strong); color: var(--text-secondary); }
  .status-pill.backlog { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
  .size-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 5px; font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; cursor: pointer; }
  .size-pill .size { width: 14px; height: 14px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 500; }
  .size-pill .label { color: var(--text-secondary); }
  .size-pill.xs .size, .size-pill.s .size { color: var(--size-s); background: rgba(180,180,180,0.1); border: 1px solid var(--border-strong); }
  .size-pill.m .size { color: var(--size-m); background: rgba(212,185,74,0.1); border: 1px solid rgba(212,185,74,0.3); }
  .size-pill.l .size { color: var(--size-l); background: rgba(229,132,75,0.1); border: 1px solid rgba(229,132,75,0.3); }
  .size-pill.xl .size { color: var(--size-xl); background: rgba(180,60,60,0.1); border: 1px solid rgba(180,60,60,0.3); }

  /* Issue layout */
  .issue-layout { display: grid; grid-template-columns: 1fr 280px; }
  .issue-main { padding: 20px 32px 40px; border-right: 1px solid var(--border-faint); min-height: 600px; }
  .issue-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border-faint); }
  .tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 13px; font-weight: 500; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 120ms ease; }
  .tab:hover { color: var(--text-primary); }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--green); }
  .section-h { font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); margin: 20px 0 12px; display: flex; align-items: center; justify-content: space-between; }

  /* Hierarchy strip */
  .hierarchy-strip { display: flex; align-items: center; padding: 12px 32px; background: var(--bg-elevated); border-bottom: 1px solid var(--border-faint); }
  .hier-node { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 5px; font-size: 12px; color: var(--text-muted); cursor: pointer; border: 1px solid transparent; transition: all 120ms ease; }
  .hier-node:hover { color: var(--text-primary); background: var(--bg-hover); }
  .hier-node.active { color: var(--text-primary); background: var(--bg); border-color: var(--green-border); }
  .hier-node.active .hier-icon { color: var(--green); }
  .hier-icon { width: 14px; height: 14px; color: var(--text-muted); }
  .hier-arrow { width: 14px; height: 14px; color: var(--text-disabled); margin: 0 2px; }

  /* Plan tasks */
  .tasks { display: flex; flex-direction: column; }
  .task { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 8px; transition: border-color 120ms ease; }
  .task:hover { border-color: var(--border-strong); }
  .task.active { border-color: var(--green-border); background: linear-gradient(180deg, var(--green-glow) 0%, var(--bg-elevated) 60%); }
  .task.done { opacity: 0.7; }
  .task-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; user-select: none; cursor: pointer; }
  .task-check { width: 16px; height: 16px; border-radius: 3px; border: 1.5px solid var(--border-stronger); background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .task.done .task-check { background: var(--green); border-color: var(--green); }
  .task.active .task-check { border-color: var(--green); }
  .task.active .task-check::after { content: ''; width: 7px; height: 7px; background: var(--green); border-radius: 1px; animation: pulse-soft 1.6s infinite; }
  .task-key { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-muted); min-width: 48px; }
  .task-title { flex: 1; font-size: 14px; color: var(--text-primary); }
  .task.done .task-title { color: var(--text-muted); }
  .task-progress { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-muted); }
  .task.active .task-progress { color: var(--green); }
  .steps { padding: 0 16px 12px calc(16px + 16px + 12px); border-top: 1px solid var(--border-faint); }
  .step { display: flex; align-items: center; gap: 12px; padding: 9px 0; }
  .step + .step { border-top: 1px solid var(--border-faint); }
  .step-check { width: 13px; height: 13px; border-radius: 3px; border: 1.5px solid var(--border-stronger); background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step.done .step-check { background: var(--green); border-color: var(--green); }
  .step.current .step-check { border-color: var(--green); }
  .step.current .step-check::after { content: ''; width: 5px; height: 5px; background: var(--green); border-radius: 1px; animation: pulse-soft 1.6s infinite; }
  .step-label { flex: 1; font-size: 13px; color: var(--text-secondary); }
  .step.done .step-label { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--text-disabled); }
  .step.current .step-label { color: var(--text-primary); }
  .step-time { font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-disabled); }

  /* Right rail */
  .issue-side { padding: 20px; background: var(--bg); }
  .field-group { margin-bottom: 20px; }
  .field-group-title { font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); margin-bottom: 12px; }
  .field { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: 12.5px; }
  .field-label { color: var(--text-muted); }
  .linked-card { display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 120ms ease; margin-bottom: 8px; }
  .linked-card:hover { border-color: var(--green-border); background: var(--bg-hover); }
  .linked-card .meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .linked-card .filename { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-primary); }
  .linked-card .sub { font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-muted); }
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .progress-fill { height: 100%; background: var(--green); }

  /* Board */
  .board { display: grid; grid-template-columns: repeat(3, minmax(280px, 1fr)); gap: 16px; padding: 20px 32px 32px; }
  .column { background: var(--bg-elevated); border: 1px solid var(--border-faint); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; }
  .column-header { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 12px; margin-bottom: 8px; border-bottom: 1px solid var(--border-faint); }
  .column-title { display: flex; align-items: center; gap: 8px; font-family: 'Source Code Pro', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-secondary); font-weight: 500; }
  .column-dot { width: 6px; height: 6px; border-radius: 50%; }
  .column-dot.backlog { background: var(--text-muted); }
  .column-dot.in-progress { background: var(--green); }
  .column-dot.done { background: var(--text-secondary); }
  .column-count { font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
  .card-list { display: flex; flex-direction: column; gap: 8px; }
  .card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px; cursor: pointer; transition: all 120ms ease; }
  .card:hover { border-color: var(--border-strong); }
  .card.active { border-color: var(--green-border); background: linear-gradient(180deg, var(--green-glow) 0%, var(--bg) 60%); }
  .card-active-label { font-family: 'Source Code Pro', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1.1px; color: var(--green); display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .card-title { font-size: 13px; line-height: 1.4; color: var(--text-primary); margin-bottom: 12px; }
  .card-meta { display: flex; align-items: center; gap: 8px; }
  .card-key { display: inline-flex; align-items: center; gap: 4px; font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-muted); }
  .card-meta-right { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .card-link-icon { width: 14px; height: 14px; color: var(--text-muted); }
  .card-link-icon.active { color: var(--green); }
  .card-size { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 4px; font-family: 'Source Code Pro', monospace; font-size: 10px; font-weight: 500; }
  .card-size.xs, .card-size.s { color: var(--size-s); background: rgba(180,180,180,0.08); border: 1px solid var(--border-strong); }
  .card-size.m { color: var(--size-m); background: rgba(212,185,74,0.08); border: 1px solid rgba(212,185,74,0.3); }
  .card-size.l { color: var(--size-l); background: rgba(229,132,75,0.08); border: 1px solid rgba(229,132,75,0.3); }
  .card-size.xl { color: var(--size-xl); background: rgba(180,60,60,0.08); border: 1px solid rgba(180,60,60,0.3); }

  /* Story view */
  .story-quote { background: var(--bg-elevated); border-left: 2px solid var(--green-border); border-radius: 0 6px 6px 0; padding: 16px 20px; margin: 12px 0; font-size: 14px; color: var(--text-secondary); line-height: 1.6; }
  .story-quote .form { font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--green); margin-right: 6px; }
  .story-quote .form-text { color: var(--text-primary); }
  .story-narrative { font-size: 14.5px; line-height: 1.7; color: var(--text-secondary); }
  .ac-list { display: flex; flex-direction: column; }
  .ac-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border-faint); font-size: 13.5px; color: var(--text-secondary); line-height: 1.55; }
  .ac-item:first-child { border-top: none; }
  .ac-check { width: 14px; height: 14px; border-radius: 3px; border: 1.5px solid var(--border-stronger); flex-shrink: 0; margin-top: 3px; display: flex; align-items: center; justify-content: center; }
  .ac-item.done .ac-check { background: var(--green); border-color: var(--green); }

  /* Markdown (Spec view) */
  .markdown { font-size: 14px; line-height: 1.7; color: var(--text-secondary); }
  .markdown h1 { font-size: 22px; font-weight: 500; color: var(--text-primary); margin-bottom: 12px; }
  .markdown h2 { font-size: 17px; font-weight: 500; color: var(--text-primary); margin-top: 24px; margin-bottom: 12px; padding-top: 16px; border-top: 1px solid var(--border-faint); }
  .markdown h2:first-of-type { padding-top: 0; border-top: none; margin-top: 16px; }
  .markdown h3 { font-size: 14px; font-weight: 500; color: var(--text-primary); margin-top: 16px; margin-bottom: 8px; }
  .markdown p { margin-bottom: 12px; }
  .markdown code { font-family: 'Source Code Pro', monospace; font-size: 12.5px; background: var(--bg); border: 1px solid var(--border); color: var(--green); padding: 1px 6px; border-radius: 4px; }
  .markdown pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin: 12px 0; overflow-x: auto; }
  .markdown pre code { background: transparent; border: none; color: var(--text-secondary); font-size: 12.5px; padding: 0; }
  .markdown blockquote { border-left: 2px solid var(--green-border); padding: 6px 12px; margin: 12px 0; color: var(--text-secondary); background: var(--green-glow); border-radius: 0 4px 4px 0; }

  /* Standup */
  .report-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 32px; border-bottom: 1px solid var(--border-faint); }
  .report-date { font-family: 'Source Code Pro', monospace; font-size: 12px; color: var(--text-secondary); }
  .copy-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: var(--bg-deepest); color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: 9999px; font-size: 12px; font-weight: 500; transition: all 120ms ease; }
  .copy-btn:hover { border-color: var(--green-border); color: var(--green); }
  .copy-btn.copied { color: var(--green); background: var(--green-glow); border-color: var(--green-border); }
  .report-body { padding: 24px 32px; max-width: 1100px; }
  .report-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .report-stat { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
  .report-stat-label { font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); margin-bottom: 8px; }
  .report-stat-num { font-size: 26px; font-weight: 400; color: var(--text-primary); line-height: 1; letter-spacing: -0.5px; }
  .report-stat-num .accent { color: var(--green); }
  .report-section { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  .report-section-header { padding: 12px 20px; border-bottom: 1px solid var(--border-faint); display: flex; align-items: center; gap: 12px; }
  .report-section-title { font-family: 'Source Code Pro', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--text-primary); font-weight: 500; display: flex; align-items: center; gap: 12px; }
  .report-section-title::before { content: ''; width: 6px; height: 6px; background: var(--green); border-radius: 50%; }
  .report-section.in-progress .report-section-title::before { animation: pulse-soft 2s infinite; }
  .report-section.blockers .report-section-title::before { background: var(--warn); }
  .report-section-count { margin-left: auto; font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
  .report-rows { padding: 8px 0; }
  .report-row { display: grid; grid-template-columns: 70px 16px 1fr auto; align-items: center; gap: 12px; padding: 12px 20px; }
  .report-row + .report-row { border-top: 1px solid var(--border-faint); }
  .report-row-key { font-family: 'Source Code Pro', monospace; font-size: 11px; color: var(--text-muted); }
  .report-row-text { font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
  .report-row-meta { font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-disabled); }

  /* Animations */
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(62, 207, 142, 0.5); }
    70% { box-shadow: 0 0 0 5px rgba(62, 207, 142, 0); }
    100% { box-shadow: 0 0 0 0 rgba(62, 207, 142, 0); }
  }
  @keyframes pulse-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
}
```

- [ ] **Step 8: Create skeleton layout components (Topbar + Sidebar)**

```tsx
// packages/web/src/components/layout/Topbar.tsx
import { useWsStore } from "../../store/ws.ts";

const PHASES = ["brainstorm", "spec", "plan", "implement"] as const;

export function Topbar() {
  const { connectionStatus, phase, sessionId } = useWsStore();
  const phaseIdx = phase ? PHASES.indexOf(phase) : -1;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
            <path d="M6 4 L18 12 L6 20 Z" fill="#0f0f0f" />
          </svg>
        </div>
        <span className="brand-name">Throughline</span>
      </div>

      <div className="topbar-divider" />

      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div className="phase-track">
          {PHASES.map((p, i) => (
            <>
              {i > 0 && <div key={`sep-${p}`} className="phase-sep" />}
              <div
                key={p}
                className={`phase-step${i < phaseIdx ? " complete" : ""}${i === phaseIdx ? " active" : ""}`}
              >
                <span className="phase-dot" />
                {p}
              </div>
            </>
          ))}
        </div>
      </div>

      <div className="topbar-right">
        {sessionId && (
          <span className="session-id">
            <span style={{ color: "var(--text-disabled)", textTransform: "uppercase", fontSize: 9, marginRight: 4 }}>SESSION</span>
            {sessionId.slice(0, 10)}
          </span>
        )}
        <span className={`connection-pill${connectionStatus === "disconnected" ? " disconnected" : ""}`}>
          {connectionStatus === "live" && <span className="pulse-dot" />}
          {connectionStatus === "live" ? "Live" : "Disconnected"}
        </span>
      </div>
    </header>
  );
}
```

```tsx
// packages/web/src/components/layout/Sidebar.tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api.ts";
import { useWsStore } from "../../store/ws.ts";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeStoryId } = useWsStore();

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });

  const { data: activeStory } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const currentPath = location.hash.replace("#", "") || "/";
  const totalStories = stories.length;

  return (
    <aside className="sidebar">
      <div className="nav-section">
        <div className="nav-label">Active Story</div>
        {activeStory ? (
          <div className="active-story">
            <div className="active-story-header">
              <div className="active-story-top">
                <div className="type-icon story">
                  <svg viewBox="0 0 9 9" fill="currentColor"><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
                </div>
                <span className="active-story-key">{activeStory.id}</span>
                <span className="active-status-mini">{activeStory.status}</span>
              </div>
              <div className="active-story-title">{activeStory.title}</div>
            </div>
            <div className="active-story-nav">
              {(["story", "spec", "plan"] as const).map((facet) => (
                <button
                  key={facet}
                  className={`facet-nav${currentPath === `/${facet}` || (facet === "plan" && currentPath === "/") ? " active" : ""}`}
                  onClick={() => navigate(facet === "plan" ? "/" : `/${facet}`)}
                >
                  <span className="facet-nav-icon">
                    {facet === "story" && <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>}
                    {facet === "spec" && <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>}
                    {facet === "plan" && <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" /></svg>}
                  </span>
                  {facet.charAt(0).toUpperCase() + facet.slice(1)}
                  <svg
                    className={`facet-check${facet === "story" || (facet === "spec" && activeStory.linked_spec_path) || (facet === "plan" && activeStory.linked_plan_path) ? " has" : ""}`}
                    viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
                  >
                    <path d="M2 6 L5 9 L10 3" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px", color: "var(--text-muted)", fontSize: 12 }}>No active story yet</div>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-label">Workspace</div>
        <button
          className={`nav-item${currentPath === "/stories" ? " active" : ""}`}
          onClick={() => navigate("/stories")}
        >
          <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="3.5" height="11" rx=".5" />
            <rect x="6.5" y="2.5" width="3.5" height="8" rx=".5" />
            <rect x="11" y="2.5" width="3" height="6" rx=".5" />
          </svg>
          All Stories
          <span className="nav-badge">{totalStories}</span>
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-label">Reports</div>
        <button
          className={`nav-item${currentPath === "/standup" ? " active" : ""}`}
          onClick={() => navigate("/standup")}
        >
          <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 13 L6 8 L9 11 L14 4" />
            <path d="M11 4h3v3" />
          </svg>
          Standup
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 9: Run the WS tests, confirm they pass**

Run: `cd packages/web && pnpm test run src/__tests__/useWebSocket.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 10: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: build succeeds (pages are stub exports — create minimal stubs for each page if needed)

Create stub pages so App.tsx compiles:
```tsx
// packages/web/src/pages/PlanPage.tsx
export function PlanPage() { return <div>Plan</div>; }
// packages/web/src/pages/StoriesPage.tsx
export function StoriesPage() { return <div>Stories</div>; }
// packages/web/src/pages/StoryPage.tsx
export function StoryPage() { return <div>Story</div>; }
// packages/web/src/pages/SpecPage.tsx
export function SpecPage() { return <div>Spec</div>; }
// packages/web/src/pages/StandupPage.tsx
export function StandupPage() { return <div>Standup</div>; }
```

- [ ] **Step 11: Commit**

```bash
git add packages/web/src/
git commit -m "feat(web): global shell — CSS tokens, Topbar, Sidebar, WS hook, Zustand store, api.ts"
```

---

## Task 8: Shared Components + Plan View

**Files:**
- Create: `packages/web/src/components/shared/TypeIcon.tsx`
- Create: `packages/web/src/components/shared/StatusPill.tsx`
- Create: `packages/web/src/components/shared/SizePill.tsx`
- Create: `packages/web/src/components/shared/LinkedCard.tsx`
- Create: `packages/web/src/components/shared/HierarchyStrip.tsx`
- Create: `packages/web/src/components/shared/TaskCard.tsx`
- Create: `packages/web/src/components/shared/StepRow.tsx`
- Modify: `packages/web/src/pages/PlanPage.tsx`

- [ ] **Step 1: Create shared components**

```tsx
// packages/web/src/components/shared/TypeIcon.tsx
type Props = { type: "story" | "task" };
export function TypeIcon({ type }: Props) {
  return (
    <div className={`type-icon ${type}`}>
      {type === "story" && (
        <svg viewBox="0 0 9 9" fill="currentColor"><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
      )}
      {type === "task" && (
        <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="7" height="7" rx="1" /></svg>
      )}
    </div>
  );
}
```

```tsx
// packages/web/src/components/shared/StatusPill.tsx
type Status = "backlog" | "in-progress" | "done";
type Props = { status: Status; onClick?: () => void };

const labels: Record<Status, string> = { backlog: "Backlog", "in-progress": "In Progress", done: "Done" };

export function StatusPill({ status, onClick }: Props) {
  return (
    <button className={`status-pill ${status}`} onClick={onClick}>
      {status === "in-progress" && (
        <svg viewBox="0 0 10 10" fill="currentColor" style={{ width: 8, height: 8 }}><circle cx="5" cy="5" r="2" /></svg>
      )}
      {labels[status]}
      {onClick && (
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 9, height: 9 }}>
          <path d="M3 4 L5 6 L7 4" />
        </svg>
      )}
    </button>
  );
}
```

```tsx
// packages/web/src/components/shared/SizePill.tsx
import type { StorySize } from "@cc/shared";

type Props = { size: StorySize | null; onClick?: () => void };

const labels: Record<StorySize, string> = { XS: "X-Small", S: "Small", M: "Medium", L: "Large", XL: "X-Large" };

export function SizePill({ size, onClick }: Props) {
  if (!size) return null;
  return (
    <button className={`size-pill ${size.toLowerCase()}`} onClick={onClick}>
      <span className="size">{size}</span>
      <span className="label">{labels[size]}</span>
    </button>
  );
}
```

```tsx
// packages/web/src/components/shared/LinkedCard.tsx
import { useNavigate } from "react-router-dom";

type Props = {
  icon: "story" | "spec" | "plan";
  filename: string;
  sub?: string;
  progress?: number;
  to: string;
};

const icons = {
  story: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>,
  spec: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>,
  plan: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14, color: "var(--green)" }}><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5M4.5 9.5h3" /></svg>,
};

export function LinkedCard({ icon, filename, sub, progress, to }: Props) {
  const navigate = useNavigate();
  return (
    <div className="linked-card" onClick={() => navigate(to)} style={{ marginBottom: 8 }}>
      {icons[icon]}
      <div className="meta">
        <span className="filename">{filename}</span>
        {sub && <span className="sub">{sub}</span>}
        {progress !== undefined && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <svg style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 3 L8 6 L4 9" />
      </svg>
    </div>
  );
}
```

```tsx
// packages/web/src/components/shared/HierarchyStrip.tsx
import { useNavigate } from "react-router-dom";

type Node = { label: "Story" | "Spec" | "Plan"; to: string; active?: boolean; meta?: string };
type Props = { nodes: Node[] };

const nodeIcons = {
  Story: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>,
  Spec: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>,
  Plan: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" /></svg>,
};

const arrowIcon = (
  <svg className="hier-arrow" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7h8M8 4l3 3-3 3" />
  </svg>
);

export function HierarchyStrip({ nodes }: Props) {
  const navigate = useNavigate();
  return (
    <div className="hierarchy-strip">
      {nodes.map((node, i) => (
        <>
          {i > 0 && arrowIcon}
          <button
            key={node.label}
            className={`hier-node${node.active ? " active" : ""}`}
            onClick={() => navigate(node.to)}
          >
            {nodeIcons[node.label]}
            {node.label}
            {node.meta && <span className="hier-meta" style={{ marginLeft: 4 }}>{node.meta}</span>}
          </button>
        </>
      ))}
    </div>
  );
}
```

```tsx
// packages/web/src/components/shared/StepRow.tsx
type StepState = "done" | "current" | "todo";
type Props = { label: string; state: StepState; time?: string };

export function StepRow({ label, state, time }: Props) {
  return (
    <div className={`step ${state}`}>
      <div className="step-check">
        {state === "done" && (
          <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 9, height: 9, color: "var(--bg-deepest)" }}>
            <path d="M1.5 4.5 L3.5 6.5 L7 3" />
          </svg>
        )}
      </div>
      <span className="step-label">{label}</span>
      {time && <span className="step-time">{time}</span>}
    </div>
  );
}
```

```tsx
// packages/web/src/components/shared/TaskCard.tsx
import { useState } from "react";
import type { PlanTask } from "@cc/shared";
import { StepRow } from "./StepRow.tsx";

type Props = { task: PlanTask; taskIndex: number };

function getTaskState(task: PlanTask): "done" | "active" | "todo" {
  if (task.steps.every((s) => s.state === "done")) return "done";
  if (task.steps.some((s) => s.state !== "todo")) return "active";
  return "todo";
}

function countDone(task: PlanTask) {
  return task.steps.filter((s) => s.state === "done").length;
}

export function TaskCard({ task, taskIndex }: Props) {
  const [expanded, setExpanded] = useState(false);
  const state = getTaskState(task);
  const doneSteps = countDone(task);

  return (
    <div className={`task${state === "done" ? " done" : ""}${state === "active" ? " active" : ""}${expanded ? " expanded" : ""}`}>
      <div className="task-header" onClick={() => setExpanded((e) => !e)}>
        <div className="task-check">
          {state === "done" && (
            <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11, color: "var(--bg-deepest)", display: "block" }}>
              <path d="M2 5.5 L4.5 8 L9 3" />
            </svg>
          )}
        </div>
        <span className="task-key">T{taskIndex + 1}</span>
        <span className="task-title">{task.title}</span>
        <span className="task-progress">{doneSteps}/{task.steps.length}</span>
        <div className="task-toggle">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 200ms ease" }}>
            <path d="M4 3 L8 6 L4 9" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="steps">
          {task.steps.map((step, i) => {
            const isCurrentStep = state === "active" && step.state !== "done" &&
              !task.steps.slice(i + 1).some((s) => s.state === "done");
            return (
              <StepRow
                key={i}
                label={step.label}
                state={step.state === "done" ? "done" : isCurrentStep ? "current" : "todo"}
                time={step.completed_at ? new Date(step.completed_at).toLocaleTimeString() : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement PlanPage**

```tsx
// packages/web/src/pages/PlanPage.tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { SizePill } from "../components/shared/SizePill.tsx";
import { StatusPill } from "../components/shared/StatusPill.tsx";
import { TaskCard } from "../components/shared/TaskCard.tsx";
import { TypeIcon } from "../components/shared/TypeIcon.tsx";
import { api } from "../lib/api.ts";
import { useWsStore } from "../store/ws.ts";
import type { PlanData } from "@cc/shared";

export function PlanPage() {
  const { activeStoryId } = useWsStore();
  const navigate = useNavigate();

  const { data: story } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const planPath = story?.linked_plan_path ?? null;

  const { data: plan } = useQuery({
    queryKey: ["plan", planPath],
    queryFn: () => api.fetchPlan(planPath!),
    enabled: !!planPath,
  }) as { data: PlanData | undefined };

  if (!activeStoryId || !story) {
    return (
      <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>
        No active story. Open a story from the board or start a new session.
      </div>
    );
  }

  const tasks = plan?.tasks ?? [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.steps.every((s) => s.state === "done")).length;
  const totalSteps = tasks.reduce((n, t) => n + t.steps.length, 0);
  const doneSteps = tasks.reduce((n, t) => n + t.steps.filter((s) => s.state === "done").length, 0);

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate("/stories")}>Stories</a>
          <span className="breadcrumb-sep">/</span>
          <a onClick={() => navigate(`/story/${story.id}`)}>{story.id}</a>
          <span className="breadcrumb-sep">/</span>
          <span className="current">Plan</span>
        </div>
        <div className="issue-key-row">
          <TypeIcon type="story" />
          <span className="issue-key">{story.id}</span>
        </div>
        <h1 className="issue-title">{story.title}</h1>
        <div className="issue-actions-row">
          <StatusPill status={story.status as "backlog" | "in-progress" | "done"} />
          <SizePill size={story.size} />
        </div>
      </div>

      <HierarchyStrip nodes={[
        { label: "Story", to: `/story/${story.id}` },
        { label: "Spec", to: "/spec", meta: story.linked_spec_path ? undefined : "absent" },
        { label: "Plan", to: "/", active: true, meta: totalTasks ? `${Math.round(doneTasks / totalTasks * 100)}%` : undefined },
      ]} />

      <div className="issue-layout">
        <div className="issue-main">
          <div className="issue-tabs">
            <button className="tab" onClick={() => navigate(`/story/${story.id}`)}>
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>
              Story
            </button>
            <button className="tab" onClick={() => navigate("/spec")}>
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>
              Spec
            </button>
            <button className="tab active">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" /></svg>
              Plan <span className="tab-count">{totalTasks}</span>
            </button>
          </div>

          {!planPath ? (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>
              This story doesn't have a plan yet.
            </div>
          ) : (
            <div className="tasks">
              {tasks.map((task, i) => (
                <TaskCard key={i} task={task} taskIndex={i} />
              ))}
            </div>
          )}
        </div>

        <aside className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Parent Documents</div>
            <LinkedCard icon="story" filename={story.id} sub={story.title} to={`/story/${story.id}`} />
            {story.linked_spec_path && (
              <LinkedCard icon="spec" filename="spec.md" sub="specification" to="/spec" />
            )}
          </div>
          {totalTasks > 0 && (
            <div className="field-group">
              <div className="field-group-title">Plan Progress</div>
              <div className="field"><span className="field-label">Tasks</span><span>{doneTasks} of {totalTasks} done</span></div>
              <div className="field"><span className="field-label">Steps</span><span>{doneSteps} of {totalSteps} done</span></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/shared/ packages/web/src/pages/PlanPage.tsx
git commit -m "feat(web): shared components + Plan view with TaskCard, StepRow, HierarchyStrip"
```

---

## Task 9: Stories Board

**Files:**
- Create: `packages/web/src/components/stories/StoryCard.tsx`
- Create: `packages/web/src/components/stories/KanbanColumn.tsx`
- Modify: `packages/web/src/pages/StoriesPage.tsx`

- [ ] **Step 1: Create StoryCard**

```tsx
// packages/web/src/components/stories/StoryCard.tsx
import { useNavigate } from "react-router-dom";
import type { Story } from "@cc/shared";
import { useWsStore } from "../../store/ws.ts";

type Props = { story: Story };

function sizeClass(size: string | null) {
  return size ? size.toLowerCase() : "";
}

export function StoryCard({ story }: Props) {
  const navigate = useNavigate();
  const { activeStoryId } = useWsStore();
  const isActive = story.id === activeStoryId;

  const handleClick = () => {
    if (isActive) navigate("/");
    else navigate(`/story/${story.id}`);
  };

  return (
    <div className={`card${isActive ? " active" : ""}`} onClick={handleClick}>
      {isActive && (
        <div className="card-active-label">
          <span className="pulse-dot" style={{ width: 5, height: 5 }} />
          Active Session
        </div>
      )}
      <div className="card-title">{story.title}</div>
      <div className="card-meta">
        <span className="card-key">
          <div className="type-icon story" style={{ width: 12, height: 12 }}>
            <svg viewBox="0 0 9 9" fill="currentColor" style={{ width: 7, height: 7 }}><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
          </div>
          {story.id}
        </span>
        <div className="card-meta-right">
          <div className={`card-link-icon${story.linked_spec_path ? " active" : ""}`}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 11, height: 11 }}>
              <path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" />
            </svg>
          </div>
          <div className={`card-link-icon${story.linked_plan_path ? " active" : ""}`}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 11, height: 11 }}>
              <rect x="2" y="2.5" width="10" height="9" rx=".5" />
            </svg>
          </div>
          {story.size && (
            <div className={`card-size ${sizeClass(story.size)}`}>{story.size}</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create KanbanColumn**

```tsx
// packages/web/src/components/stories/KanbanColumn.tsx
import type { Story } from "@cc/shared";
import { StoryCard } from "./StoryCard.tsx";

type Status = "backlog" | "in-progress" | "done";
type Props = { status: Status; stories: Story[] };

const labels: Record<Status, string> = { backlog: "Backlog", "in-progress": "In Progress", done: "Done" };

export function KanbanColumn({ status, stories }: Props) {
  const dotClass = status === "in-progress" ? "in-progress" : status;
  return (
    <div className="column">
      <div className="column-header">
        <div className="column-title">
          <div className={`column-dot ${dotClass}`} />
          {labels[status]}
        </div>
        <span className="column-count">{stories.length}</span>
      </div>
      <div className="card-list">
        {stories.length === 0 ? (
          <div style={{ color: "var(--text-disabled)", fontSize: 12, padding: "8px 4px" }}>No stories</div>
        ) : (
          stories.map((s) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement StoriesPage**

```tsx
// packages/web/src/pages/StoriesPage.tsx
import { useQuery } from "@tanstack/react-query";
import type { Story } from "@cc/shared";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";

export function StoriesPage() {
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });

  if (isLoading) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading…</div>;

  const byStatus = (status: string) => stories.filter((s: Story) => s.status === status);

  return (
    <div>
      <div className="page-header">
        <h1 className="issue-title" style={{ fontSize: 20 }}>Stories</h1>
      </div>
      <div className="board">
        <KanbanColumn status="backlog" stories={byStatus("backlog")} />
        <KanbanColumn status="in-progress" stories={byStatus("in-progress")} />
        <KanbanColumn status="done" stories={byStatus("done")} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/stories/ packages/web/src/pages/StoriesPage.tsx
git commit -m "feat(web): Stories Board with Kanban columns and StoryCard"
```

---

## Task 10: Story View

**Files:**
- Modify: `packages/web/src/pages/StoryPage.tsx`

- [ ] **Step 1: Implement StoryPage**

```tsx
// packages/web/src/pages/StoryPage.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { SizePill } from "../components/shared/SizePill.tsx";
import { StatusPill } from "../components/shared/StatusPill.tsx";
import { TypeIcon } from "../components/shared/TypeIcon.tsx";
import { api } from "../lib/api.ts";
import type { StorySize } from "@cc/shared";

type Status = "backlog" | "in-progress" | "done";
const STATUSES: Status[] = ["backlog", "in-progress", "done"];
const SIZES: (StorySize | null)[] = [null, "XS", "S", "M", "L", "XL"];

function parseStoryBody(body: string) {
  const lines = body.split("\n");
  const asLine = lines.findIndex((l) => /^as\b/i.test(l.trim()));
  const iwLine = lines.findIndex((l) => /^i want\b/i.test(l.trim()));
  const stLine = lines.findIndex((l) => /^so that\b/i.test(l.trim()));
  const hasUserStory = asLine !== -1 && iwLine !== -1;

  const acStart = lines.findIndex((l) => /^##?\s+acceptance criteria/i.test(l));
  const bgStart = lines.findIndex((l) => /^##?\s+background/i.test(l));

  return { asLine, iwLine, stLine, hasUserStory, acStart, bgStart, lines };
}

export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);

  const { data: story, isLoading } = useQuery({
    queryKey: ["story", id],
    queryFn: () => api.fetchStory(id!),
    enabled: !!id,
  });

  const patchMutation = useMutation({
    mutationFn: (patch: { status?: string; size?: StorySize | null }) =>
      api.patchStory(id!, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["story", id] });
      const prev = queryClient.getQueryData(["story", id]);
      queryClient.setQueryData(["story", id], (old: typeof story) => ({ ...old, ...patch }));
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      queryClient.setQueryData(["story", id], ctx?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["story", id] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });

  if (isLoading || !story) {
    return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading…</div>;
  }

  const { hasUserStory, asLine, iwLine, stLine, acStart, bgStart, lines } = parseStoryBody(story.body);
  const acLines = acStart !== -1
    ? lines.slice(acStart + 1).filter((l) => l.trim().startsWith("- ["))
    : [];
  const doneAc = acLines.filter((l) => l.includes("- [x]")).length;

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate("/stories")}>Stories</a>
          <span className="breadcrumb-sep">/</span>
          <span className="current">{story.id}</span>
        </div>
        <div className="issue-key-row">
          <TypeIcon type="story" />
          <span className="issue-key">{story.id}</span>
        </div>
        <h1 className="issue-title">{story.title}</h1>
        <div className="issue-actions-row" style={{ position: "relative" }}>
          <div style={{ position: "relative" }}>
            <StatusPill
              status={story.status as Status}
              onClick={() => setShowStatusMenu((v) => !v)}
            />
            {showStatusMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4, minWidth: 140 }}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", fontSize: 13, color: s === story.status ? "var(--green)" : "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => { patchMutation.mutate({ status: s }); setShowStatusMenu(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <SizePill size={story.size} onClick={() => setShowSizeMenu((v) => !v)} />
            {showSizeMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4, minWidth: 120 }}>
                {SIZES.map((s) => (
                  <button
                    key={s ?? "null"}
                    style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", fontSize: 13, color: s === story.size ? "var(--green)" : "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => { patchMutation.mutate({ size: s }); setShowSizeMenu(false); }}
                  >
                    {s ?? "—"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <HierarchyStrip nodes={[
        { label: "Story", to: `/story/${story.id}`, active: true },
        { label: "Spec", to: "/spec" },
        { label: "Plan", to: "/" },
      ]} />

      <div className="issue-layout">
        <div className="issue-main">
          <div className="issue-tabs">
            <button className="tab active">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>
              Story
            </button>
            <button className="tab" onClick={() => navigate("/spec")}>Spec</button>
            <button className="tab" onClick={() => navigate("/")}>Plan</button>
          </div>

          {hasUserStory && (
            <>
              <div className="section-h"><span>User Story</span></div>
              <div className="story-quote">
                {asLine !== -1 && <><span className="form">AS</span><span className="form-text">{lines[asLine].replace(/^as\s*/i, "")}</span><br /></>}
                {iwLine !== -1 && <><span className="form">I WANT</span><span className="form-text">{lines[iwLine].replace(/^i want\s*/i, "")}</span><br /></>}
                {stLine !== -1 && <><span className="form">SO THAT</span><span className="form-text">{lines[stLine].replace(/^so that\s*/i, "")}</span></>}
              </div>
            </>
          )}

          {bgStart !== -1 && (
            <>
              <div className="section-h"><span>Background</span></div>
              <div className="story-narrative">
                {lines.slice(bgStart + 1, acStart !== -1 ? acStart : undefined)
                  .filter((l) => l.trim() && !l.startsWith("#"))
                  .map((l, i) => <p key={i}>{l}</p>)}
              </div>
            </>
          )}

          {acLines.length > 0 && (
            <>
              <div className="section-h">
                <span>Acceptance Criteria</span>
                <span style={{ color: "var(--green)" }}>{doneAc} / {acLines.length} verified</span>
              </div>
              <ul className="ac-list">
                {acLines.map((l, i) => {
                  const done = l.includes("- [x]");
                  const text = l.replace(/^- \[.?\]\s*/, "");
                  return (
                    <li key={i} className={`ac-item${done ? " done" : ""}`}>
                      <span className="ac-check">
                        {done && (
                          <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 9, height: 9 }}>
                            <path d="M1.5 4.5 L3.5 6.5 L7 3" />
                          </svg>
                        )}
                      </span>
                      {text}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <aside className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Derived Documents</div>
            {story.linked_spec_path && <LinkedCard icon="spec" filename="spec.md" sub="specification" to="/spec" />}
            {story.linked_plan_path && <LinkedCard icon="plan" filename={story.linked_plan_path.split("/").pop() ?? "plan"} sub="implementation plan" to="/" />}
            {!story.linked_spec_path && !story.linked_plan_path && (
              <div style={{ color: "var(--text-disabled)", fontSize: 12 }}>No linked documents yet</div>
            )}
          </div>
          <div className="field-group">
            <div className="field-group-title">Frontmatter</div>
            <div style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <div><span style={{ color: "var(--text-disabled)" }}>id:</span> {story.id}</div>
              <div><span style={{ color: "var(--text-disabled)" }}>status:</span> {story.status}</div>
              {story.size && <div><span style={{ color: "var(--text-disabled)" }}>size:</span> {story.size}</div>}
              {story.linked_spec_path && <div><span style={{ color: "var(--text-disabled)" }}>spec:</span> {story.linked_spec_path.split("/").pop()}</div>}
              {story.linked_plan_path && <div><span style={{ color: "var(--text-disabled)" }}>plan:</span> {story.linked_plan_path.split("/").pop()}</div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/StoryPage.tsx
git commit -m "feat(web): Story view with user story rendering, AC checklist, editable status/size"
```

---

## Task 11: Spec View

**Files:**
- Modify: `packages/web/src/pages/SpecPage.tsx`

- [ ] **Step 1: Install react-markdown type dependencies** (already in package.json, just verify)

Run: `cd packages/web && pnpm list react-markdown rehype-highlight`
Expected: both listed

- [ ] **Step 2: Implement SpecPage**

```tsx
// packages/web/src/pages/SpecPage.tsx
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { useNavigate } from "react-router-dom";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { SizePill } from "../components/shared/SizePill.tsx";
import { StatusPill } from "../components/shared/StatusPill.tsx";
import { TypeIcon } from "../components/shared/TypeIcon.tsx";
import { api } from "../lib/api.ts";
import { useWsStore } from "../store/ws.ts";

export function SpecPage() {
  const { activeStoryId } = useWsStore();
  const navigate = useNavigate();

  const { data: story } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const specPath = story?.linked_spec_path ?? null;

  const { data: spec } = useQuery({
    queryKey: ["spec", specPath],
    queryFn: () => api.fetchSpec(specPath!),
    enabled: !!specPath,
  });

  if (!story) {
    return <div style={{ padding: "32px", color: "var(--text-muted)" }}>No active story.</div>;
  }

  if (!specPath) {
    return (
      <div style={{ padding: "32px", color: "var(--text-muted)" }}>
        This story doesn't have a spec yet.
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate("/stories")}>Stories</a>
          <span className="breadcrumb-sep">/</span>
          <a onClick={() => navigate(`/story/${story.id}`)}>{story.id}</a>
          <span className="breadcrumb-sep">/</span>
          <span className="current">Spec</span>
        </div>
        <div className="issue-key-row">
          <TypeIcon type="story" />
          <span className="issue-key">{story.id}</span>
        </div>
        <h1 className="issue-title">{story.title}</h1>
        <div className="issue-actions-row">
          <StatusPill status={story.status as "backlog" | "in-progress" | "done"} />
          <SizePill size={story.size} />
        </div>
      </div>

      <HierarchyStrip nodes={[
        { label: "Story", to: `/story/${story.id}` },
        { label: "Spec", to: "/spec", active: true },
        { label: "Plan", to: "/" },
      ]} />

      <div className="issue-layout">
        <div className="issue-main">
          <div className="issue-tabs">
            <button className="tab" onClick={() => navigate(`/story/${story.id}`)}>Story</button>
            <button className="tab active">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}>
                <path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" />
                <path d="M9 1.5v2.5h2.5" />
              </svg>
              Spec
            </button>
            <button className="tab" onClick={() => navigate("/")}>Plan</button>
          </div>

          <div className="markdown">
            {spec?.content ? (
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {spec.content}
              </ReactMarkdown>
            ) : (
              <div style={{ color: "var(--text-muted)" }}>Loading spec…</div>
            )}
          </div>
        </div>

        <aside className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Parent Story</div>
            <LinkedCard icon="story" filename={story.id} sub={story.title} to={`/story/${story.id}`} />
          </div>
          {story.linked_plan_path && (
            <div className="field-group">
              <div className="field-group-title">Derived Plan</div>
              <LinkedCard icon="plan" filename={story.linked_plan_path.split("/").pop() ?? "plan"} sub="implementation plan" to="/" />
            </div>
          )}
          <div className="field-group">
            <div className="field-group-title">Spec Metadata</div>
            <div style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <div><span style={{ color: "var(--text-disabled)" }}>path:</span> {specPath.split("/").pop()}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/SpecPage.tsx
git commit -m "feat(web): Spec view with react-markdown + rehype-highlight rendering"
```

---

## Task 12: Standup View

**Files:**
- Create: `packages/web/src/components/standup/StandupSection.tsx`
- Create: `packages/web/src/components/standup/StatsGrid.tsx`
- Modify: `packages/web/src/pages/StandupPage.tsx`

- [ ] **Step 1: Create StatsGrid**

```tsx
// packages/web/src/components/standup/StatsGrid.tsx
type Stat = { label: string; value: number; accent?: boolean };
type Props = { stats: Stat[] };

export function StatsGrid({ stats }: Props) {
  return (
    <div className="report-stat-grid">
      {stats.map((s) => (
        <div key={s.label} className="report-stat">
          <div className="report-stat-label">{s.label}</div>
          <div className="report-stat-num">
            {s.accent ? <span className="accent">{s.value}</span> : s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create StandupSection**

```tsx
// packages/web/src/components/standup/StandupSection.tsx
import type { StandupItem } from "@cc/shared";

type Variant = "shipped" | "in-progress" | "blockers";
type Props = { variant: Variant; items: StandupItem[] };

const titles: Record<Variant, string> = {
  shipped: "Shipped Yesterday",
  "in-progress": "In Progress",
  blockers: "Blockers",
};

export function StandupSection({ variant, items }: Props) {
  return (
    <div className={`report-section ${variant}`}>
      <div className="report-section-header">
        <div className="report-section-title">{titles[variant]}</div>
        <span className="report-section-count">{items.length}</span>
      </div>
      <div className="report-rows">
        {items.length === 0 ? (
          <div className="report-row" style={{ color: "var(--text-disabled)", gridTemplateColumns: "1fr" }}>
            (none)
          </div>
        ) : (
          items.map((item) => (
            <div key={item.storyId} className="report-row">
              <span className="report-row-key">{item.storyId.split("-").slice(0, 4).join("-")}</span>
              <div className="type-icon story" style={{ width: 16, height: 16 }}>
                <svg viewBox="0 0 9 9" fill="currentColor" style={{ width: 9, height: 9 }}><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
              </div>
              <span className="report-row-text">
                <strong>{item.title}</strong>
                {" — "}
                {item.detail}
              </span>
              <span className="report-row-meta">{item.size ?? "—"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement StandupPage**

```tsx
// packages/web/src/pages/StandupPage.tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { StandupDigest } from "@cc/shared";
import { StandupSection } from "../components/standup/StandupSection.tsx";
import { StatsGrid } from "../components/standup/StatsGrid.tsx";
import { api } from "../lib/api.ts";

function formatDigest(digest: StandupDigest): string {
  const fmt = (items: StandupDigest["shipped"]) =>
    items.length === 0
      ? "(none)"
      : items.map((i) => `- ${i.storyId} (${i.size ?? "—"}) — ${i.detail}`).join("\n");

  return [
    `## Standup — ${digest.date}`,
    "",
    "### Shipped Yesterday",
    fmt(digest.shipped),
    "",
    "### In Progress",
    fmt(digest.inProgress),
    "",
    "### Blockers",
    fmt(digest.blockers),
  ].join("\n");
}

export function StandupPage() {
  const [copied, setCopied] = useState(false);

  const { data: digest, isLoading } = useQuery({
    queryKey: ["standup"],
    queryFn: () => api.fetchStandup(),
    staleTime: 0,
  });

  const handleCopy = async () => {
    if (!digest) return;
    await navigator.clipboard.writeText(formatDigest(digest));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (isLoading || !digest) {
    return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading standup…</div>;
  }

  return (
    <div>
      <div className="report-toolbar">
        <span className="report-date">
          <span style={{ color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: 1, fontSize: 9, marginRight: 6 }}>DATE</span>
          {digest.date}
        </span>
        <button className={`copy-btn${copied ? " copied" : ""}`} onClick={handleCopy}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 12, height: 12 }}>
            <rect x="4" y="4" width="7" height="7" rx="1" />
            <path d="M8 4V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h2" />
          </svg>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="report-body">
        <StatsGrid stats={[
          { label: "Shipped Yesterday", value: digest.shipped.length, accent: digest.shipped.length > 0 },
          { label: "In Progress", value: digest.inProgress.length },
          { label: "Blockers", value: digest.blockers.length },
        ]} />

        <StandupSection variant="shipped" items={digest.shipped} />
        <StandupSection variant="in-progress" items={digest.inProgress} />
        <StandupSection variant="blockers" items={digest.blockers} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `cd packages/web && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/standup/ packages/web/src/pages/StandupPage.tsx
git commit -m "feat(web): Standup view with StatsGrid, section cards, and copy-to-clipboard"
```

---

## Task 13: SPA Catch-All + Root Build Integration

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: root `package.json`

- [ ] **Step 1: Add SPA catch-all to server.ts**

In `packages/server/src/server.ts`, after the `/api/` block and before the final `return new Response("Not Found", { status: 404 })`:

```ts
// Add this import at the top of server.ts:
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Add this block inside the fetch handler, just before the final 404 return:
if (req.method === "GET") {
  try {
    const webDist = join(import.meta.dir, "../../../web/dist");
    const indexHtml = readFileSync(join(webDist, "index.html"), "utf-8");
    return new Response(indexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    // dist not built yet — fall through to 404
  }
}
```

- [ ] **Step 2: Add build script to root package.json**

```json
// In root package.json scripts, add:
"build": "pnpm --filter @cc/web build"
```

The full scripts section becomes:
```json
"scripts": {
  "dev": "cd packages/server && bun run --watch src/index.ts",
  "build": "pnpm --filter @cc/web build",
  "test": "pnpm -r test",
  "lint": "bunx biome check ."
}
```

- [ ] **Step 3: Build and smoke test**

```bash
# Build the SPA
pnpm build

# Start the daemon in background
bun run packages/server/src/index.ts &
sleep 1

# Read the port
PORT=$(jq -r .port ~/.throughline/runtime.json)
TOKEN=$(jq -r .token ~/.throughline/runtime.json)

# Verify dashboard is served
curl -s -H "Authorization: Bearer $TOKEN" -H "Host: 127.0.0.1:$PORT" \
  "http://127.0.0.1:$PORT/" | grep -q "Throughline" && echo "SPA served OK" || echo "SPA not found"

# Verify API still works alongside SPA
curl -s -H "Authorization: Bearer $TOKEN" -H "Host: 127.0.0.1:$PORT" \
  "http://127.0.0.1:$PORT/api/healthz"

# Kill the background daemon
kill %1
```

Expected: "SPA served OK" and `{"status":"ok"}`

- [ ] **Step 4: Run full backend test suite to confirm no regressions**

Run: `cd packages/server && bun test`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts package.json
git commit -m "feat(server): serve SPA from packages/web/dist/ with GET catch-all"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `packages/web` new Vite workspace | Task 6 |
| Five views: Plan, Story, Spec, Stories Board, Standup | Tasks 8–12 |
| server.ts SPA catch-all | Task 13 |
| StandupService — previous-day digest | Task 2 |
| HandoffService — markdown generator | Task 3 |
| `GET /api/standup`, `POST /api/handoff/:id`, `GET /api/handoffs` | Task 4 |
| `/throughline:standup` and `/throughline:handoff` commands | Task 5 |
| Size enum XS\|S\|M\|L\|XL\|null | Task 1 |
| DB handoffs table (003 migration) | Task 1 |
| WS integration: plan.changed / story.changed cache invalidation | Task 7 |
| Exponential backoff WS reconnect | Task 7 |
| Optimistic status/size edit with rollback | Task 10 |
| TanStack Query v5 + Zustand | Tasks 7–12 |
| react-markdown + rehype-highlight | Task 11 |
| Copy button on Standup (1800ms copied state) | Task 12 |
| SizePill XS/XL variants with correct colors | Tasks 7, 8 |
| HierarchyStrip on all facet views | Tasks 8, 10, 11 |

### Type consistency check

- `StorySize` defined once in `packages/shared/src/story.ts`, imported everywhere
- `StandupItem.size: StorySize | null` matches `Story.size: StorySize | null`
- `HandoffService.generate(storyId)` returns `HandoffResult` — used consistently in route handler
- `SizePill` accepts `StorySize | null` matching `Story.size` type
- `PlanTask` from `@cc/shared` — `TaskCard` uses `task.steps[].state` and `task.steps[].label` — verify these field names match `packages/shared/src/plan.ts` before implementation

