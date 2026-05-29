import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, beforeEach, vi } from "vitest";
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
