import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { api } from "../lib/api.ts";
import { useWsStore } from "../store/ws.ts";

export function SpecPage() {
  const { activeStoryId } = useWsStore();

  const { data: story } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const specPath = story?.linked_spec_path ?? null;

  const { data: specData } = useQuery({
    queryKey: ["spec", specPath],
    queryFn: () => api.fetchSpec(specPath!),
    enabled: !!specPath,
  });

  if (!activeStoryId || !story) {
    return <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>No active story selected.</div>;
  }

  return (
    <div>
      <HierarchyStrip
        nodes={[
          { label: "Story", to: `/story/${encodeURIComponent(story.id)}` },
          { label: "Spec", to: "/spec", active: true },
          ...(story.linked_plan_path ? [{ label: "Plan" as const, to: "/" }] : []),
        ]}
      />
      <div className="issue-layout">
        <div className="issue-main" style={{ padding: "24px 0" }}>
          {!specPath ? (
            <div style={{ color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No spec linked</div>
              <div style={{ fontSize: 13 }}>Link a spec with <code>/claude-control:spec</code></div>
            </div>
          ) : !specData ? (
            <div style={{ color: "var(--text-muted)" }}>Loading spec…</div>
          ) : (
            <div className="markdown">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {specData.content}
              </ReactMarkdown>
            </div>
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
          {specPath && (
            <div className="field-group">
              <div className="field-group-title">Spec Metadata</div>
              <div className="field">
                <span className="field-label">File</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace", wordBreak: "break-all" }}>
                  {specPath.split("/").pop()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
