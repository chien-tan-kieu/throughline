# Throughline — Phase 3: Dashboard + Standup + Handoff

> Status: Draft  
> Date: 2026-05-17  
> Follows: `docs/superpowers/specs/2026-05-13-superpowers-integration-stories-design.md`  
> Visual ground truth: `assets/throughline-dashboard-hierarchy.html`  
> Design handoff: `assets/throughline-handoff.md`

---

## 1. Goal

Ship the React dashboard SPA and the two generators deferred from Phase 2. By the end of this phase:

- The daemon serves the dashboard SPA from `packages/web/dist/` over its existing Bun HTTP server.
- Five views are functional: Plan, Spec, Story, Stories Board, Standup.
- Plan checkbox state and story updates reflect in the browser in real time via WebSocket.
- `StandupService` generates a digest from the previous calendar day's SQLite data.
- `HandoffService` generates a markdown handoff document for any story and writes it to disk.
- `/throughline:standup` and `/throughline:handoff` slash commands are functional.
- Story size supports five values: XS, S, M, L, XL (plus null).

---

## 2. Scope

### In Phase 3

- `packages/web` — new Vite + React workspace package (full stack described in §4)
- Five dashboard views: Plan, Story, Spec, Stories Board, Standup
- `server.ts` catch-all: serve `packages/web/dist/index.html` for non-API routes
- `StandupService` — previous-calendar-day digest from SQLite
- `HandoffService` — markdown generator, writes to `<repo>/.throughline/handoffs/`
- `GET /api/standup?date=` and `POST /api/handoff/:storyId` and `GET /api/handoffs`
- `/throughline:standup` and `/throughline:handoff` slash commands
- Size enum expanded to `XS | S | M | L | XL | null` across shared types, DB, and UI

### Deferred to Phase 4

- Binary embedding (SPA served from disk in Phase 3; embedded in Phase 4)
- Subagent activity view
- Settings view
- Replay scrubber, token/cost meter, diff timeline
- Cross-platform binary distribution and plugin packaging

---

## 3. Architecture

### 3.1 Monorepo additions

```
packages/web/                        ← new workspace package (@cc/web)
  package.json                       ← name: "@cc/web", vite dev/build scripts
  vite.config.ts                     ← base: "/", hash history, proxy /api + /ws to daemon
  tsconfig.json
  index.html
  src/
    main.tsx                         ← ReactDOM.createRoot, RouterProvider, QueryClientProvider
    App.tsx                          ← HashRouter routes + WS provider
    store/
      ws.ts                          ← Zustand: connection status, active phase, session id
    hooks/
      useWebSocket.ts                ← opens ws://127.0.0.1:<port>/ws?token=<token>
                                        writes events into Zustand + invalidates TanStack cache
    lib/
      api.ts                         ← typed fetch wrappers, reads port+token from URL params
    pages/
      PlanPage.tsx
      StoryPage.tsx
      SpecPage.tsx
      StoriesPage.tsx
      StandupPage.tsx
    components/
      layout/
        Topbar.tsx
        Sidebar.tsx
      shared/
        TypeIcon.tsx
        StatusPill.tsx
        SizePill.tsx
        LinkedCard.tsx
        HierarchyStrip.tsx
        TaskCard.tsx
        StepRow.tsx
      stories/
        StoryCard.tsx
        KanbanColumn.tsx
      standup/
        StandupSection.tsx
        StatsGrid.tsx

packages/server/src/
  standup/index.ts                   ← StandupService (new)
  handoff/index.ts                   ← HandoffService (new)
  api/standup.ts                     ← mountStandupRoutes()
  api/handoff.ts                     ← mountHandoffRoutes()

plugin/commands/
  standup.md                         ← /throughline:standup
  handoff.md                         ← /throughline:handoff
```

### 3.2 SPA serving (Phase 3)

`server.ts` adds a catch-all after all API and hook routes:

```ts
// Serve SPA for any unmatched GET — hash routing means only GET / is ever hit in practice
const webDist = join(import.meta.dir, "../../../web/dist");
const indexHtml = readFileSync(join(webDist, "index.html"), "utf-8");

// In fetch handler, after all other routes:
if (req.method === "GET" && !url.pathname.startsWith("/api")
    && !url.pathname.startsWith("/hooks")
    && url.pathname !== "/ws") {
  return new Response(indexHtml, { headers: { "Content-Type": "text/html" } });
}
```

`pnpm build` in `packages/web` must run before the daemon to populate `dist/`. For development, `vite dev` on port 5173 proxies `/api` and `/ws` to the daemon at `127.0.0.1:<port>`.

