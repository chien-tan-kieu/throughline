# Real-Time Story Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in `StoryService` so that file deletions, title changes, and missed watcher events are all correctly reflected in SQLite and pushed to WebSocket clients.

**Architecture:** All changes are isolated to `packages/server/src/stories/index.ts`. The watcher callback is extracted into a private `handleFileEvent` method for testability. A `reconcile()` method is added and wired to a 30-second `setInterval` in `start()`/`stop()`. No changes are needed to the bus, WebSocket layer, or frontend — the existing `op: "delete"` handling in `useWebSocket.ts` already invalidates the React Query cache correctly.

**Tech Stack:** Bun (SQLite via `bun:sqlite`, `fs.watch`, `setInterval`), TypeScript, `bun:test`

---

## Files

- Modify: `packages/server/src/stories/index.ts`
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

---

## Task 1: Title sync — update `upsertRow` + extract `handleFileEvent`

The current `upsertRow` uses `COALESCE` to preserve the stale title on every upsert. We replace that with a `title` parameter that always wins. We also extract the inline watcher callback into `handleFileEvent` (no deletion branch yet) so later tasks can test it directly.

**Files:**
- Modify: `packages/server/src/stories/__tests__/service.test.ts`
- Modify: `packages/server/src/stories/index.ts:52-91`, `:196-243`

- [ ] **Step 1.1: Upgrade test file — add spy bus, `writeFile`/`mkdir` imports**

Replace the header of `packages/server/src/stories/__tests__/service.test.ts` up to (but not including) the first `test(...)` block:

```typescript
// packages/server/src/stories/__tests__/service.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bus, BusEvent } from "../../bus.ts";
import { runMigrations } from "../../store/migrate.ts";
import { StoryService } from "../index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

describe("StoryService", () => {
  let db: Database;
  let cwd: string;
  let service: StoryService;
  let publishedEvents: BusEvent[];
  let bus: Bus;

  beforeEach(async () => {
    cwd = join(tmpdir(), `cc-stories-${Date.now()}`);
    db = new Database(":memory:");
    await runMigrations(db, MIGRATIONS_DIR);
    publishedEvents = [];
    bus = {
      publish(event: BusEvent) {
        publishedEvents.push(event);
      },
      subscribe: () => () => {},
    };
    service = new StoryService(cwd, db, bus);
    await service.start();
  });

  afterEach(async () => {
    service.stop();
    db.close();
    await rm(cwd, { recursive: true, force: true });
  });
```

- [ ] **Step 1.2: Write failing test for title sync**

Add this test at the end of the describe block (before the closing `}`). It calls `upsertRow` twice with different titles via `service as any` and asserts the second title wins:

```typescript
  test("upsertRow updates title on subsequent call", () => {
    const id = "US-2026-01-01-title-test";
    const filePath = join(cwd, "docs/superpowers/stories", `${id}.md`);
    (service as any).upsertRow(id, filePath, "Title A", "backlog", null, null, null);
    (service as any).upsertRow(id, filePath, "Title B", "backlog", null, null, null);
    const row = db
      .query<{ title: string }, [string]>(
        "SELECT title FROM stories WHERE id = ?",
      )
      .get(id);
    expect(row?.title).toBe("Title B");
  });
```

- [ ] **Step 1.3: Run test to confirm it fails**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "upsertRow updates title"
```

Expected: FAIL — `received "Title A"` (COALESCE preserves the first-inserted title)

- [ ] **Step 1.4: Update `upsertRow`, its callers, and extract `handleFileEvent`**

This step makes four changes to `packages/server/src/stories/index.ts`:

**1. Update `upsertRow` signature and SQL** (replace lines 216–243):

```typescript
  private upsertRow(
    id: string,
    filePath: string,
    title: string,
    status: string,
    size: string | null,
    linkedSpec: string | null,
    linkedPlan: string | null,
  ): void {
    const ts = Date.now();
    this.db.run(
      `INSERT OR REPLACE INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?), ?)`,
      [id, filePath, title, size, status, linkedSpec, linkedPlan, id, ts, ts],
    );
  }
