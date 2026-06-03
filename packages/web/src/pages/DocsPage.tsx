import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { useSearchParams } from "react-router-dom";
import type { ParsedPlan } from "@cc/shared";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { TaskCard } from "../components/shared/TaskCard.tsx";
import { api } from "../lib/api.ts";
import { useWsStore } from "../store/ws.ts";

export function DocsPage() {
  const { activeStoryId } = useWsStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: story } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const specPath = story?.linked_spec_path ?? null;
  const planPath = story?.linked_plan_path ?? null;

  const tabParam = searchParams.get("tab");
  const defaultTab = specPath ? "spec" : "plan";
  const activeTab = tabParam === "spec" || tabParam === "plan" ? tabParam : defaultTab;

  const { data: specData } = useQuery({
    queryKey: ["spec", specPath],
    queryFn: () => api.fetchSpec(specPath!),
    enabled: !!specPath && activeTab === "spec",
  });

  const { data: planData } = useQuery({
    queryKey: ["plan", planPath],
    queryFn: () => api.fetchPlan(planPath!),
    enabled: !!planPath && activeTab === "plan",
  });

  const plan = planData as ParsedPlan | undefined;

  if (!activeStoryId || !story) {
    return (
      <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>
        No active story. Start one with <code>/claude-control:start</code>.
      </div>
    );
  }

  const doneTasks = plan ? plan.tasks.filter((t) => t.steps.every((s) => s.state === "done")).length : 0;
  const totalTasks = plan ? plan.tasks.length : 0;
  const planProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div>
      <HierarchyStrip
        nodes={[
          { label: "Story", to: `/story/${encodeURIComponent(story.id)}` },
          { label: "Docs", to: "/docs", active: true },
        ]}
      />
      <div className="issue-tabs">
        <button
          className={`tab${activeTab === "spec" ? " active" : ""}`}
          onClick={() => setSearchParams({ tab: "spec" })}
        >
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}>
            <path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" />
            <path d="M9 1.5v2.5h2.5" />
          </svg>
          Spec
        </button>
        <button
          className={`tab${activeTab === "plan" ? " active" : ""}`}
          onClick={() => setSearchParams({ tab: "plan" })}
        >
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}>
            <rect x="2" y="2.5" width="10" height="9" rx=".5" />
            <path d="M4.5 5.5h5M4.5 7.5h5" />
          </svg>
          Plan
        </button>
      </div>

      <div className="issue-layout">
        <div className="issue-main">
          {activeTab === "spec" && (
            !specPath ? (
              <div style={{ color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>No spec linked</div>
                <div style={{ fontSize: 13 }}>Link one with <code>/claude-control:spec</code></div>
              </div>
            ) : !specData ? (
              <div style={{ color: "var(--text-muted)" }}>Loading spec…</div>
            ) : (
              <div className="markdown">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                  {specData.content}
                </ReactMarkdown>
              </div>
            )
          )}
          {activeTab === "plan" && (
            !planPath ? (
              <div style={{ color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>No plan linked</div>
                <div style={{ fontSize: 13 }}>Link one with <code>/claude-control:plan</code></div>
              </div>
            ) : !plan ? (
              <div style={{ color: "var(--text-muted)" }}>Loading plan…</div>
            ) : (
              <div className="tasks">
                {plan.tasks.map((task, i) => (
                  <TaskCard key={task.index} task={task} taskIndex={i} />
                ))}
              </div>
            )
          )}
        </div>

        <div className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Parent Story</div>
            <LinkedCard
              icon="story"
              filename={story.id}
              sub={story.title}
              to={`/story/${encodeURIComponent(story.id)}`}
            />
          </div>
          <div className="field-group">
            <div className="field-group-title">Documents</div>
            <LinkedCard
              icon="spec"
              filename={specPath ? (specPath.split("/").pop() ?? "spec") : "Not linked"}
              to="/docs?tab=spec"
              active={activeTab === "spec"}
            />
            <LinkedCard
              icon="plan"
              filename={planPath ? (planPath.split("/").pop() ?? "plan") : "Not linked"}
              sub={plan ? `${doneTasks}/${totalTasks} tasks done` : undefined}
              progress={plan ? planProgress : undefined}
              to="/docs?tab=plan"
              active={activeTab === "plan"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
