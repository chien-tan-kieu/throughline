import { useNavigate } from "react-router-dom";
type Node = { label: "Story" | "Spec" | "Plan"; to: string; active?: boolean; meta?: string };
type Props = { nodes: Node[] };
const nodeIcons: Record<Node["label"], React.ReactElement> = {
  Story: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2 H10 V12 L6 9.5 L2 12 Z" /></svg>,
  Spec: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" /></svg>,
  Plan: <svg className="hier-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" /></svg>,
};
const arrowIcon = (
  <svg className="hier-arrow" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7h8M8 4l3 3-3 3" />
  </svg>
);
export function HierarchyStrip({ nodes }: Props) {
  const navigate = useNavigate();
  return (
    <div className="hierarchy-strip">
      {nodes.map((node, i) => (
        <span key={node.label} style={{ display: "contents" }}>
          {i > 0 && arrowIcon}
          <button
            className={`hier-node${node.active ? " active" : ""}`}
            onClick={() => navigate(node.to)}
          >
            {nodeIcons[node.label]}
            {node.label}
            {node.meta && <span style={{ marginLeft: 4, color: "var(--text-muted)", fontSize: 11 }}>{node.meta}</span>}
          </button>
        </span>
      ))}
    </div>
  );
}
