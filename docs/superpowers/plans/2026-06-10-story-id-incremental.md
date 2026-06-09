# Incremental Story IDs (US{n}) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace date-slug story IDs (`US-yyyy-MM-dd-slug`) with short incremental IDs (`US1`, `US2`, …) stored in a new `seq` column on the SQLite `stories` table.

**Architecture:** A nullable `seq INTEGER` column is added to `stories` via a new migration. On `create()`, the next integer is derived from `COALESCE(MAX(seq), 0) + 1` — the counter only advances when a story row is successfully inserted, giving transactional safety. `upsertRow()` is updated to preserve the existing `seq` when it replaces a row on file-watch events. Old date-slug IDs continue to work in all API operations.

**Tech Stack:** Bun, bun:sqlite, bun:test (server tests), TypeScript

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Create | `packages/server/migrations/004_story_seq.sql` | Adds `seq INTEGER` + partial unique index |
| Modify | `packages/server/src/store/__tests__/migrate.test.ts` | 3 new tests; update idempotent count 3 → 4 |
| Modify | `packages/server/src/stories/index.ts` | `isValidStoryId()`, `create()`, `upsertRow()`, remove `toSlug()` |
| Modify | `packages/server/src/stories/__tests__/service.test.ts` | 2 updated tests + 3 new tests |
| Modify | `packages/server/src/api/__tests__/routes.test.ts` | 1 assertion update |

---

### Task 1: Add `seq` column via migration

**Files:**
- Create: `packages/server/migrations/004_story_seq.sql`
- Modify: `packages/server/src/store/__tests__/migrate.test.ts`

- [ ] **Step 1: Add 3 failing tests to `migrate.test.ts`**

  Append inside the `describe("runMigrations", ...)` block:

  ```ts
  test("stories table has seq column after migration", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(stories)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("seq");
  });

  test("stories seq column rejects duplicate non-null values", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, status, seq, created_at, updated_at)
       VALUES ('US1', '/a', 'A', 'backlog', 1, ?, ?)`,
      [ts, ts],
    );
    expect(() => {
      db.run(
        `INSERT INTO stories (id, file_path, title, status, seq, created_at, updated_at)
         VALUES ('US2', '/b', 'B', 'backlog', 1, ?, ?)`,
        [ts, ts],
      );
    }).toThrow();
  });

  test("stories seq column allows multiple NULL values", async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const ts = Date.now();
    db.run(
      `INSERT INTO stories (id, file_path, title, status, created_at, updated_at)
       VALUES ('US-2026-01-01-a', '/a', 'A', 'backlog', ?, ?)`,
      [ts, ts],
    );
    db.run(
      `INSERT INTO stories (id, file_path, title, status, created_at, updated_at)
       VALUES ('US-2026-01-01-b', '/b', 'B', 'backlog', ?, ?)`,
      [ts, ts],
    );
    const count = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) as c FROM stories WHERE seq IS NULL",
      )
      .get()?.c;
    expect(count).toBe(2);
  });
  ```

- [ ] **Step 2: Run the new tests to confirm they fail**

  ```bash
  cd packages/server && bun test src/store/__tests__/migrate.test.ts
  ```

  Expected: 3 new tests fail with "no such column: seq" or similar.

- [ ] **Step 3: Create the migration file**

  Create `packages/server/migrations/004_story_seq.sql`:

  ```sql
  ALTER TABLE stories ADD COLUMN seq INTEGER;
  CREATE UNIQUE INDEX idx_stories_seq ON stories(seq) WHERE seq IS NOT NULL;
  ```

- [ ] **Step 4: Update the idempotent count in `migrate.test.ts`**

  Find the test `"running migrations twice is idempotent"`. Change:

  ```ts
  expect(count).toBe(3);
  ```

  to:

  ```ts
  expect(count).toBe(4);
  ```

- [ ] **Step 5: Run all migration tests and confirm they pass**

  ```bash
  cd packages/server && bun test src/store/__tests__/migrate.test.ts
  ```

  Expected: all tests pass (6 total).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/server/migrations/004_story_seq.sql \
          packages/server/src/store/__tests__/migrate.test.ts
  git commit -m "feat(db): add seq column to stories for incremental IDs"
  ```

