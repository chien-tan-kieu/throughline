import { useUiStore } from "../../store/ui.ts";

type StoryFilter = "all" | "backlog" | "in-progress" | "done";

type Props = {
  counts: { backlog: number; "in-progress": number; done: number };
};

const PILLS: { value: StoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "backlog", label: "Backlog" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export function FilterBar({ counts }: Props) {
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
    </div>
  );
}