```

**2. Extract `handleFileEvent` and replace `start()`** (replace lines 64–91):

```typescript
  async start(): Promise<void> {
    await mkdir(this.storiesDir, { recursive: true });
    await this.loadAll();
    this.watcher = watch(
      this.storiesDir,
      { persistent: false },
      (_event, filename) => {
        this.handleFileEvent(filename);
      },
    );
  }
```

Add `handleFileEvent` as a new private method (insert after `archive()`, before `loadAll()`):

```typescript
  private async handleFileEvent(filename: string | null): Promise<void> {
    if (!filename?.endsWith(".md")) return;
    const filePath = join(this.storiesDir, filename);
    const content = await readFile(filePath, "utf-8").catch(() => null);
    if (!content) return;
    const fm = parseFrontmatter(content);
    if (!fm) return;
    this.upsertRow(
      fm.id,
      filePath,
      fm.title,
      fm.status,
      fm.size ?? null,
      fm.linked_spec ?? null,
      fm.linked_plan ?? null,
    );
    this.bus.publish({
      type: "story.changed",
      data: { id: fm.id, op: "update" },
    });
  }
```

**3. Update `loadAll` caller** — pass `fm.title` as the third argument:

```typescript
      this.upsertRow(
        fm.id,
        filePath,
        fm.title,
        fm.status,
        fm.size ?? null,
        fm.linked_spec ?? null,
        fm.linked_plan ?? null,
      );
```

- [ ] **Step 1.5: Run all service tests and confirm they pass**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 1.6: Commit**

```bash
git add packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(stories): sync title from frontmatter on upsert and extract handleFileEvent"
```

---

## Task 2: Watcher deletion branch

When a file is deleted, `readFile` returns null and the current code exits early with no SQLite update and no bus event. We add the deletion branch to `handleFileEvent`. The method already exists from Task 1.

**Files:**
- Modify: `packages/server/src/stories/index.ts` — add deletion branch to `handleFileEvent`
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 2.1: Write failing test for deletion via watcher**

Add this test to the describe block:

```typescript
  test("handleFileEvent() deletes row and emits bus event when file is missing", async () => {
    const story = await service.create("To Be Deleted");
    publishedEvents = []; // reset events accumulated during create()

    await rm(story.file_path); // file gone — readFile will return null

    await (service as any).handleFileEvent(`${story.id}.md`);

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(story.id);
    expect(row).toBeNull();
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toEqual({
      type: "story.changed",
      data: { id: story.id, op: "delete" },
    });
  });
```

- [ ] **Step 2.2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "handleFileEvent.*deletes row"
```

Expected: FAIL — row still present in DB, `publishedEvents` is empty (deletion branch not implemented)

- [ ] **Step 2.3: Add deletion branch to `handleFileEvent`**

Replace the `handleFileEvent` method in `packages/server/src/stories/index.ts`:

```typescript
  private async handleFileEvent(filename: string | null): Promise<void> {
    if (!filename?.endsWith(".md")) return;
    const filePath = join(this.storiesDir, filename);
    const content = await readFile(filePath, "utf-8").catch(() => null);
    if (!content) {
      const row = this.db
        .query<{ id: string }, [string]>(
          "SELECT id FROM stories WHERE file_path = ?",
        )
        .get(filePath);
      if (!row) return;
      this.db.run("DELETE FROM stories WHERE file_path = ?", [filePath]);
      this.bus.publish({
        type: "story.changed",
        data: { id: row.id, op: "delete" },
      });
      return;
    }
    const fm = parseFrontmatter(content);
    if (!fm) return;
    this.upsertRow(
      fm.id,
      filePath,
      fm.title,
      fm.status,
      fm.size ?? null,
      fm.linked_spec ?? null,
      fm.linked_plan ?? null,
    );
    this.bus.publish({
      type: "story.changed",
      data: { id: fm.id, op: "update" },
    });
  }
```

