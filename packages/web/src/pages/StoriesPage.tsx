import { useQuery } from "@tanstack/react-query";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";

export function StoriesPage() {
  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });

  const backlog = stories.filter((s) => s.status === "backlog");
  const inProgress = stories.filter((s) => s.status === "in-progress");
  const done = stories.filter((s) => s.status === "done");

  return (
    <div>
      <div className="page-header">
        <div style={{ fontFamily: "Source Code Pro, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", marginBottom: 8 }}>
          Workspace
        </div>
        <div className="issue-title">All Stories</div>
      </div>
      <div className="board">
        <KanbanColumn status="backlog" stories={backlog} />
        <KanbanColumn status="in-progress" stories={inProgress} />
        <KanbanColumn status="done" stories={done} />
      </div>
    </div>
  );
}
