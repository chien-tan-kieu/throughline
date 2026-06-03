import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { DocsPage } from "../pages/DocsPage.tsx";

// vi.hoisted ensures mockStory is available when vi.mock factory is hoisted to top of file
const { mockStory } = vi.hoisted(() => ({
  mockStory: {
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
  },
}));

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
