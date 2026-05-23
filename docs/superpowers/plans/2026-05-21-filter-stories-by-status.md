# Filter Stories by Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side status filter to the Stories board that fades non-matching columns and persists across page navigations via a new Zustand UI store.

**Architecture:** A new `useUiStore` holds `storyFilter` state separately from `useWsStore`. A new `FilterBar` renders pill tabs that read/write this store. `KanbanColumn` gains an `isFiltered` prop that fades the column and shows a "Clear filter" empty state. `StoriesPage` reads the filter and passes `isFiltered` to each column.

**Tech Stack:** React 18, Zustand 5, Vitest, React Testing Library 16, CSS custom properties

---

## File Map

| Action | Path |
|--------|------|
| Create | `packages/web/src/store/ui.ts` |
| Create | `packages/web/src/__tests__/ui-store.test.ts` |
| Modify | `packages/web/src/index.css` |
| Create | `packages/web/src/components/stories/FilterBar.tsx` |
| Create | `packages/web/src/__tests__/FilterBar.test.tsx` |
| Modify | `packages/web/src/components/stories/KanbanColumn.tsx` |
| Create | `packages/web/src/__tests__/KanbanColumn.test.tsx` |
| Modify | `packages/web/src/pages/StoriesPage.tsx` |
| Create | `packages/web/src/__tests__/StoriesPage.test.tsx` |

---

## Task 1: `useUiStore` — filter state

**Files:**
- Create: `packages/web/src/store/ui.ts`
- Create: `packages/web/src/__tests__/ui-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/__tests__/ui-store.test.ts
import { describe, expect, test, beforeEach } from "vitest";
import { useUiStore } from "../store/ui.ts";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({ storyFilter: "all" });
  });

  test("storyFilter defaults to 'all'", () => {
    expect(useUiStore.getState().storyFilter).toBe("all");
  });

  test("setStoryFilter updates storyFilter", () => {
    useUiStore.getState().setStoryFilter("backlog");
    expect(useUiStore.getState().storyFilter).toBe("backlog");
  });

  test("setStoryFilter can reset to 'all'", () => {
    useUiStore.getState().setStoryFilter("done");
    useUiStore.getState().setStoryFilter("all");
    expect(useUiStore.getState().storyFilter).toBe("all");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/__tests__/ui-store.test.ts`

Expected: FAIL — `Cannot find module '../store/ui.ts'`

- [ ] **Step 3: Create the store**

```ts
// packages/web/src/store/ui.ts
import { create } from "zustand";

type StoryFilter = "all" | "backlog" | "in-progress" | "done";

interface UiState {
  storyFilter: StoryFilter;
  setStoryFilter: (f: StoryFilter) => void;
}

export const useUiStore = create<UiState>((set) => ({
  storyFilter: "all",
  setStoryFilter: (storyFilter) => set({ storyFilter }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/__tests__/ui-store.test.ts`

Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/store/ui.ts packages/web/src/__tests__/ui-store.test.ts
git commit -m "feat(web): add useUiStore for story filter state"
```

---

## Task 2: CSS for filter pills and filtered column

No test needed — these are visual-only CSS rules.

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Add CSS rules inside the `@layer components { }` block**

Add after the `.card-size.xl` rule (around line 213), before `/* Story view */`:

```css
  /* Filter bar */
  .filter-pills { display: flex; gap: 6px; margin-top: 10px; }
  .filter-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 9999px; border: 1px solid var(--border); color: var(--text-muted); font-family: 'Source Code Pro', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; background: transparent; transition: all 120ms ease; cursor: pointer; }
  .filter-pill:hover { border-color: var(--border-strong); color: var(--text-secondary); }
  .filter-pill.active { background: var(--green-glow); border-color: var(--green-border); color: var(--green); }
  .filter-pill .pill-badge { opacity: 0.75; }
  .filter-pill.active .pill-badge { opacity: 1; }

  /* Filtered (faded) column */
  .column.filtered { opacity: 0.28; }
  .filter-clear-link { color: var(--green); background: none; border: none; cursor: pointer; font-size: 12px; padding: 0; font-family: inherit; }
  .filter-clear-link:hover { text-decoration: underline; }
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/index.css
git commit -m "feat(web): add CSS for filter pills and filtered column"
```

---

## Task 3: `FilterBar` component

**Files:**
- Create: `packages/web/src/components/stories/FilterBar.tsx`
- Create: `packages/web/src/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/__tests__/FilterBar.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, beforeEach } from "vitest";
import { FilterBar } from "../components/stories/FilterBar.tsx";
import { useUiStore } from "../store/ui.ts";

