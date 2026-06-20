import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createElement, type ReactNode } from "react";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { useUiStore } from "../store/ui.ts";
import type { Story } from "@throughline/shared";

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
