import { useQuery } from "@tanstack/react-query";
import type { ParsedPlan } from "@cc/shared";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { SizePill } from "../components/shared/SizePill.tsx";
import { StatusPill } from "../components/shared/StatusPill.tsx";
import { TaskCard } from "../components/shared/TaskCard.tsx";
import { TypeIcon } from "../components/shared/TypeIcon.tsx";
import { api } from "../lib/api.ts";
import { useWsStore } from "../store/ws.ts";

export function PlanPage() {
  const { activeStoryId } = useWsStore();

  const { data: story } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const planPath = story?.linked_plan_path ?? null;

  const { data: planData } = useQuery({
    queryKey: ["plan", planPath],
    queryFn: () => api.fetchPlan(planPath!),
    enabled: !!planPath,
  });

  const plan = planData as ParsedPlan | undefined;

  if (!activeStoryId || !story) {
    return (
      <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>
        No active story. Start a story with <code>/claude-control:start</code>.
      </div>
    );
  }

  return (
    <div>
      <HierarchyStrip
        nodes={[
          { label: "Story", to: `/story/${encodeURIComponent(story.id)}` },
          ...(story.linked_spec_path ? [{ label: "Spec" as const, to: "/spec" }] : []),
          { label: "Plan", to: "/", active: true },
        ]}
      />
      <div className="page-header">
        <div className="issue-key-row">
          <TypeIcon type="story" />
          <span className="issue-key">{story.id}</span>
        </div>
        <div className="issue-title">{plan?.title ?? "Plan"}</div>
        <div className="issue-actions-row">
          <StatusPill status={story.status as "backlog" | "in-progress" | "done"} />
          <SizePill size={story.size} />
        </div>
      </div>

      <div className="issue-layout">
        <div className="issue-main">
          {!planPath ? (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>No plan linked to this story yet.</div>
          ) : !plan ? (
            <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>Loading plan…</div>
          ) : (
            <div className="tasks">
              {plan.tasks.map((task, i) => (
                <TaskCard key={task.index} task={task} taskIndex={i} />
              ))}
            </div>
          )}
        </div>

        <div className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Linked Documents</div>
            {story.linked_spec_path && (
              <LinkedCard
                icon="spec"
                filename={story.linked_spec_path.split("/").pop() ?? "spec"}
                to="/spec"
              />
            )}
            {story.linked_plan_path && (
              <LinkedCard
                icon="plan"
                filename={story.linked_plan_path.split("/").pop() ?? "plan"}
                sub={plan ? `${plan.tasks.filter((t) => t.steps.every((s) => s.state === "done")).length}/${plan.tasks.length} tasks done` : undefined}
                progress={plan ? Math.round((plan.tasks.filter((t) => t.steps.every((s) => s.state === "done")).length / Math.max(plan.tasks.length, 1)) * 100) : undefined}
                to="/"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
