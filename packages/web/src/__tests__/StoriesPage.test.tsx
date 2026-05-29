import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    await waitFor(() => {
      const allPill = screen.getByRole("button", { name: /^all/i });
      expect(allPill.textContent).toContain("3");
    });
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

  test("renders refresh button after stories load", async () => {
    render(<StoriesPage />, { wrapper: Wrapper });
    await screen.findByText("Backlog Story");
    expect(screen.getByRole("button", { name: /refresh stories/i })).toBeTruthy();
  });
});