const counts = { backlog: 3, "in-progress": 1, done: 5 };

describe("FilterBar", () => {
  beforeEach(() => {
    useUiStore.setState({ storyFilter: "all" });
  });

  test("renders four pill buttons", () => {
    render(<FilterBar counts={counts} />);
    expect(screen.getByRole("button", { name: /^all/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^backlog/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^in progress/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^done/i })).toBeTruthy();
  });

  test("All pill shows total count badge (3+1+5=9)", () => {
    render(<FilterBar counts={counts} />);
    expect(screen.getByRole("button", { name: /^all/i }).textContent).toContain("9");
  });

  test("individual pills show their counts", () => {
    render(<FilterBar counts={counts} />);
    expect(screen.getByRole("button", { name: /^backlog/i }).textContent).toContain("3");
    expect(screen.getByRole("button", { name: /^in progress/i }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /^done/i }).textContent).toContain("5");
  });

  test("All pill has 'active' class when filter is 'all'", () => {
    render(<FilterBar counts={counts} />);
    expect(screen.getByRole("button", { name: /^all/i }).className).toContain("active");
  });

  test("matching pill has 'active' class when filter is set", () => {
    useUiStore.setState({ storyFilter: "backlog" });
    render(<FilterBar counts={counts} />);
    expect(screen.getByRole("button", { name: /^backlog/i }).className).toContain("active");
    expect(screen.getByRole("button", { name: /^all/i }).className).not.toContain("active");
  });

  test("clicking a pill calls setStoryFilter with that value", () => {
    render(<FilterBar counts={counts} />);
    fireEvent.click(screen.getByRole("button", { name: /^done/i }));
    expect(useUiStore.getState().storyFilter).toBe("done");
  });

  test("clicking All pill resets filter to 'all'", () => {
    useUiStore.setState({ storyFilter: "done" });
    render(<FilterBar counts={counts} />);
    fireEvent.click(screen.getByRole("button", { name: /^all/i }));
    expect(useUiStore.getState().storyFilter).toBe("all");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/__tests__/FilterBar.test.tsx`

Expected: FAIL — `Cannot find module '../components/stories/FilterBar.tsx'`

- [ ] **Step 3: Create the component**

```tsx
// packages/web/src/components/stories/FilterBar.tsx
import { useUiStore } from "../../store/ui.ts";

type StoryFilter = "all" | "backlog" | "in-progress" | "done";

type Props = {
  counts: { backlog: number; "in-progress": number; done: number };
};

const PILLS: { value: StoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "backlog", label: "Backlog" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export function FilterBar({ counts }: Props) {
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
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/__tests__/FilterBar.test.tsx`

Expected: PASS — 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/stories/FilterBar.tsx packages/web/src/__tests__/FilterBar.test.tsx
git commit -m "feat(web): add FilterBar component with pill tabs and count badges"
```

---

## Task 4: Modify `KanbanColumn` — add `isFiltered` prop

**Files:**
- Modify: `packages/web/src/components/stories/KanbanColumn.tsx`
- Create: `packages/web/src/__tests__/KanbanColumn.test.tsx`

Context: `StoryCard` calls `useNavigate`, so all `KanbanColumn` renders must be wrapped in `MemoryRouter` from `react-router-dom`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/__tests__/KanbanColumn.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createElement, type ReactNode } from "react";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { useUiStore } from "../store/ui.ts";
import type { Story } from "@cc/shared";

const mockStories: Story[] = [
  { id: "US-2026-01-01-story-one", file_path: "f1.md", title: "Story One", status: "backlog", size: "M", linked_spec_path: null, linked_plan_path: null, created_at: 0, updated_at: 0 },
  { id: "US-2026-01-01-story-two", file_path: "f2.md", title: "Story Two", status: "backlog", size: "S", linked_spec_path: null, linked_plan_path: null, created_at: 0, updated_at: 0 },
];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, children);
}

describe("KanbanColumn", () => {
  beforeEach(() => {
    useUiStore.setState({ storyFilter: "all" });
  });

  test("renders story cards when isFiltered is false", () => {
    render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={false} />, { wrapper });
    expect(screen.getByText("Story One")).toBeTruthy();
    expect(screen.getByText("Story Two")).toBeTruthy();
  });

  test("renders story cards when isFiltered is not provided", () => {
    render(<KanbanColumn status="backlog" stories={mockStories} />, { wrapper });
    expect(screen.getByText("Story One")).toBeTruthy();
  });

  test("shows empty state message when isFiltered is true", () => {
    render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={true} />, { wrapper });
    expect(screen.getByText("No stories match this filter.")).toBeTruthy();
    expect(screen.queryByText("Story One")).toBeNull();
  });

  test("shows 'Clear filter' button when isFiltered is true", () => {
    render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={true} />, { wrapper });
    expect(screen.getByRole("button", { name: /clear filter/i })).toBeTruthy();
  });

  test("'Clear filter' button resets storyFilter to 'all'", () => {
    useUiStore.setState({ storyFilter: "in-progress" });
    render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={true} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /clear filter/i }));
    expect(useUiStore.getState().storyFilter).toBe("all");
  });

  test("column wrapper has 'filtered' class when isFiltered is true", () => {
    const { container } = render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={true} />, { wrapper });
    expect(container.querySelector(".column.filtered")).toBeTruthy();
  });

  test("column wrapper does not have 'filtered' class when isFiltered is false", () => {
    const { container } = render(<KanbanColumn status="backlog" stories={mockStories} isFiltered={false} />, { wrapper });
    expect(container.querySelector(".column.filtered")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/__tests__/KanbanColumn.test.tsx`

Expected: FAIL — tests for `isFiltered=true` behaviors fail (no `.filtered` class, no empty state)

- [ ] **Step 3: Replace the full contents of `KanbanColumn.tsx`**

```tsx
// packages/web/src/components/stories/KanbanColumn.tsx
import type { Story } from "@cc/shared";
import { useUiStore } from "../../store/ui.ts";
import { StoryCard } from "./StoryCard.tsx";

type Status = "backlog" | "in-progress" | "done";
type Props = { status: Status; stories: Story[]; isFiltered?: boolean };

const labels: Record<Status, string> = { backlog: "Backlog", "in-progress": "In Progress", done: "Done" };

export function KanbanColumn({ status, stories, isFiltered }: Props) {
  const { setStoryFilter } = useUiStore();

  return (
    <div className={`column${isFiltered ? " filtered" : ""}`}>
      <div className="column-header">
        <div className="column-title">
          <span className={`column-dot ${status}`} />
          {labels[status]}
        </div>
        <span className="column-count">{stories.length}</span>
      </div>
      <div className="card-list">
        {isFiltered ? (
          <>
            <div style={{ padding: "16px 0", color: "var(--text-disabled)", fontSize: 13 }}>
              No stories match this filter.
            </div>
            <button className="filter-clear-link" onClick={() => setStoryFilter("all")}>
              Clear filter
            </button>
          </>
        ) : stories.length === 0 ? (
          <div style={{ padding: "16px 0", color: "var(--text-disabled)", fontSize: 13 }}>No stories</div>
        ) : (
          stories.map((s) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/__tests__/KanbanColumn.test.tsx`

Expected: PASS — 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/stories/KanbanColumn.tsx packages/web/src/__tests__/KanbanColumn.test.tsx
git commit -m "feat(web): add isFiltered prop to KanbanColumn with empty state and clear action"
```

---

## Task 5: Wire `StoriesPage` — render FilterBar and pass `isFiltered`

**Files:**
- Modify: `packages/web/src/pages/StoriesPage.tsx`
- Create: `packages/web/src/__tests__/StoriesPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/__tests__/StoriesPage.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, beforeEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { StoriesPage } from "../pages/StoriesPage.tsx";
import { useUiStore } from "../store/ui.ts";

vi.mock("../lib/api.ts", () => ({
  api: {
    fetchStories: vi.fn().mockResolvedValue([
      { id: "US-2026-01-01-s1", file_path: "s1.md", title: "Backlog Story", status: "backlog", size: "S", linked_spec_path: null, linked_plan_path: null, created_at: 0, updated_at: 0 },
      { id: "US-2026-01-01-s2", file_path: "s2.md", title: "In Progress Story", status: "in-progress", size: "M", linked_spec_path: null, linked_plan_path: null, created_at: 0, updated_at: 0 },
      { id: "US-2026-01-01-s3", file_path: "s3.md", title: "Done Story", status: "done", size: "L", linked_spec_path: null, linked_plan_path: null, created_at: 0, updated_at: 0 },
    ]),
  },
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, null, children));
}

describe("StoriesPage", () => {
  beforeEach(() => {
    useUiStore.setState({ storyFilter: "all" });
  });

  test("renders FilterBar with correct total count badge", async () => {
    render(<StoriesPage />, { wrapper: Wrapper });
    const allPill = await screen.findByRole("button", { name: /^all/i });
    expect(allPill.textContent).toContain("3");
  });

  test("all columns show stories when filter is 'all'", async () => {
    render(<StoriesPage />, { wrapper: Wrapper });
    expect(await screen.findByText("Backlog Story")).toBeTruthy();
    expect(screen.getByText("In Progress Story")).toBeTruthy();
    expect(screen.getByText("Done Story")).toBeTruthy();
  });

  test("backlog filter: in-progress and done columns are faded", async () => {
    useUiStore.setState({ storyFilter: "backlog" });
    const { container } = render(<StoriesPage />, { wrapper: Wrapper });
    await screen.findByText("Backlog Story");
    expect(container.querySelectorAll(".column.filtered")).toHaveLength(2);
  });

  test("in-progress filter: backlog and done columns are faded", async () => {
    useUiStore.setState({ storyFilter: "in-progress" });
    const { container } = render(<StoriesPage />, { wrapper: Wrapper });
    await screen.findByText("In Progress Story");
    expect(container.querySelectorAll(".column.filtered")).toHaveLength(2);
  });

  test("done filter: backlog and in-progress columns are faded", async () => {
    useUiStore.setState({ storyFilter: "done" });
    const { container } = render(<StoriesPage />, { wrapper: Wrapper });
    await screen.findByText("Done Story");
    expect(container.querySelectorAll(".column.filtered")).toHaveLength(2);
  });

  test("clicking a filter pill updates the store", async () => {
    render(<StoriesPage />, { wrapper: Wrapper });
    const backlogPill = await screen.findByRole("button", { name: /^backlog/i });
    fireEvent.click(backlogPill);
    expect(useUiStore.getState().storyFilter).toBe("backlog");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/__tests__/StoriesPage.test.tsx`

Expected: FAIL — FilterBar not rendered yet, no `.filtered` columns

- [ ] **Step 3: Replace the full contents of `StoriesPage.tsx`**

```tsx
// packages/web/src/pages/StoriesPage.tsx
import { useQuery } from "@tanstack/react-query";
import { FilterBar } from "../components/stories/FilterBar.tsx";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";
import { useUiStore } from "../store/ui.ts";

export function StoriesPage() {
  const { data: stories = [] } = useQuery({
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
        <FilterBar counts={{ backlog: backlog.length, "in-progress": inProgress.length, done: done.length }} />
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

- [ ] **Step 4: Run the StoriesPage test to verify it passes**

Run: `cd packages/web && npx vitest run src/__tests__/StoriesPage.test.tsx`

Expected: PASS — 6 tests pass

- [ ] **Step 5: Run the full test suite**

Run: `cd packages/web && npx vitest run`

Expected: All tests pass (ui-store, FilterBar, KanbanColumn, StoriesPage, useWebSocket)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/StoriesPage.tsx packages/web/src/__tests__/StoriesPage.test.tsx
git commit -m "feat(web): wire StoriesPage with FilterBar and column filter props"
```
