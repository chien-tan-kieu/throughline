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
