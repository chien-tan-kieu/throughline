import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { Sidebar } from "../components/layout/Sidebar.tsx";

const mockActiveStory = vi.hoisted(() => ({
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
}));

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

  test("Story facet is active when currentPath is /story/:id", async () => {
    renderSidebar("/story/US-2026-01-01-s1");
    const btn = await screen.findByRole("button", { name: /^story$/i });
    expect(btn.className).toContain("active");
  });

  test("Story facet is not active when currentPath is /docs", async () => {
    renderSidebar("/docs");
    const btn = await screen.findByRole("button", { name: /^story$/i });
    expect(btn.className).not.toContain("active");
  });
});