### 3.3 Token / port discovery

The dashboard is opened via `/throughline:open` which appends `?token=<token>` to the URL. The SPA reads `token` from `window.location.search` and `port` from `window.location.port` on mount and stores both in Zustand. All `api.ts` fetch calls and the WS connection use these values. No hardcoded port.

### 3.4 WebSocket integration

`useWebSocket` hook:
- Opens `ws://127.0.0.1:<port>/ws?token=<token>` on mount
- On message, dispatches to Zustand (`ws.ts` store) for live state (phase, session, connection)
- On `plan.changed`: calls `queryClient.invalidateQueries({ queryKey: ["plan", path] })`
- On `story.changed`: calls `queryClient.invalidateQueries({ queryKey: ["stories"] })`
- On `session.started` / `session.ended`: updates Zustand session state
- Reconnect: exponential backoff starting at 1s, cap 30s, infinite retries
- Connection status exposed from Zustand to `Topbar` for the live/disconnected pill

---

## 4. Frontend: views and components

The design handoff (`assets/throughline-handoff.md`) is the canonical reference for visual decisions. This section specifies behaviour and data wiring only.

### 4.1 Global shell

**Topbar (48px, fixed):** Brand mark, project key (derived from `cwd` basename), workflow phase track (four-segment pill from Zustand), session ID (Zustand), connection status pill (Zustand, pulsing green dot or muted red).

**Sidebar (252px, fixed):**
- *Active Story* section: card with Story/Spec/Plan facet links. Presence indicators per facet (checkmark if file exists, animated dot if active, ghost if absent). Source: `GET /api/stories/:id` for the active story id from session state.
- *Workspace* section: "All Stories" nav link with count badge.
- *Reports* section: "Standup" nav link.

### 4.2 Plan view (`/#/plan`) — default route