- [ ] **Step 2.4: Run all service tests and confirm they pass**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(stories): delete SQLite row and emit bus event when watched file is removed"
```

---

## Task 3: Startup pruning in `loadAll`

If a file is deleted while the server is off, the stale SQLite row persists until manually cleared. `loadAll()` should delete any non-archived rows whose `file_path` no longer exists on disk. No bus events here — no clients are connected yet.

**Files:**
- Modify: `packages/server/src/stories/index.ts` — add pruning after the upsert loop
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 3.1: Write failing test for startup pruning**

Add this test to the describe block:

```typescript
  test("loadAll() prunes rows for files that no longer exist on disk", async () => {
    // Seed a stale row directly — simulates a file deleted while the server was down
    const staleId = "US-2026-01-01-stale-story";
    const stalePath = join(cwd, "docs/superpowers/stories", `${staleId}.md`);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [staleId, stalePath, "Stale Story", ts, ts],
    );

    // Restart service — loadAll() runs and should prune the stale row
    service.stop();
    service = new StoryService(cwd, db, bus);
    await service.start();

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(staleId);
    expect(row).toBeNull();
  });
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "loadAll.*prunes"
```

Expected: FAIL — stale row still present after restart (pruning not implemented)

- [ ] **Step 3.3: Add pruning after the upsert loop in `loadAll`**

Replace the `loadAll` method in `packages/server/src/stories/index.ts`:

```typescript
  private async loadAll(): Promise<void> {
    const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
    const onDiskPaths = new Set<string>();
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const filePath = join(this.storiesDir, name);
      onDiskPaths.add(filePath);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (!content) continue;
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      this.upsertRow(
        fm.id,
        filePath,
        fm.title,
        fm.status,
        fm.size ?? null,
        fm.linked_spec ?? null,
        fm.linked_plan ?? null,
      );
    }
    const rows = this.db
      .query<{ id: string; file_path: string }, []>(
        "SELECT id, file_path FROM stories WHERE status != 'archived'",
      )
      .all();
    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
      }
    }
  }
```

- [ ] **Step 3.4: Run all service tests and confirm they pass**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(stories): prune stale SQLite rows on startup"
```

---

## Task 4: `reconcile()` private method

`reconcile()` diffs disk vs SQLite every 30 seconds, catching any deletions or additions missed by the watcher. We test it directly by calling the private method.

**Note on test isolation for the "upsert new file" test:** The active watcher could process a newly written file before `reconcile()` runs, making the row already present and the "create" event absent. To eliminate this race, the upsert test creates a fresh `StoryService` instance *without* calling `start()` — no watcher, no `loadAll`. The `storiesDir` is created manually so `readdir` works.

**Files:**
- Modify: `packages/server/src/stories/index.ts` — add `reconcile()` method
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 4.1: Write failing tests for `reconcile()`**

Add these two tests to the describe block:

```typescript
  test("reconcile() deletes stale row and emits delete event", async () => {
    const staleId = "US-2026-01-01-stale-reconcile";
    const stalePath = join(cwd, "docs/superpowers/stories", `${staleId}.md`);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [staleId, stalePath, "Stale Reconcile", ts, ts],
    );
    publishedEvents = [];

    await (service as any).reconcile();

    const row = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM stories WHERE id = ?",
      )
      .get(staleId);
    expect(row).toBeNull();
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toEqual({
      type: "story.changed",
      data: { id: staleId, op: "delete" },
    });
  });

  test("reconcile() upserts on-disk file absent from SQLite and emits create event", async () => {
    // Fresh service without start() — no watcher, no loadAll, avoids race with active watcher
    const isolatedCwd = join(tmpdir(), `cc-reconcile-${Date.now()}`);
    const storiesDir = join(isolatedCwd, "docs/superpowers/stories");
    await mkdir(storiesDir, { recursive: true });

    const isolatedDb = new Database(":memory:");
    await runMigrations(isolatedDb, MIGRATIONS_DIR);
    const isolatedEvents: BusEvent[] = [];
    const isolatedBus: Bus = {
      publish(event: BusEvent) { isolatedEvents.push(event); },
      subscribe: () => () => {},
    };
    const isolatedService = new StoryService(isolatedCwd, isolatedDb, isolatedBus);

    const id = "US-2026-01-01-new-file";
    const filePath = join(storiesDir, `${id}.md`);
    await writeFile(
      filePath,
      [
        "---",
        `id: ${id}`,
        "title: New On-Disk Story",
        "status: backlog",
        "created: 2026-01-01",
        "---",
        "",
        "Body",
      ].join("\n"),
      "utf-8",
    );

    await (isolatedService as any).reconcile();

    const row = isolatedDb
      .query<{ id: string; title: string }, [string]>(
        "SELECT id, title FROM stories WHERE id = ?",
      )
      .get(id);
    expect(row?.id).toBe(id);
    expect(row?.title).toBe("New On-Disk Story");
    expect(isolatedEvents).toHaveLength(1);
    expect(isolatedEvents[0]).toEqual({
      type: "story.changed",
      data: { id, op: "create" },
    });

    isolatedDb.close();
    await rm(isolatedCwd, { recursive: true, force: true });
  });
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "reconcile"
```

