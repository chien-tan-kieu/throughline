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
