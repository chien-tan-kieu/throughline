import { useState } from "react";
import type { PlanTask } from "@throughline/shared";
import { StepRow } from "./StepRow.tsx";

type Props = { task: PlanTask; taskIndex: number };

function getTaskState(task: PlanTask): "done" | "active" | "todo" {
  if (task.steps.every((s) => s.state === "done")) return "done";
  if (task.steps.some((s) => s.state === "done")) return "active";
  return "todo";
}

export function TaskCard({ task, taskIndex }: Props) {
  const [expanded, setExpanded] = useState(false);
  const state = getTaskState(task);
  const doneSteps = task.steps.filter((s) => s.state === "done").length;

  return (
    <div className={`task${state === "done" ? " done" : ""}${state === "active" ? " active" : ""}`}>
      <div className="task-header" onClick={() => setExpanded((e) => !e)}>
        <div className="task-check">
          {state === "done" && (
            <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11, color: "var(--bg-deepest)", display: "block" }}>
              <path d="M2 5.5 L4.5 8 L9 3" />
            </svg>
          )}
        </div>
        <span className="task-key">T{taskIndex + 1}</span>
        <span className="task-title">{task.title}</span>
        <span className="task-progress">{doneSteps}/{task.steps.length}</span>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 12, height: 12, transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 200ms ease", flexShrink: 0 }}>
          <path d="M4 3 L8 6 L4 9" />
        </svg>
      </div>
      {expanded && (
        <div className="steps">
          {task.steps.map((step, i) => {
            const isCurrentStep = state === "active" && step.state !== "done" &&
              task.steps.slice(0, i).every((s) => s.state === "done");
            return (
              <StepRow
                key={i}
                label={step.label}
                state={step.state === "done" ? "done" : isCurrentStep ? "current" : "todo"}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