**Data:** `GET /api/plans/:path` (path from active story's `linked_plan` field). Refreshed on `plan.changed` WS event via cache invalidation.

**Layout:** Issue layout (main + 280px right rail). Shared issue header (breadcrumb, story key, title, status pill, size pill, updated timestamp). Hierarchy strip. Story/Spec/Plan tabs.

**Task list:** Each task is a `<TaskCard>` with header (checkbox state, task key, title, progress `N/M`, chevron). Click header to expand steps. Steps rendered as `<StepRow>` with checkbox, label, timestamp. All checkboxes read-only.

**Checkbox states:**
- `done` — green filled, white checkmark
- `current` (active step, inferred as last non-done step in active task) — outlined green border, pulsing inner square (1.6s ease-in-out, opacity 1 ↔ 0.4)
- `todo` — outlined gray, no fill

**Active task:** green-border tint + `linear-gradient(180deg, rgba(62,207,142,0.08) 0%, transparent 60%)` background.

**Right rail:** Parent Documents (linked-cards to Story + Spec), Plan Progress field rows (`Tasks: N of M done`, `Steps: N of M done`, `Started: Xh Xm ago`, `Last update: Xs ago`).

### 4.3 Stories Board view (`/#/stories`)

**Data:** `GET /api/stories`. Refreshed on `story.changed` WS event.

**Layout:** Full-width. Three Kanban columns: Backlog, In Progress, Done. Each column is a bordered card with header (status dot, name, count badge) and scrollable card list.

**Story card:** Active session card has `● Active Session` label (pulsing dot). Title, type icon + story key, size badge, link indicators (spec/plan icons: green if linked file exists, muted if not). Size badge color tiers: XS/S = neutral, M = amber, L = warm orange, XL = warm red.

**Click:** Active session card → `/#/plan`. Any other card → `/#/story/:id`.

### 4.4 Story view (`/#/story/:id`)

**Data:** `GET /api/stories/:id` for frontmatter + body.

**Layout:** Issue layout. Shared issue header. Hierarchy strip. Story/Spec/Plan tabs (Spec and Plan tabs disabled/greyed if files absent for this story, with "not yet" tooltip).

**Main content:** User Story block (As/I Want/So That rendered from markdown body, left green border callout). Acceptance Criteria checklist (`N / M verified` in section header; checkboxes display-only, green-filled for done lines that start with `- [x]`). Background section if present in markdown.

**Right rail:** Derived Documents (linked-cards for Spec + Plan with plan progress bar). Frontmatter group (monospace key-value pairs).

**Editable fields:** Status pill and Size pill open a dropdown on click. `PATCH /api/stories/:id` with `{ status }` or `{ size }`. Optimistic update: update local TanStack cache immediately, roll back on error.

### 4.5 Spec view (`/#/spec`)

**Data:** `GET /api/specs/:path` (path from active story's `linked_spec` field).

**Layout:** Issue layout. Shared issue header. Hierarchy strip. Story/Spec/Plan tabs.

**Main content:** Markdown rendered with `react-markdown` + `rehype-highlight`. Code blocks use Source Code Pro, green keyword scheme (same as app monospace). Read-only.

**Right rail:** Parent Story linked-card, Derived Plan linked-card (with progress), Spec Metadata (frontmatter fields: status, version, author if present).

### 4.6 Standup view (`/#/standup`)

**Data:** `GET /api/standup` (no date param = today). Fetched fresh on navigation to view.

**Layout:** Full-width, max-width 1100px. Toolbar row: date display + Copy button. Stats grid (3 cards). Three section cards: Shipped Yesterday, In Progress, Blockers.

**Copy button:** Calls `navigator.clipboard.writeText(digest)` where `digest` is the markdown formatted output (see §5.3). Transitions to green-tinted "Copied ✓" state for 1.8s.

**Empty states:**
- No active story → Sidebar Active Story card shows "No active story yet", facet links disabled.
- Story with no linked spec/plan → facet tab shows ghost state, clicking shows "This story doesn't have a spec yet."
- WS disconnected for > 5s → Topbar pill switches to muted red "Disconnected". Plan view shows a subtle banner "Live updates paused — reconnecting…".
- No stories in board → Kanban columns show empty state message per column.

---

## 5. Backend additions

### 5.1 StandupService

`packages/server/src/standup/index.ts`

```ts
export class StandupService {
  constructor(private db: Database) {}

  generate(date: string): StandupDigest {
    // date = "YYYY-MM-DD" (previous calendar day or today)
    // "yesterday" window = midnight to midnight local time for date
    // ...
  }
}
```

**Data sources (SQLite only — no filesystem reads):**

- `shipped`: stories with `status = 'done'` whose `updated_at` timestamp falls in the previous calendar day window (midnight–midnight local time of the requested date's prior day).
- `inProgress`: stories with `status = 'in-progress'` at query time.
- `blockers`: sessions where `PostToolUseFailure` events for the same `tool_name` appear ≥ 3 times within the same session in the last 24h rolling window. Each blocker maps to the `active_story_id` of that session.

**`StandupDigest` type** (added to `@cc/shared/api.ts`):

```ts
export type StandupItem = {
  storyId: string;
  title: string;
  size: "XS" | "S" | "M" | "L" | "XL" | null;
  detail: string;   // e.g. "shipped 09:42", "4/12 plan tasks done", "pytest failing 5×"
};

export type StandupDigest = {
  date: string;              // "YYYY-MM-DD" — the date this digest covers
  shipped: StandupItem[];
  inProgress: StandupItem[];
  blockers: StandupItem[];
};
```

`StandupService` is instantiated in `startDaemon` and passed to `mountApiRoutes` via `ApiCtx`.

### 5.2 HandoffService

`packages/server/src/handoff/index.ts`

```ts
export class HandoffService {
  constructor(private cwd: string, private db: Database) {}

  async generate(storyId: string): Promise<HandoffResult>
}

export type HandoffResult = {
  filePath: string;
  content: string;
};
```

**Generation steps:**
1. Look up story row in SQLite (id, title, file_path, linked_spec_path, linked_plan_path, size, status).
2. Read story markdown body from `file_path`.
3. Read plan markdown from `linked_plan_path` if present (for task/step state section).
4. Read spec title from `linked_spec_path` frontmatter if present.
5. Assemble markdown following PRD §8.6 template: header, status block, what's done (completed tasks from plan), what's next (first incomplete task + its steps), recent activity note.
6. Write to `<cwd>/.throughline/handoffs/<YYYY-MM-DD>-<storyId>.md` (mkdir -p).
7. Insert row into `handoffs` table.
8. Return `{ filePath, content }`.

`HandoffService` is instantiated in `startDaemon` and passed to `ApiCtx`.

### 5.3 API routes

**`GET /api/standup?date=YYYY-MM-DD`**

Auth: Bearer token. Omitting `date` uses today's date. Calls `StandupService.generate(date)` and returns the `StandupDigest` as JSON.

**`POST /api/handoff/:storyId`**

Auth: Bearer token. No request body. Validates story ID against `STORY_ID_REGEX`. Calls `HandoffService.generate(storyId)`. Returns `{ filePath, content }` with 201. Returns 404 if story not found, 400 if invalid ID.

**`GET /api/handoffs`**

Auth: Bearer token. Returns `{ id, storyId, filePath, generatedAt }[]` from the `handoffs` table ordered by `generated_at DESC`.

### 5.4 Slash commands

**`plugin/commands/standup.md`**

Step 0: ensure daemon running (same bootstrap script as existing commands).  
Step 1: `GET /api/standup` (no date = today).  
Step 2: Format response as markdown:

```markdown
## Standup — <date>

### Shipped Yesterday
- <storyId> (<size>) — <detail>

### In Progress
- <storyId> (<size>) — <detail>

### Blockers
- <storyId> — <detail>
```

If a section is empty, print `(none)`.  
Print the formatted markdown to terminal.

**`plugin/commands/handoff.md`**

Usage: `/throughline:handoff <story-id>`

Step 0: ensure daemon running.  
Step 1: `POST /api/handoff/<story-id>`.  
Step 2: Print `Handoff written to <filePath>` and the full `content`.

---

## 6. Size enum cascade

The story size field expands from `S | M | L` to `XS | S | M | L | XL` (plus null). Changes required:

| Location | Change |
|---|---|
| `packages/shared/src/story.ts` | `StoryFrontmatter.size`: `"XS" \| "S" \| "M" \| "L" \| "XL" \| null` |
| `packages/shared/src/api.ts` | `StandupItem.size`, `Story.size`, `StoryPatch.size` same union |
| `packages/server/src/stories/index.ts` | No code change needed — size stored as raw string in SQLite |
| `packages/web` — `SizePill` component | Five variants: XS/S = neutral gray, M = amber, L = warm orange, XL = warm red |
| `assets/throughline-handoff.md` | Reference only — no code change |
| PRD §11 sizing convention table | Descriptive update: XS ≈ <1h single-function, XL ≈ multi-day/week+ |

No SQLite migration needed — the `size` column is `TEXT`, unconstrained.

---

## 7. Data model

No new tables required. The `handoffs` table already exists in `002_superpowers.sql`:

```sql
CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  generated_at INTEGER NOT NULL
);
```

`StandupService` reads only from `stories` and `events` tables (already exist).

---

## 8. Testing approach

### Backend (bun:test, TDD)

| Module | Test file | Key cases |
|---|---|---|
| `StandupService` | `standup/__tests__/service.test.ts` | Previous-day window boundaries (midnight local time), empty results, blocker threshold (< 3 = no blocker, ≥ 3 = blocker) |
| `HandoffService` | `handoff/__tests__/service.test.ts` | Full generation with linked plan, story with no spec/plan, invalid story ID |
| API routes | `api/__tests__/standup-handoff.test.ts` | 200 response shape, 404 on missing story, 400 on invalid ID |

### Frontend (Playwright E2E, Phase 3)

Playwright tests against a real daemon with seed data. One test per view confirming:
- Correct data renders
- WS `plan.changed` event triggers checkbox state update (Plan view)
- WS `story.changed` event updates Stories Board count
- Copy button writes correct markdown to clipboard (Standup view)
- Status/size edit on Story view calls `PATCH /api/stories/:id` and updates UI

Unit tests for `useWebSocket` hook using a mock WS server (Bun's built-in WS).

---

## 9. Open questions resolved

| Question (from design handoff §13) | Decision |
|---|---|
| Frontend framework | React 18 + Vite 5 (per PRD) |
| Routing | Hash-based (`/#/plan`) — no server catch-all needed for hash fragments |
| State management | TanStack Query v5 (REST) + Zustand (WS live state) |
| Markdown renderer | `react-markdown` + `rehype-highlight` |
| WS reconnect strategy | Exponential backoff 1s→30s, infinite retries |
| Standup time window | Previous calendar day (midnight–midnight local) |
| Story write protocol | Optimistic update via TanStack cache, rollback on error |
| SPA serving | From disk (`packages/web/dist/`) in Phase 3; embedded binary in Phase 4 |
| Story sizes | XS, S, M, L, XL, null |

---

## 10. Out of scope

Everything in `assets/throughline-handoff.md` §11 (Out of Scope) applies here. Additionally:

- Binary embedding of SPA (Phase 4)
- Subagent activity view (Phase 4)
- Settings view (Phase 4)
- Replay scrubber, token/cost meter, diff timeline (PRD P1)
- Light theme
