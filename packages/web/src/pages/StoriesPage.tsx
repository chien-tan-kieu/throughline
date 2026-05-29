import { useQuery } from "@tanstack/react-query";
import { FilterBar } from "../components/stories/FilterBar.tsx";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";
import { useUiStore } from "../store/ui.ts";

export function StoriesPage() {
  const { data: stories = [], refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });
  const { storyFilter } = useUiStore();

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
        <FilterBar
          counts={{ backlog: backlog.length, "in-progress": inProgress.length, done: done.length }}
          onRefresh={refetch}
          isFetching={isFetching}
          lastUpdatedAt={dataUpdatedAt}
        />
      </div>
      <div className="board">
        <KanbanColumn status="backlog" stories={backlog} isFiltered={storyFilter !== "all" && storyFilter !== "backlog"} />
        <KanbanColumn status="in-progress" stories={inProgress} isFiltered={storyFilter !== "all" && storyFilter !== "in-progress"} />
        <KanbanColumn status="done" stories={done} isFiltered={storyFilter !== "all" && storyFilter !== "done"} />
      </div>
    </div>
  );
}