---

### Task 2: Replace `STORY_ID_REGEX` with `isValidStoryId()`

**Files:**
- Modify: `packages/server/src/stories/index.ts`
- Modify: `packages/server/src/stories/__tests__/service.test.ts`

- [ ] **Step 1: Add a failing test for `US{n}` format acceptance**

  Append inside `describe("StoryService", ...)` in `service.test.ts`:

  ```ts
  test("get() accepts US{n} id format", async () => {
    const id = "US99";
    const filePath = join(cwd, "docs/superpowers/stories", `${id}.md`);
    await writeFile(
      filePath,
      [
        "---",
        `id: ${id}`,
        "title: New Format",
        "status: backlog",
        "created: 2026-01-01",
        "---",
        "",
        "Body",
      ].join("\n"),
      "utf-8",
    );
    (service as any).upsertRow(id, filePath, "New Format", "backlog", null, null, null);
    expect(service.get(id)).not.toBeNull();
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd packages/server && bun test src/stories/__tests__/service.test.ts --test-name-pattern "get\(\) accepts US"
  ```

  Expected: FAIL — `get()` returns null because `STORY_ID_REGEX` rejects `US99`.

- [ ] **Step 3: Replace `STORY_ID_REGEX` with `isValidStoryId()` in `stories/index.ts`**

  Replace the constant at line 16:

  ```ts
  // remove:
  const STORY_ID_REGEX = /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

  // add:
  function isValidStoryId(id: string): boolean {
    return /^US\d+$/.test(id) || /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id);
  }
  ```

  Then update the three call sites. In `get()`:
  ```ts
  // before:
  if (!STORY_ID_REGEX.test(id)) return null;
  // after:
  if (!isValidStoryId(id)) return null;
  ```

  In `update()`:
  ```ts
  // before:
  if (!STORY_ID_REGEX.test(id)) return null;
  // after:
  if (!isValidStoryId(id)) return null;
  ```

  In `archive()`:
  ```ts
  // before:
  if (!STORY_ID_REGEX.test(id)) return;
  // after:
  if (!isValidStoryId(id)) return;
  ```

- [ ] **Step 4: Run all service tests**

  ```bash
  cd packages/server && bun test src/stories/__tests__/service.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/server/src/stories/index.ts \
          packages/server/src/stories/__tests__/service.test.ts
  git commit -m "feat(stories): accept US{n} id format in get/update/archive"
  ```

---

### Task 3: Rewrite `create()`, fix `upsertRow()`, remove `toSlug()`

**Files:**
- Modify: `packages/server/src/stories/index.ts`
- Modify: `packages/server/src/stories/__tests__/service.test.ts`
- Modify: `packages/server/src/api/__tests__/routes.test.ts`

**Context:** `create()` currently builds `US-${today}-${toSlug(title)}`. After this task it builds `US${n}` where `n = COALESCE(MAX(seq), 0) + 1`. `upsertRow()` must also be updated to preserve the `seq` value when the file watcher replaces a row — without this, a watcher event after `create()` would overwrite the `seq` with `NULL`, breaking the counter.

- [ ] **Step 1: Update two existing tests in `service.test.ts`**

  Replace `"create() returns a story with generated id and writes a file"`:

  ```ts
  test("create() returns a story with generated id and writes a file", async () => {
    const story = await service.create("Add OAuth login");
    expect(story.id).toMatch(/^US\d+$/);
    expect(story.title).toBe("Add OAuth login");
    expect(story.status).toBe("backlog");
    const row = db.query<{ id: string }, []>("SELECT id FROM stories").get();
    expect(row?.id).toBe(story.id);
  });
  ```

  Replace `"create() writes file under docs/superpowers/stories"`:

  ```ts
  test("create() writes file under docs/superpowers/stories", async () => {
    const story = await service.create("Path Check");
    expect(story.id).toBe("US1");
    expect(story.file_path).toBe(
      join(cwd, "docs/superpowers/stories", "US1.md"),
    );
  });
  ```

