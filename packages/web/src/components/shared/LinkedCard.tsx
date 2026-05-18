import { useNavigate } from "react-router-dom";
type Props = { icon: "story" | "spec" | "plan"; filename: string; sub?: string; progress?: number; to: string };
const icons = {
  story: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>,
  spec: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>,
  plan: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 14, height: 14 }}><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5M4.5 9.5h3" /></svg>,
};
export function LinkedCard({ icon, filename, sub, progress, to }: Props) {
  const navigate = useNavigate();
  return (
    <div className="linked-card" onClick={() => navigate(to)}>
      {icons[icon]}
      <div className="meta">
        <span className="filename">{filename}</span>
        {sub && <span className="sub">{sub}</span>}
        {progress !== undefined && (
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        )}
      </div>
      <svg style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 3 L8 6 L4 9" />
      </svg>
    </div>
  );
}
