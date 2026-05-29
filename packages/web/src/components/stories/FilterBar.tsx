import { useUiStore, type StoryFilter } from "../../store/ui.ts";

type Props = {
  counts: { backlog: number; "in-progress": number; done: number };
  onRefresh?: () => void;
  isFetching?: boolean;
  lastUpdatedAt?: number;
};

const PILLS: { value: StoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "backlog", label: "Backlog" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function FilterBar({ counts, onRefresh, isFetching, lastUpdatedAt }: Props) {
  const { storyFilter, setStoryFilter } = useUiStore();
  const total = counts.backlog + counts["in-progress"] + counts.done;

  function badgeCount(value: StoryFilter): number {
    if (value === "all") return total;
    return counts[value as keyof typeof counts] ?? 0;
  }

  return (
    <div className="filter-pills">
      {PILLS.map(({ value, label }) => (
        <button
          key={value}
          className={`filter-pill${storyFilter === value ? " active" : ""}`}
          onClick={() => setStoryFilter(value)}
        >
          {label}
          <span className="pill-badge">· {badgeCount(value)}</span>
        </button>
      ))}
      {onRefresh && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdatedAt ? (
            <span className="updated-label">Updated {formatTime(lastUpdatedAt)}</span>
          ) : null}
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={isFetching}
            aria-label="Refresh stories"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              width="14"
              height="14"
              stroke="currentColor"
              strokeWidth="1.5"
              className={isFetching ? "spinning" : ""}
            >
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
              <path d="M12.5 2v2.7H9.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
