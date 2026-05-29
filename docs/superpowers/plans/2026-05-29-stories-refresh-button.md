# Stories Board — Refresh Button & Last Updated Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline refresh button and absolute "last updated" timestamp to the right end of the stories board filter-pills row.

**Architecture:** CSS changes land first (no logic, instant verification), then FilterBar gains the new props and renders the control, then StoriesPage wires up the React Query extras. Each task is independently committable.

**Tech Stack:** React 18, React Query v5, Vitest + Testing Library, Tailwind + custom CSS (index.css)

---

## File map

| File | Change |
|------|--------|
| `packages/web/src/index.css` | Update `.filter-pills`; add `.updated-label`, `.refresh-btn`, `.spinning` |
| `packages/web/src/components/stories/FilterBar.tsx` | Add `onRefresh`, `isFetching`, `lastUpdatedAt` props; render timestamp + icon button |
| `packages/web/src/__tests__/FilterBar.test.tsx` | Add tests for the new props/behavior |
| `packages/web/src/pages/StoriesPage.tsx` | Pull `refetch`, `isFetching`, `dataUpdatedAt` from `useQuery`; forward to `FilterBar` |
| `packages/web/src/__tests__/StoriesPage.test.tsx` | Add test verifying refresh button is rendered |

---

## Task 1 — CSS: add styles for the refresh control

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Update the `.filter-pills` rule**

Find this line (around line 216):
```css
.filter-pills { display: flex; gap: 6px; margin-top: 10px; }
```
Replace with:
```css
.filter-pills { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
```

- [ ] **Step 2: Add new rules after the `.filter-pill.active .pill-badge` rule (around line 221)**

```css
  .updated-label { font-family: 'Source Code Pro', monospace; font-size: 10px; color: var(--text-disabled); white-space: nowrap; }
  .refresh-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; color: var(--text-muted); border-radius: 3px; transition: color 120ms ease; }
  .refresh-btn:hover:not(:disabled) { color: var(--text-primary); }
  .refresh-btn:disabled { opacity: 0.4; cursor: default; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinning { animation: spin 600ms linear infinite; }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/index.css
git commit -m "style: add refresh-btn, updated-label, spinning styles to filter bar"
```

---

## Task 2 — FilterBar: add props and render the refresh control

