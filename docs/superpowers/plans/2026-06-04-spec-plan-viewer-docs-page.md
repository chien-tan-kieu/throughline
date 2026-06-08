# Spec/Plan Viewer → DocsPage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate SpecPage and PlanPage with a single tabbed `DocsPage`, update routing and sidebar navigation, and ship a `spec-viewer` agent skill documenting the design contract.

**Architecture:** `DocsPage` uses `useSearchParams()` for tab state (`?tab=spec` / `?tab=plan`); default tab is `spec` when `linked_spec_path` exists, otherwise `plan`. All existing data fetching is reused from the existing API endpoints. Routing replaces the old pages with a single `/docs` route plus `<Navigate>` redirects from `/`, `/plan`, and `/spec`.

**Tech Stack:** React 18, react-router-dom v6 (`useSearchParams`, `Navigate`), @tanstack/react-query, ReactMarkdown + rehype-highlight, vitest + @testing-library/react

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/web/src/components/shared/HierarchyStrip.tsx` | Add "Docs" to label union + icon |
| Modify | `packages/web/src/components/shared/LinkedCard.tsx` | Add `active` prop for accent border |
| Create | `packages/web/src/pages/DocsPage.tsx` | Combined Spec + Plan tabbed page |
| Create | `packages/web/src/__tests__/DocsPage.test.tsx` | DocsPage behavior tests |
| Modify | `packages/web/src/App.tsx` | Add `/docs` route, redirects from `/`, `/plan`, `/spec` |
| Create | `packages/web/src/__tests__/Sidebar.test.tsx` | Sidebar "Docs" facet tests |
| Modify | `packages/web/src/components/layout/Sidebar.tsx` | Replace `["story","spec","plan"]` with `["story","docs"]` |
| Modify | `packages/web/src/pages/StoryPage.tsx` | Update HierarchyStrip nodes and LinkedCard `to` props |
| Modify | `packages/web/src/index.css` | Add `.markdown ul li input[type="checkbox"]` CSS |
| Delete | `packages/web/src/pages/SpecPage.tsx` | Replaced by DocsPage |
| Delete | `packages/web/src/pages/PlanPage.tsx` | Replaced by DocsPage |
| Create | `plugin/skills/spec-viewer/SKILL.md` | Agent design contract for DocsPage |

---

### Task 1: Extend HierarchyStrip and LinkedCard

**Files:**
- Modify: `packages/web/src/components/shared/HierarchyStrip.tsx`
- Modify: `packages/web/src/components/shared/LinkedCard.tsx`

- [ ] **Step 1: Add "Docs" label + icon to HierarchyStrip**

  Replace the `Node` type and `nodeIcons` map in `HierarchyStrip.tsx`:

  ```tsx
  type Node = { label: "Story" | "Spec" | "Plan" | "Docs"; to: string; active?: boolean; meta?: string };
  type Props = { nodes: Node[] };
  const nodeIcons: Record<Node["label"], React.ReactElement> = {
    Story: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>,
    Spec: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>,
    Plan: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" /></svg>,
    Docs: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2.5h5.5l2.5 2.5v6a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" /><path d="M8.5 2.5V5H11" /><path d="M5 7h4M5 9h2.5" /></svg>,
  };
  ```

- [ ] **Step 2: Add `active` prop to LinkedCard**

  Replace the `Props` type and add conditional `style` in `LinkedCard.tsx`:

  ```tsx
  type Props = { icon: "story" | "spec" | "plan"; filename: string; sub?: string; progress?: number; to: string; active?: boolean };
  ```

  In the component body, add the border computation before the return:

  ```tsx
  const activeBorder = active
    ? icon === "spec" ? "var(--green-border)" : icon === "plan" ? "var(--blue-border)" : undefined
    : undefined;
  ```

  Add `style` to the wrapper div:

  ```tsx
  <div
    className="linked-card"
    onClick={() => navigate(to)}
    style={activeBorder ? { borderColor: activeBorder } : undefined}
  >
  ```

- [ ] **Step 3: Run web tests to confirm no regressions**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all existing tests pass (no DocsPage yet — that's fine, zero new failures).

- [ ] **Step 4: Commit**

  ```bash
  git add packages/web/src/components/shared/HierarchyStrip.tsx packages/web/src/components/shared/LinkedCard.tsx
  git commit -m "feat(shared): add Docs node to HierarchyStrip and active accent prop to LinkedCard"
  ```

---

### Task 2: DocsPage (TDD)

**Files:**
- Create: `packages/web/src/__tests__/DocsPage.test.tsx`
- Create: `packages/web/src/pages/DocsPage.tsx`

- [ ] **Step 1: Write the failing test**

  Create `packages/web/src/__tests__/DocsPage.test.tsx`:

  ```tsx
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { createElement, type ReactNode } from "react";
  import { MemoryRouter } from "react-router-dom";
  import { describe, expect, test, vi, beforeEach } from "vitest";
  import { DocsPage } from "../pages/DocsPage.tsx";

  const mockStory = {
    id: "US-2026-01-01-s1",
    file_path: "s1.md",
    title: "Test Story",
    status: "in-progress",
    size: "M",
    linked_spec_path: "docs/specs/spec.md",
    linked_plan_path: "docs/plans/plan.md",
    body: "",
    created_at: 0,
    updated_at: 0,
  };

  let wsState = { activeStoryId: "US-2026-01-01-s1", port: 47821, token: "test" };

  vi.mock("../store/ws.ts", () => ({ useWsStore: () => wsState }));
  vi.mock("../lib/api.ts", () => ({
    api: {
      fetchStory: vi.fn().mockResolvedValue(mockStory),
      fetchSpec: vi.fn().mockResolvedValue({ content: "# My Spec\n\nSpec content here." }),
      fetchPlan: vi.fn().mockResolvedValue({
        title: "My Plan",
        tasks: [
          { index: 0, title: "Task One", steps: [{ label: "Step 1", state: "done" }, { label: "Step 2", state: "todo" }] },
        ],
      }),
    },
  }));

  function makeWrapper(initialPath = "/docs") {
    return function Wrap({ children }: { children: ReactNode }) {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return createElement(
        QueryClientProvider, { client: qc },
        createElement(MemoryRouter, { initialEntries: [initialPath] }, children),
      );
    };
  }

  beforeEach(() => {
    wsState = { activeStoryId: "US-2026-01-01-s1", port: 47821, token: "test" };
  });

  describe("DocsPage", () => {
    test("defaults to Spec tab when linked_spec_path is set", async () => {
      render(<DocsPage />, { wrapper: makeWrapper() });
      await waitFor(() => expect(screen.getByText("My Spec")).toBeTruthy());
      const specTab = screen.getByRole("button", { name: /spec/i });
      expect(specTab.className).toContain("active");
    });

    test("?tab=plan shows plan content and Plan tab is active", async () => {
      render(<DocsPage />, { wrapper: makeWrapper("/docs?tab=plan") });
      await waitFor(() => expect(screen.getByText("Task One")).toBeTruthy());
      const planTab = screen.getByRole("button", { name: /plan/i });
      expect(planTab.className).toContain("active");
    });

    test("?tab=spec shows spec content", async () => {
      render(<DocsPage />, { wrapper: makeWrapper("/docs?tab=spec") });
      await waitFor(() => expect(screen.getByText("My Spec")).toBeTruthy());
    });

    test("clicking Plan tab shows plan content", async () => {
      render(<DocsPage />, { wrapper: makeWrapper() });
      await waitFor(() => expect(screen.getByText("My Spec")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: /plan/i }));
      await waitFor(() => expect(screen.getByText("Task One")).toBeTruthy());
    });

    test("clicking Spec tab shows spec content", async () => {
      render(<DocsPage />, { wrapper: makeWrapper("/docs?tab=plan") });
      await waitFor(() => expect(screen.getByText("Task One")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: /spec/i }));
      await waitFor(() => expect(screen.getByText("My Spec")).toBeTruthy());
    });

    test("no active story: shows no-story placeholder", () => {
      wsState = { activeStoryId: null as unknown as string, port: 47821, token: "test" };
      render(<DocsPage />, { wrapper: makeWrapper() });
      expect(screen.getByText(/no active story/i)).toBeTruthy();
    });

    test("spec tab: shows placeholder when linked_spec_path is null", async () => {
      const { api } = await import("../lib/api.ts");
      vi.mocked(api.fetchStory).mockResolvedValueOnce({ ...mockStory, linked_spec_path: null });
      render(<DocsPage />, { wrapper: makeWrapper("/docs?tab=spec") });
      await waitFor(() => expect(screen.getByText(/no spec linked/i)).toBeTruthy());
    });

    test("plan tab: shows placeholder when linked_plan_path is null", async () => {
      const { api } = await import("../lib/api.ts");
      vi.mocked(api.fetchStory).mockResolvedValueOnce({ ...mockStory, linked_plan_path: null });
      render(<DocsPage />, { wrapper: makeWrapper("/docs?tab=plan") });
      await waitFor(() => expect(screen.getByText(/no plan linked/i)).toBeTruthy());
    });

    test("Documents sidebar shows both spec and plan linked-cards", async () => {
      render(<DocsPage />, { wrapper: makeWrapper() });
      await waitFor(() => expect(screen.getByText("spec.md")).toBeTruthy());
      expect(screen.getByText("plan.md")).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd packages/web && bun run test -- DocsPage
  ```

  Expected: FAIL — `Cannot find module '../pages/DocsPage.tsx'`

- [ ] **Step 3: Implement DocsPage**

  Create `packages/web/src/pages/DocsPage.tsx`:

  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import ReactMarkdown from "react-markdown";
  import rehypeHighlight from "rehype-highlight";
  import { useSearchParams } from "react-router-dom";
  import type { ParsedPlan } from "@cc/shared";
  import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
  import { LinkedCard } from "../components/shared/LinkedCard.tsx";
  import { TaskCard } from "../components/shared/TaskCard.tsx";
  import { api } from "../lib/api.ts";
  import { useWsStore } from "../store/ws.ts";

  export function DocsPage() {
    const { activeStoryId } = useWsStore();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: story } = useQuery({
      queryKey: ["story", activeStoryId],
      queryFn: () => api.fetchStory(activeStoryId!),
      enabled: !!activeStoryId,
    });

    const specPath = story?.linked_spec_path ?? null;
    const planPath = story?.linked_plan_path ?? null;

    const tabParam = searchParams.get("tab");
    const defaultTab = specPath ? "spec" : "plan";
    const activeTab = tabParam === "spec" || tabParam === "plan" ? tabParam : defaultTab;

    const { data: specData } = useQuery({
      queryKey: ["spec", specPath],
      queryFn: () => api.fetchSpec(specPath!),
      enabled: !!specPath && activeTab === "spec",
    });

    const { data: planData } = useQuery({
      queryKey: ["plan", planPath],
      queryFn: () => api.fetchPlan(planPath!),
      enabled: !!planPath && activeTab === "plan",
    });

    const plan = planData as ParsedPlan | undefined;

    if (!activeStoryId || !story) {
      return (
        <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>
          No active story. Start one with <code>/claude-control:start</code>.
        </div>
      );
    }

    const doneTasks = plan ? plan.tasks.filter((t) => t.steps.every((s) => s.state === "done")).length : 0;
    const totalTasks = plan ? plan.tasks.length : 0;
    const planProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return (
      <div>
        <HierarchyStrip
          nodes={[
            { label: "Story", to: `/story/${encodeURIComponent(story.id)}` },
            { label: "Docs", to: "/docs", active: true },
          ]}
        />
        <div className="issue-tabs">
          <button
            className={`tab${activeTab === "spec" ? " active" : ""}`}
            onClick={() => setSearchParams({ tab: "spec" })}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}>
              <path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" />
              <path d="M9 1.5v2.5h2.5" />
            </svg>
            Spec
          </button>
          <button
            className={`tab${activeTab === "plan" ? " active" : ""}`}
            onClick={() => setSearchParams({ tab: "plan" })}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}>
              <rect x="2" y="2.5" width="10" height="9" rx=".5" />
              <path d="M4.5 5.5h5M4.5 7.5h5" />
            </svg>
            Plan
          </button>
        </div>

        <div className="issue-layout">
          <div className="issue-main">
            {activeTab === "spec" && (
              !specPath ? (
                <div style={{ color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>No spec linked</div>
                  <div style={{ fontSize: 13 }}>Link one with <code>/claude-control:spec</code></div>
                </div>
              ) : !specData ? (
                <div style={{ color: "var(--text-muted)" }}>Loading spec…</div>
              ) : (
                <div className="markdown">
                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                    {specData.content}
                  </ReactMarkdown>
                </div>
              )
            )}
            {activeTab === "plan" && (
              !planPath ? (
                <div style={{ color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>No plan linked</div>
                  <div style={{ fontSize: 13 }}>Link one with <code>/claude-control:plan</code></div>
                </div>
              ) : !plan ? (
                <div style={{ color: "var(--text-muted)" }}>Loading plan…</div>
              ) : (
                <div className="tasks">
                  {plan.tasks.map((task, i) => (
                    <TaskCard key={task.index} task={task} taskIndex={i} />
                  ))}
                </div>
              )
            )}
          </div>

          <div className="issue-side">
            <div className="field-group">
              <div className="field-group-title">Parent Story</div>
              <LinkedCard
                icon="story"
                filename={story.id}
                sub={story.title}
                to={`/story/${encodeURIComponent(story.id)}`}
              />
            </div>
            <div className="field-group">
              <div className="field-group-title">Documents</div>
              <LinkedCard
                icon="spec"
                filename={specPath ? (specPath.split("/").pop() ?? "spec") : "No spec linked"}
                to="/docs?tab=spec"
                active={activeTab === "spec"}
              />
              <LinkedCard
                icon="plan"
                filename={planPath ? (planPath.split("/").pop() ?? "plan") : "No plan linked"}
                sub={plan ? `${doneTasks}/${totalTasks} tasks done` : undefined}
                progress={plan ? planProgress : undefined}
                to="/docs?tab=plan"
                active={activeTab === "plan"}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd packages/web && bun run test -- DocsPage
  ```

  Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add packages/web/src/pages/DocsPage.tsx packages/web/src/__tests__/DocsPage.test.tsx
  git commit -m "feat(web): add DocsPage with tabbed Spec/Plan view"
  ```

---

### Task 3: Update App.tsx routing

**Files:**
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Replace routes with `/docs` + Navigate redirects**

  Full new content of `packages/web/src/App.tsx`:

  ```tsx
  import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
  import { Sidebar } from "./components/layout/Sidebar.tsx";
  import { Topbar } from "./components/layout/Topbar.tsx";
  import { useWebSocket } from "./hooks/useWebSocket.ts";
  import { DocsPage } from "./pages/DocsPage.tsx";
  import { StandupPage } from "./pages/StandupPage.tsx";
  import { StoriesPage } from "./pages/StoriesPage.tsx";
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
              <Route path="/" element={<Navigate to="/docs" replace />} />
              <Route path="/plan" element={<Navigate to="/docs" replace />} />
              <Route path="/spec" element={<Navigate to="/docs?tab=spec" replace />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/stories" element={<StoriesPage />} />
              <Route path="/story/:id" element={<StoryPage />} />
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

- [ ] **Step 2: Run full web test suite**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all existing tests pass (App.tsx has no direct tests; routing changes are integration-level).

- [ ] **Step 3: Commit**

  ```bash
  git add packages/web/src/App.tsx
  git commit -m "feat(web): route /docs to DocsPage, redirect / /plan /spec"
  ```

---

### Task 4: Update Sidebar (TDD)

**Files:**
- Create: `packages/web/src/__tests__/Sidebar.test.tsx`
- Modify: `packages/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the failing Sidebar test**

  Create `packages/web/src/__tests__/Sidebar.test.tsx`:

  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { createElement } from "react";
  import { MemoryRouter } from "react-router-dom";
  import { describe, expect, test, vi } from "vitest";
  import { Sidebar } from "../components/layout/Sidebar.tsx";

  const mockActiveStory = {
    id: "US-2026-01-01-s1",
    file_path: "s1.md",
    title: "Test Story",
    status: "in-progress",
    size: "M",
    linked_spec_path: "docs/specs/spec.md",
    linked_plan_path: "docs/plans/plan.md",
    body: "",
    created_at: 0,
    updated_at: 0,
  };

  vi.mock("../lib/api.ts", () => ({
    api: {
      fetchStories: vi.fn().mockResolvedValue([mockActiveStory]),
      fetchStory: vi.fn().mockResolvedValue(mockActiveStory),
    },
  }));

  vi.mock("../store/ws.ts", () => ({
    useWsStore: () => ({ activeStoryId: "US-2026-01-01-s1", port: 47821, token: "test" }),
  }));

  function renderSidebar(path = "/docs") {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      createElement(
        QueryClientProvider, { client: qc },
        createElement(MemoryRouter, { initialEntries: [path] },
          createElement(Sidebar),
        ),
      ),
    );
  }

  describe("Sidebar", () => {
    test("renders single Docs facet — no Spec or Plan facets", async () => {
      renderSidebar();
      await screen.findByText("Docs");
      expect(screen.queryByRole("button", { name: /^spec$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^plan$/i })).toBeNull();
    });

    test("Docs facet-check has 'has' class when either linked path is set", async () => {
      const { container } = renderSidebar();
      await screen.findByText("Docs");
      expect(container.querySelector(".facet-check.has")).not.toBeNull();
    });

    test("Docs facet is active when currentPath is /docs", async () => {
      renderSidebar("/docs");
      const btn = await screen.findByRole("button", { name: /docs/i });
      expect(btn.className).toContain("active");
    });

    test("Docs facet is not active when currentPath is /stories", async () => {
      renderSidebar("/stories");
      const btn = await screen.findByRole("button", { name: /docs/i });
      expect(btn.className).not.toContain("active");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd packages/web && bun run test -- Sidebar
  ```

  Expected: FAIL — "Docs" not found, "Spec" and "Plan" buttons found instead.

- [ ] **Step 3: Update Sidebar.tsx**

  Replace only the active-story nav section. The new `active-story-nav` block in `Sidebar.tsx`:

  ```tsx
  <div className="active-story-nav">
    {(["story", "docs"] as const).map((facet) => (
      <button
        key={facet}
        className={`facet-nav${currentPath === `/${facet}` ? " active" : ""}`}
        onClick={() => navigate(`/${facet}`)}
      >
        <span className="facet-nav-icon">
          {facet === "story" && (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2 H10 V12 L6 9.5 L2 12 Z" />
            </svg>
          )}
          {facet === "docs" && (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 2.5h5.5l2.5 2.5v6a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
              <path d="M8.5 2.5V5H11" />
              <path d="M5 7h4M5 9h2.5" />
            </svg>
          )}
        </span>
        {facet.charAt(0).toUpperCase() + facet.slice(1)}
        <svg
          className={`facet-check${
            facet === "story" ||
            (facet === "docs" && (activeStory.linked_spec_path || activeStory.linked_plan_path))
              ? " has"
              : ""
          }`}
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
        >
          <path d="M2 6 L5 9 L10 3" />
        </svg>
      </button>
    ))}
  </div>
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd packages/web && bun run test -- Sidebar
  ```

  Expected: all 4 tests PASS

- [ ] **Step 5: Run full web test suite**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/web/src/components/layout/Sidebar.tsx packages/web/src/__tests__/Sidebar.test.tsx
  git commit -m "feat(web): replace spec/plan facets with single docs facet in Sidebar"
  ```

---

### Task 5: Update StoryPage.tsx

**Files:**
- Modify: `packages/web/src/pages/StoryPage.tsx`

The StoryPage has two places that reference `/spec` and `/` (plan):
1. `HierarchyStrip` nodes — `to="/spec"` and `to="/"`
2. `LinkedCard` `to` props in the sidebar — `to="/spec"` and `to="/"`

- [ ] **Step 1: Update HierarchyStrip nodes in StoryPage**

  Replace the `HierarchyStrip` call (currently at line ~77):

  ```tsx
  <HierarchyStrip
    nodes={[
      { label: "Story", to: `/story/${encodeURIComponent(story.id)}`, active: true },
      ...(story.linked_spec_path ? [{ label: "Docs" as const, to: "/docs?tab=spec" }] : []),
      ...(story.linked_plan_path && !story.linked_spec_path ? [{ label: "Docs" as const, to: "/docs" }] : []),
    ]}
  />
  ```

  > Note: The strip shows "Story → Docs" when either doc is linked. If spec is linked, Docs links to the spec tab; if only plan is linked, Docs links to the plan tab (default).

- [ ] **Step 2: Update LinkedCard `to` props in StoryPage sidebar**

  Replace the "Linked Documents" field-group LinkedCards (currently at lines ~151–156):

  ```tsx
  {story.linked_spec_path && (
    <LinkedCard
      icon="spec"
      filename={story.linked_spec_path.split("/").pop() ?? "spec"}
      to="/docs?tab=spec"
    />
  )}
  {story.linked_plan_path && (
    <LinkedCard
      icon="plan"
      filename={story.linked_plan_path.split("/").pop() ?? "plan"}
      to="/docs?tab=plan"
    />
  )}
  ```

- [ ] **Step 3: Run web tests**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/web/src/pages/StoryPage.tsx
  git commit -m "feat(web): update StoryPage links to /docs with tab params"
  ```

---

### Task 6: Add checkbox CSS to index.css

**Files:**
- Modify: `packages/web/src/index.css`

The `.markdown` class in index.css currently has no styles for `input[type="checkbox"]`. Plan content can include task checkboxes rendered by ReactMarkdown, and they need proper visual treatment.

- [ ] **Step 1: Add checkbox styles after existing `.markdown` rules**

  After the `.markdown blockquote` rule (around line 259), insert:

  ```css
  .markdown ul li input[type="checkbox"] { pointer-events: none; appearance: none; -webkit-appearance: none; width: 12px; height: 12px; border: 1px solid var(--border-strong); border-radius: 2px; margin-right: 6px; vertical-align: middle; position: relative; top: -1px; flex-shrink: 0; }
  .markdown ul li input[type="checkbox"]:checked { border-color: var(--green); background: var(--green-glow); }
  .markdown ul li input[type="checkbox"]:checked::after { content: ''; position: absolute; left: 3px; top: 1px; width: 3px; height: 6px; border: 1.5px solid var(--green); border-top: none; border-left: none; transform: rotate(45deg); }
  ```

- [ ] **Step 2: Run web tests**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/web/src/index.css
  git commit -m "feat(web): add checkbox styles to .markdown for task list rendering"
  ```

---

### Task 7: Delete SpecPage and PlanPage

**Files:**
- Delete: `packages/web/src/pages/SpecPage.tsx`
- Delete: `packages/web/src/pages/PlanPage.tsx`

(There are no existing `__tests__/SpecPage.test.tsx` or `__tests__/PlanPage.test.tsx` to delete.)

- [ ] **Step 1: Delete the files**

  ```bash
  rm packages/web/src/pages/SpecPage.tsx packages/web/src/pages/PlanPage.tsx
  ```

- [ ] **Step 2: Run full web test suite to confirm nothing imports them**

  ```bash
  cd packages/web && bun run test
  ```

  Expected: all tests pass. If any test imports SpecPage or PlanPage, that test needs to be deleted too (but none should exist).

- [ ] **Step 3: Run server tests to confirm no cross-package issues**

  ```bash
  cd packages/server && bun test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add -u packages/web/src/pages/SpecPage.tsx packages/web/src/pages/PlanPage.tsx
  git commit -m "chore(web): delete SpecPage and PlanPage — replaced by DocsPage"
  ```

---

### Task 8: Create spec-viewer agent skill

**Files:**
- Create: `plugin/skills/spec-viewer/SKILL.md`

- [ ] **Step 1: Write the skill file**

  Create `plugin/skills/spec-viewer/SKILL.md`:

  ````markdown
  ---
  name: spec-viewer
  description: Design contract for building or modifying the DocsPage in claude-control dashboard
  ---

  # spec-viewer: DocsPage Design Contract

  Use this skill when building or modifying `packages/web/src/pages/DocsPage.tsx` or any component it renders. This is a visual contract — it describes the CSS structure that must be used, not implementation steps.

  > **See also:** `superpowers:frontend-design` for full aesthetic principles.

  ## 1. Design Tokens

  All colours must use CSS variables. No inline hex. No Tailwind colour utilities inside DocsPage components.

  | Variable | Semantic intent |
  |----------|----------------|
  | `--green` | Primary accent — Spec tab, active states, linked spec |
  | `--green-border` | Green accent border (rgba, subtle) |
  | `--green-glow` | Green accent background fill (very subtle) |
  | `--blue` | Secondary accent — Plan tab, done-status |
  | `--blue-border` | Blue accent border (rgba, subtle) |
  | `--blue-glow` | Blue accent background fill |
  | `--bg-elevated` | Card and panel surfaces |
  | `--bg` | Page background, tab content area, code blocks |
  | `--text-primary` | Headings, active labels |
  | `--text-secondary` | Body text, markdown prose |
  | `--text-muted` | Placeholders, empty states, metadata |
  | `--border-faint` | Tab underline, section dividers |
  | `--border` | Card edges, code block borders |
  | `--border-strong` | Unchecked checkbox border |

  ## 2. Tab Component Pattern

  ```html
  <div class="issue-tabs">
    <button class="tab active">Spec</button>   <!-- active: border-bottom: var(--green) -->
    <button class="tab">Plan</button>
  </div>
  ```

  - `.issue-tabs`: flex row, `border-bottom: 1px solid var(--border-faint)`
  - `.tab`: `padding: 8px 12px`, `color: var(--text-muted)`, `border-bottom: 2px solid transparent`
  - `.tab.active`: `color: var(--text-primary)`, `border-bottom-color: var(--green)`
  - Tab icons are 14×14 SVG strokes, same stroke as the facet nav icons

  ## 3. Markdown Rendering Contract (`.markdown`)

  The `.markdown` wrapper is required for all spec content rendered via `ReactMarkdown`.

  | Element | Style |
  |---------|-------|
  | `h1` | 22px, weight 500, `--text-primary` |
  | `h2` | 17px, weight 500, `border-top: 1px solid var(--border-faint)` (except first) |
  | `h3` | 14px, weight 500, `--text-primary` |
  | `code` (inline) | Source Code Pro, 12.5px, `color: var(--green)`, border `var(--border)` |
  | `pre` | `background: var(--bg)`, `border: 1px solid var(--border)` |
  | `blockquote` | `border-left: 2px solid var(--green-border)`, `background: var(--green-glow)` |
  | `input[type="checkbox"]` (task lists) | `pointer-events: none`, unchecked: `border: var(--border-strong)`, checked: `border: var(--green)`, `background: var(--green-glow)` |

  ## 4. Right Sidebar Pattern

  ```html
  <div class="issue-side">
    <div class="field-group">
      <div class="field-group-title">Documents</div>
      <div class="linked-card" style="border-color: var(--green-border)">  <!-- spec, active -->
        ...
      </div>
      <div class="linked-card">  <!-- plan, inactive -->
        ...
      </div>
    </div>
  </div>
  ```

  - `.field-group-title`: Source Code Pro, 10px, uppercase, letter-spacing 1.2px, `--text-muted`
  - `.linked-card`: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`
  - Active linked-card: accent border only — **no background fill change**
    - Spec active: `border-color: var(--green-border)`
    - Plan active: `border-color: var(--blue-border)`
  - Clicking a linked-card navigates to the corresponding tab URL

  ## 5. Aesthetic Principles

  - **Fonts:** Geist for prose, Source Code Pro for all labels/metadata/filenames/keys
  - **Defaults are subdued:** muted text, faint borders, elevated-but-dark backgrounds
  - **Accents are earned:** green for spec/active, blue for plan/done — applied sparingly
  - **No purple gradients, no flat white backgrounds, no Inter/Roboto**
  - All interactive elements use `transition: all 120ms ease`
  ````

- [ ] **Step 2: Run all tests one final time**

  ```bash
  bun --filter '*' test
  ```

  Expected: all server and web tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/skills/spec-viewer/SKILL.md
  git commit -m "feat(plugin): add spec-viewer skill with DocsPage design contract"
  ```
