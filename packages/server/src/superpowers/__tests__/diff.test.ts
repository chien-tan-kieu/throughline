import { describe, expect, test } from "bun:test";
import type { ParsedPlan } from "@throughline/shared";
import { diffCheckboxState } from "../diff.ts";

function makePlan(taskSteps: Array<Array<"todo" | "done">>): ParsedPlan {
  return {
    path: "plan.md",
    title: "Test",
    tasks: taskSteps.map((steps, ti) => ({
      index: ti + 1,
      title: `Task ${ti + 1}`,
      files: [],
      steps: steps.map((state, si) => ({
        index: si + 1,
        label: `step ${si + 1}`,
        state,
      })),
    })),
  };
}

describe("diffCheckboxState", () => {
  test("returns empty array when no state changes", () => {
    const plan = makePlan([["todo", "done"]]);
    expect(diffCheckboxState(plan, plan)).toHaveLength(0);
  });

  test("detects single step completion (todo → done)", () => {
    const prev = makePlan([["todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      taskIndex: 1,
      stepIndex: 1,
      from: "todo",
      to: "done",
    });
  });

  test("detects multiple step changes across tasks", () => {
    const prev = makePlan([["todo", "todo"], ["todo"]]);
    const next = makePlan([["done", "todo"], ["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toEqual({
      taskIndex: 1,
      stepIndex: 1,
      from: "todo",
      to: "done",
    });
    expect(diffs[1]).toEqual({
      taskIndex: 2,
      stepIndex: 1,
      from: "todo",
      to: "done",
    });
  });

  test("diffs only overlapping range when task count differs", () => {
    const prev = makePlan([["todo"], ["todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].taskIndex).toBe(1);
  });

  test("diffs only overlapping step range within a task", () => {
    const prev = makePlan([["todo", "todo"]]);
    const next = makePlan([["done"]]);
    const diffs = diffCheckboxState(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].stepIndex).toBe(1);
  });
});
