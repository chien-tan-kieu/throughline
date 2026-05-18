type Status = "backlog" | "in-progress" | "done";
type Props = { status: Status; onClick?: () => void };
const labels: Record<Status, string> = { backlog: "Backlog", "in-progress": "In Progress", done: "Done" };
export function StatusPill({ status, onClick }: Props) {
  return (
    <button className={`status-pill ${status}`} onClick={onClick}>
      {status === "in-progress" && (
        <svg viewBox="0 0 10 10" fill="currentColor" style={{ width: 8, height: 8 }}><circle cx="5" cy="5" r="2" /></svg>
      )}
      {labels[status]}
      {onClick && (
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 9, height: 9 }}>
          <path d="M3 4 L5 6 L7 4" />
        </svg>
      )}
    </button>
  );
}
