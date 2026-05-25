# Real-Time Story Sync Design

**Date:** 2026-05-25
**Status:** Approved

## Problem

When a story `.md` file is deleted or edited directly on disk (outside the API), the Claude Control UI does not reflect the change. The real-time pipeline (fs.watch → SQLite → bus → WebSocket → React Query) already exists end-to-end, but has two bugs and one missing layer:

1. **Deletions silently dropped** — when `readFile` returns null, the watcher callback exits early with no SQLite update and no bus event. The story stays visible in the UI indefinitely.
2. **Title never synced from frontmatter** — `parseFrontmatter()` returns `fm.title` but `upsertRow()` is never passed it. The `COALESCE` fallback in the SQL preserves the stale title.
3. **No reconciliation** — if a file is deleted while the server is down, `loadAll` on the next startup does not prune the stale row.

## Scope

All changes are isolated to `packages/server/src/stories/index.ts` (`StoryService`). No changes to the bus, WebSocket layer, or frontend — the existing `op: "delete"` handling in `useWebSocket.ts` already invalidates the React Query `["stories"]` cache correctly.

## Design

### 1. Watcher callback — deletion branch

When `readFile` returns null, look up the story by `file_path` in SQLite. If a row exists, delete it and emit the bus event. Using the DB's `id` rather than parsing the filename keeps the source of truth authoritative.

```typescript
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
```

### 2. `upsertRow` — title sync

Add a `title: string` parameter and use it directly in the SQL, replacing the `COALESCE` fallback that prevented title updates after initial insert.

Both callers (`loadAll` and the watcher callback) pass `fm.title` parsed from the file's frontmatter.

### 3. `loadAll` — startup pruning

After upserting all on-disk files, query all non-archived SQLite rows and delete any whose `file_path` is no longer present on disk. No bus events are emitted here — no WebSocket clients are connected at startup.

```typescript
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
```

### 4. `reconcile()` — periodic existence diff

A new private method, called every 30 seconds via `setInterval`. Scoped to existence diffs only — file modifications are covered by the watcher in real-time.

- Files in SQLite but not on disk → `DELETE` + emit `story.changed { op: "delete" }`
- Files on disk but not in SQLite → upsert (catches missed `add` events)

```typescript
private async reconcile(): Promise<void> {
  const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
  const onDiskPaths = new Set(
    entries
      .filter((n) => n.endsWith(".md"))
      .map((n) => join(this.storiesDir, n)),
  );

  // Remove stale rows
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

  // Upsert new files not yet in SQLite
  const knownPaths = new Set(rows.map((r) => r.file_path));
  for (const filePath of onDiskPaths) {
    if (knownPaths.has(filePath)) continue;
    const content = await readFile(filePath, "utf-8").catch(() => null);
    if (!content) continue;
    const fm = parseFrontmatter(content);
    if (!fm) continue;
    await this.upsertRow(fm.id, filePath, fm.title, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
    this.bus.publish({
      type: "story.changed",
      data: { id: fm.id, op: "create" },
    });
  }
}
```

### 5. Interval lifecycle

A `reconcileTimer` field is added to the class (type `ReturnType<typeof setInterval> | null`).

- `start()`: after `loadAll()` and watcher setup, `this.reconcileTimer = setInterval(() => { this.reconcile(); }, 30_000)`
- `stop()`: `clearInterval(this.reconcileTimer); this.reconcileTimer = null` alongside `this.watcher?.close()`

## Data Flow

### File deleted from disk

```
User deletes .md file
  → fs.watch fires (rename event)
  → readFile returns null
  → SELECT id FROM stories WHERE file_path = ?
  → DELETE FROM stories WHERE file_path = ?
  → bus.publish({ type: "story.changed", op: "delete" })
  → WebSocket broadcasts to all clients
  → React Query invalidates ["stories"]
  → UI re-fetches → story gone
```

### File deleted while server was down

```
Server restarts → loadAll() runs
  → reads all .md files from disk into onDiskPaths
  → queries all non-archived SQLite rows
  → deletes rows with file_path not in onDiskPaths
  → (no bus events — no clients yet)
  → UI fetches fresh data on connect
```

### Missed watcher event (reconciliation)

```
Every 30s → reconcile() runs
  → diffs disk vs SQLite
  → emits delete events for stale rows
  → upserts and emits create events for new files
```

## Testing

- Unit tests in `packages/server/src/stories/__tests__/service.test.ts`
- **Deletion via watcher**: write a `.md` file, wait for upsert, delete the file, trigger the watcher callback, assert row removed from SQLite and bus event emitted
- **Deletion via reconcile**: insert a row with a non-existent `file_path`, call `reconcile()`, assert row deleted and event emitted
- **Startup pruning**: pre-seed SQLite with a row for a missing file, call `loadAll()`, assert row deleted
- **Title sync**: call `upsertRow` with a title, then again with a different title, assert updated value in SQLite
- **Upsert new file via reconcile**: write a `.md` file without triggering the watcher, call `reconcile()`, assert row inserted and create event emitted