- [ ] **Step 2: Add 2 new tests in `service.test.ts`**

  Append inside `describe("StoryService", ...)`:

  ```ts
  test("create() assigns sequential ids", async () => {
    const first = await service.create("First Story");
    const second = await service.create("Second Story");
    expect(first.id).toBe("US1");
    expect(second.id).toBe("US2");
  });

  test("upsertRow preserves seq for existing new-format story", async () => {
    const story = await service.create("Preserve Seq");
    expect(story.id).toBe("US1");
    (service as any).upsertRow(
      story.id,
      story.file_path,
      story.title,
      story.status,
      null,
      null,
      null,
    );
    const row = db
      .query<{ seq: number | null }, [string]>(
        "SELECT seq FROM stories WHERE id = ?",
      )
      .get(story.id);
    expect(row?.seq).toBe(1);
  });
  ```

- [ ] **Step 3: Run tests to confirm failures**

  ```bash
  cd packages/server && bun test src/stories/__tests__/service.test.ts
  ```

  Expected: the two updated tests and two new tests fail. The `upsertRow` preservation test may also fail once `create()` is rewritten and then `upsertRow` still drops `seq`.

- [ ] **Step 4: Rewrite `create()` in `stories/index.ts`**

  Replace the entire `create()` method:

  ```ts
  async create(title: string): Promise<Story> {
    const { n } = this.db
      .query<{ n: number }, []>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM stories",
      )
      .get()!;
    const id = `US${n}`;
    const filePath = join(this.storiesDir, `${id}.md`);
    const today = new Date().toISOString().slice(0, 10);
    await writeFile(filePath, scaffoldStory(id, title, today), "utf-8");
    const ts = Date.now();
    this.db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at, seq)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?, ?)`,
      [id, filePath, title, ts, ts, n],
    );
    this.bus.publish({ type: "story.changed", data: { id, op: "create" } });
    const created = this.db
      .query<Story, [string]>("SELECT * FROM stories WHERE id = ?")
      .get(id);
    if (!created) throw new Error(`Story not found after insert: ${id}`);
    return created;
  }
  ```

- [ ] **Step 5: Remove `toSlug()` from `stories/index.ts`**

  Delete the entire function (currently lines 18–24):

  ```ts
  // delete this entire function:
  function toSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }
  ```

- [ ] **Step 6: Fix `upsertRow()` to preserve `seq`**

  Replace the `upsertRow` method body so the SQL includes `seq` and reads the existing value back:

  ```ts
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
      `INSERT OR REPLACE INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?), ?, (SELECT seq FROM stories WHERE id = ?))`,
      [id, filePath, title, size, status, linkedSpec, linkedPlan, id, ts, ts, id],
    );
  }
  ```

  The subquery `(SELECT seq FROM stories WHERE id = ?)` is evaluated before the REPLACE delete, so the existing `seq` value is carried over. Old-format rows have `seq = NULL` and remain NULL. New-format rows retain their integer `seq`.

- [ ] **Step 7: Run service tests to confirm they pass**

  ```bash
  cd packages/server && bun test src/stories/__tests__/service.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 8: Update the routes test assertion**

  In `packages/server/src/api/__tests__/routes.test.ts`, find the test `"POST /api/stories creates story and returns 201"` (around line 115). Change:

  ```ts
  // before:
  expect(body.id).toMatch(/^US-\d{4}-\d{2}-\d{2}-/);
  // after:
  expect(body.id).toMatch(/^US\d+$/);
  ```

- [ ] **Step 9: Run full server test suite**

  ```bash
  cd packages/server && bun test
  ```

  Expected: all tests pass.

- [ ] **Step 10: Commit**

  ```bash
  git add packages/server/src/stories/index.ts \
          packages/server/src/stories/__tests__/service.test.ts \
          packages/server/src/api/__tests__/routes.test.ts
  git commit -m "feat(stories): generate incremental US{n} ids from seq column"
  ```
