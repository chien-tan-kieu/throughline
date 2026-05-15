import { describe, expect, test } from "bun:test";
import { parsePlan, parseSpec } from "../parser.ts";

describe("parsePlan (server re-export)", () => {
  test("parses fixture plan string", () => {
    const content =
      "# Feature Plan\n\n### Task 1: Do work\n\n- [ ] step one\n- [x] step two\n";
    const result = parsePlan(content, "plan.md");
    expect(result.title).toBe("Feature Plan");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].steps[0].state).toBe("todo");
    expect(result.tasks[0].steps[1].state).toBe("done");
  });
});

describe("parseSpec", () => {
  test("extracts title from first H1 and returns full body", () => {
    const content = "# My Spec\n\nSome content here.";
    const result = parseSpec(content, "specs/my-spec.md");
    expect(result.title).toBe("My Spec");
    expect(result.path).toBe("specs/my-spec.md");
    expect(result.body).toBe(content);
  });

  test("returns empty title when no H1 present", () => {
    const result = parseSpec("No heading here.", "spec.md");
    expect(result.title).toBe("");
    expect(result.body).toBe("No heading here.");
  });

  test("uses first H1 only, ignores subsequent H1s", () => {
    const content = "# First Title\n\n# Second Title\n\nBody.";
    const result = parseSpec(content, "spec.md");
    expect(result.title).toBe("First Title");
  });
});