**Files:**
- Modify: `packages/web/src/components/stories/FilterBar.tsx`
- Modify: `packages/web/src/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Open `packages/web/src/__tests__/FilterBar.test.tsx`. Add `vi` to the import from `"vitest"`:
```ts
import { describe, expect, test, beforeEach, vi } from "vitest";
```

Append a new `describe` block at the end of the file (after the closing `}` of the existing `describe("FilterBar", ...)`):

```tsx
describe("FilterBar — refresh control", () => {
  test("renders refresh button when onRefresh prop is provided", () => {
    render(<FilterBar counts={counts} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: /refresh stories/i })).toBeTruthy();
  });

  test("does not render refresh button when onRefresh is not provided", () => {
    render(<FilterBar counts={counts} />);
    expect(screen.queryByRole("button", { name: /refresh stories/i })).toBeNull();
  });

  test("calls onRefresh when refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<FilterBar counts={counts} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: /refresh stories/i }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  test("refresh button is disabled when isFetching is true", () => {
    render(<FilterBar counts={counts} onRefresh={vi.fn()} isFetching={true} />);
    expect(screen.getByRole("button", { name: /refresh stories/i })).toBeDisabled();
  });

  test("refresh button is enabled when isFetching is false", () => {
    render(<FilterBar counts={counts} onRefresh={vi.fn()} isFetching={false} />);
    expect(screen.getByRole("button", { name: /refresh stories/i })).not.toBeDisabled();
  });

  test("shows 'Updated' timestamp when lastUpdatedAt is non-zero", () => {
    render(<FilterBar counts={counts} onRefresh={vi.fn()} lastUpdatedAt={1748519520000} />);
    expect(screen.getByText(/updated/i)).toBeTruthy();
  });

  test("hides timestamp when lastUpdatedAt is 0", () => {
    render(<FilterBar counts={counts} onRefresh={vi.fn()} lastUpdatedAt={0} />);
    expect(screen.queryByText(/updated/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd packages/web && pnpm test --run src/__tests__/FilterBar.test.tsx
```

Expected: 7 new tests FAIL with errors like "Unable to find an accessible element with the role 'button' and name /refresh stories/i"

- [ ] **Step 3: Implement FilterBar changes**

Replace the entire content of `packages/web/src/components/stories/FilterBar.tsx` with:

```tsx
import { useUiStore, type StoryFilter } from "../../store/ui.ts";

type Props = {
  counts: { backlog: number; "in-progress": number; done: number };
  onRefresh?: () => void;
  isFetching?: boolean;
  lastUpdatedAt?: number;
};

const PILLS: { value: StoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "backlog", label: "Backlog" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function FilterBar({ counts, onRefresh, isFetching, lastUpdatedAt }: Props) {
  const { storyFilter, setStoryFilter } = useUiStore();
  const total = counts.backlog + counts["in-progress"] + counts.done;

  function badgeCount(value: StoryFilter): number {
    if (value === "all") return total;
    return counts[value as keyof typeof counts] ?? 0;
  }

  return (
    <div className="filter-pills">
      {PILLS.map(({ value, label }) => (
        <button
          key={value}
          className={`filter-pill${storyFilter === value ? " active" : ""}`}
          onClick={() => setStoryFilter(value)}
        >
          {label}
          <span className="pill-badge">· {badgeCount(value)}</span>
        </button>
      ))}
      {onRefresh && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdatedAt ? (
            <span className="updated-label">Updated {formatTime(lastUpdatedAt)}</span>
          ) : null}
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={isFetching}
            aria-label="Refresh stories"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              width="14"
              height="14"
              stroke="currentColor"
              strokeWidth="1.5"
              className={isFetching ? "spinning" : ""}
            >
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
              <path d="M12.5 2v2.7H9.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
cd packages/web && pnpm test --run src/__tests__/FilterBar.test.tsx
```

Expected: all 13 tests PASS (6 existing + 7 new)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/stories/FilterBar.tsx packages/web/src/__tests__/FilterBar.test.tsx
git commit -m "feat: add refresh button and last-updated timestamp to FilterBar"
```

---

## Task 3 — StoriesPage: wire up React Query extras

**Files:**
- Modify: `packages/web/src/pages/StoriesPage.tsx`
- Modify: `packages/web/src/__tests__/StoriesPage.test.tsx`

- [ ] **Step 1: Write failing test**

Open `packages/web/src/__tests__/StoriesPage.test.tsx`. Append inside the existing `describe("StoriesPage", ...)` block:

```tsx
  test("renders refresh button after stories load", async () => {
    render(<StoriesPage />, { wrapper: Wrapper });
    await screen.findByText("Backlog Story");
    expect(screen.getByRole("button", { name: /refresh stories/i })).toBeTruthy();
  });
```

- [ ] **Step 2: Run test and confirm it fails**

```bash
cd packages/web && pnpm test --run src/__tests__/StoriesPage.test.tsx
```

Expected: 1 new test FAIL — "Unable to find an accessible element with the role 'button' and name /refresh stories/i"

- [ ] **Step 3: Implement StoriesPage changes**

Replace the entire content of `packages/web/src/pages/StoriesPage.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { FilterBar } from "../components/stories/FilterBar.tsx";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";
import { useUiStore } from "../store/ui.ts";

export function StoriesPage() {
  const { data: stories = [], refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });
  const { storyFilter } = useUiStore();

  const backlog = stories.filter((s) => s.status === "backlog");
  const inProgress = stories.filter((s) => s.status === "in-progress");
  const done = stories.filter((s) => s.status === "done");

  return (
    <div>
      <div className="page-header">
        <div style={{ fontFamily: "Source Code Pro, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", marginBottom: 8 }}>
          Workspace
        </div>
        <div className="issue-title">All Stories</div>
        <FilterBar
          counts={{ backlog: backlog.length, "in-progress": inProgress.length, done: done.length }}
          onRefresh={refetch}
          isFetching={isFetching}
          lastUpdatedAt={dataUpdatedAt}
        />
      </div>
      <div className="board">
        <KanbanColumn status="backlog" stories={backlog} isFiltered={storyFilter !== "all" && storyFilter !== "backlog"} />
        <KanbanColumn status="in-progress" stories={inProgress} isFiltered={storyFilter !== "all" && storyFilter !== "in-progress"} />
        <KanbanColumn status="done" stories={done} isFiltered={storyFilter !== "all" && storyFilter !== "done"} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run all web tests and confirm green**

```bash
cd packages/web && pnpm test --run
```

Expected: all tests PASS (no failures)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/StoriesPage.tsx packages/web/src/__tests__/StoriesPage.test.tsx
git commit -m "feat: wire refetch and dataUpdatedAt from useQuery into FilterBar"
```

---

## Task 4 — Build and verify in browser

**Files:** none (build output only)

- [ ] **Step 1: Build the frontend**

```bash
cd packages/web && pnpm build
```

Expected output ends with: `✓ built in ...ms`

- [ ] **Step 2: Open the dashboard and verify**

Open `http://127.0.0.1:<port>/#token=<token>` (get port/token from `<project-root>/.claude-control/runtime.json`).

Navigate to **Stories**. Confirm:
- A `↻` icon button appears at the right end of the filter-pills row
- `Updated HH:MM` timestamp appears next to it (once data has loaded)
- Clicking `↻` visibly spins the icon briefly, then stops
- The timestamp updates to the current time after the refresh completes
- The button is unclickable (appears faded) while the icon is spinning

- [ ] **Step 3: Commit**

No code changes — build artifact is not committed.
