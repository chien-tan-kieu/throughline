type Stat = { label: string; value: number | string; accent?: boolean };
type Props = { stats: Stat[] };
export function StatsGrid({ stats }: Props) {
  return (
    <div className="report-stat-grid">
      {stats.map((s) => (
        <div key={s.label} className="report-stat">
          <div className="report-stat-label">{s.label}</div>
          <div className="report-stat-num">
            {s.accent ? <span className="accent">{s.value}</span> : s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