Expected: FAIL — `(service as any).reconcile is not a function`

- [ ] **Step 4.3: Add `reconcile()` method to `StoryService`**

Insert this private method between `handleFileEvent` and `loadAll` in `packages/server/src/stories/index.ts`:

```typescript
  private async reconcile(): Promise<void> {
    const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
    const onDiskPaths = new Set(
      entries
        .filter((n) => n.endsWith(".md"))
        .map((n) => join(this.storiesDir, n)),
    );

    const rows = this.db
      .query<{ id: string; file_path: string }, []>(
        "SELECT id, file_path FROM stories WHERE status != 'archived'",
      )
      .all();

    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
        this.bus.publish({
          type: "story.changed",
          data: { id: row.id, op: "delete" },
        });
      }
    }

    const knownPaths = new Set(rows.map((r) => r.file_path));
    for (const filePath of onDiskPaths) {
      if (knownPaths.has(filePath)) continue;
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (!content) continue;
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      this.upsertRow(
        fm.id,
        filePath,
        fm.title,
        fm.status,
        fm.size ?? null,
        fm.linked_spec ?? null,
        fm.linked_plan ?? null,
      );
      this.bus.publish({
        type: "story.changed",
        data: { id: fm.id, op: "create" },
      });
    }
  }
```

- [ ] **Step 4.4: Run all service tests and confirm they pass**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(stories): add reconcile() to sync disk vs SQLite"
```

---

## Task 5: Interval lifecycle — wire `reconcile` into `start`/`stop`

Wire `reconcile()` to a 30-second `setInterval` in `start()` and ensure `stop()` clears it cleanly.

**Files:**
- Modify: `packages/server/src/stories/index.ts` — add class field, update `start()` and `stop()`
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 5.1: Write failing tests for interval lifecycle**

Add these two tests to the describe block:

```typescript
  test("start() sets reconcileTimer", () => {
    expect((service as any).reconcileTimer).not.toBeNull();
  });

  test("stop() clears reconcileTimer and is safe to call twice", () => {
    service.stop();
    expect((service as any).reconcileTimer).toBeNull();
    expect(() => service.stop()).not.toThrow();
  });
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "sets reconcileTimer|clears reconcileTimer"
```

Expected: FAIL — `reconcileTimer` is `undefined` (field doesn't exist yet)

- [ ] **Step 5.3: Add `reconcileTimer` field and wire in `start`/`stop`**

**1. Add class field** after `watcher` (line 54):

```typescript
  private watcher: ReturnType<typeof watch> | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
```

**2. Replace `start()`** to add the `setInterval` call after watcher setup:

```typescript
  async start(): Promise<void> {
    await mkdir(this.storiesDir, { recursive: true });
    await this.loadAll();
    this.watcher = watch(
      this.storiesDir,
      { persistent: false },
      (_event, filename) => {
        this.handleFileEvent(filename);
      },
    );
    this.reconcileTimer = setInterval(() => {
      this.reconcile();
    }, 30_000);
  }
```

**3. Replace `stop()`** to clear the interval:

```typescript
  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }
```

- [ ] **Step 5.4: Run all service tests and confirm they pass**

```bash
cd packages/server && bun test src/stories/__tests__/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5.5: Run the full server test suite**

```bash
cd packages/server && bun test
```

Expected: All tests pass with no regressions.

- [ ] **Step 5.6: Commit**

```bash
git add packages/server/src/stories/index.ts packages/server/src/stories/__tests__/service.test.ts
git commit -m "feat(stories): wire reconcile() to 30s setInterval in start/stop lifecycle"
```
