import { describe, expect, test } from "bun:test";
import { parsePlan } from "../plan.ts";

describe("parsePlan", () => {
  test("extracts title and single task with files and steps", () => {
    const content = `# My Feature Plan

### Task 1: Setup

**Files:**
- src/index.ts
- src/utils.ts

- [ ] Write tests
- [x] Create file
`;
    const result = parsePlan(content, "plans/feature.md");
    expect(result.title).toBe("My Feature Plan");
    expect(result.path).toBe("plans/feature.md");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].index).toBe(1);
    expect(result.tasks[0].title).toBe("Setup");
    expect(result.tasks[0].files).toEqual(["src/index.ts", "src/utils.ts"]);
    expect(result.tasks[0].steps).toHaveLength(2);
    expect(result.tasks[0].steps[0]).toEqual({ index: 1, label: "Write tests", state: "todo" });
    expect(result.tasks[0].steps[1]).toEqual({ index: 2, label: "Create file", state: "done" });
  });

  test("returns empty title and tasks for empty string", () => {
    const result = parsePlan("", "empty.md");
    expect(result.title).toBe("");
    expect(result.tasks).toHaveLength(0);
  });

  test("skips malformed checkboxes", () => {
    const content = `# Plan\n\n### Task 1: Work\n\n- [?] invalid\n- [ ] valid step\n`;
    const result = parsePlan(content, "plan.md");
    expect(result.tasks[0].steps).toHaveLength(1);
    expect(result.tasks[0].steps[0].label).toBe("valid step");
  });

  test("handles multiple tasks with mixed checkbox state", () => {
    const content = `# Multi

### Task 1: First

- [x] Done step
- [ ] Todo step

### Task 2: Second

- [ ] Another step`;
    const result = parsePlan(content, "multi.md");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].steps[0].state).toBe("done");
    expect(result.tasks[0].steps[1].state).toBe("todo");
    expect(result.tasks[1].index).toBe(2);
    expect(result.tasks[1].steps[0].state).toBe("todo");
  });

  test("returns no tasks when content has no task headers", () => {
    const result = parsePlan("# Plan with no tasks\n\nSome intro text.", "plan.md");
    expect(result.title).toBe("Plan with no tasks");
    expect(result.tasks).toHaveLength(0);
  });
});
