import type { Story } from "@cc/shared";
import { useUiStore } from "../../store/ui.ts";
import { StoryCard } from "./StoryCard.tsx";

type Status = "backlog" | "in-progress" | "done";
type Props = { status: Status; stories: Story[]; isFiltered?: boolean };

const labels: Record<Status, string> = { backlog: "Backlog", "in-progress": "In Progress", done: "Done" };

export function KanbanColumn({ status, stories, isFiltered }: Props) {
  const { setStoryFilter } = useUiStore();

  return (
    <div className={`column${isFiltered ? " filtered" : ""}`}>
      <div className="column-header">
        <div className="column-title">
          <span className={`column-dot ${status}`} />
          {labels[status]}
        </div>
        <span className="column-count">{stories.length}</span>
      </div>
      <div className="card-list">
        {isFiltered ? (
          <>
            <div style={{ padding: "16px 0", color: "var(--text-disabled)", fontSize: 13 }}>
              No stories match this filter.
            </div>
            <button className="filter-clear-link" onClick={() => setStoryFilter("all")}>
              Clear filter
            </button>
          </>
        ) : stories.length === 0 ? (
          <div style={{ padding: "16px 0", color: "var(--text-disabled)", fontSize: 13 }}>No stories</div>
        ) : (
          stories.map((s) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}
