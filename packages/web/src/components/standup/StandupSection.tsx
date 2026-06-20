import type { StandupItem } from "@throughline/shared";
type Variant = "shipped" | "in-progress" | "blockers";
type Props = { variant: Variant; items: StandupItem[] };
const titles: Record<Variant, string> = {
  shipped: "Shipped Yesterday",
  "in-progress": "In Progress",
  blockers: "Blockers",
};
export function StandupSection({ variant, items }: Props) {
  return (
    <div className={`report-section ${variant}`}>
      <div className="report-section-header">
        <div className="report-section-title">{titles[variant]}</div>
        <span className="report-section-count">{items.length}</span>
      </div>
      <div className="report-rows">
        {items.length === 0 ? (
          <div className="report-row" style={{ color: "var(--text-disabled)", gridTemplateColumns: "1fr" }}>(none)</div>
        ) : (
          items.map((item) => (
            <div key={item.storyId} className="report-row">
              <span className="report-row-key">{item.storyId.split("-").slice(3).join("-") || item.storyId}</span>
              <div className="type-icon story" style={{ width: 16, height: 16 }}>
                <svg viewBox="0 0 9 9" fill="currentColor" style={{ width: 9, height: 9 }}><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
              </div>
              <span className="report-row-text"><strong>{item.title}</strong>{" — "}{item.detail}</span>
              <span className="report-row-meta">{item.size ?? "—"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
