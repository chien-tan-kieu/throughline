import type { ParsedPlan } from "@throughline/shared";

export interface CheckboxDiff {
  taskIndex: number;
  stepIndex: number;
  from: "todo" | "done";
  to: "todo" | "done";
}

export function diffCheckboxState(
  prev: ParsedPlan,
  next: ParsedPlan,
): CheckboxDiff[] {
  const diffs: CheckboxDiff[] = [];
  const taskCount = Math.min(prev.tasks.length, next.tasks.length);
  for (let t = 0; t < taskCount; t++) {
    const prevSteps = prev.tasks[t].steps;
    const nextSteps = next.tasks[t].steps;
    const stepCount = Math.min(prevSteps.length, nextSteps.length);
    for (let s = 0; s < stepCount; s++) {
      if (prevSteps[s].state !== nextSteps[s].state) {
        diffs.push({
          taskIndex: t + 1,
          stepIndex: s + 1,
          from: prevSteps[s].state,
          to: nextSteps[s].state,
        });
      }
    }
  }
  return diffs;
}
