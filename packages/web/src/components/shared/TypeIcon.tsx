type Props = { type: "story" | "task" };
export function TypeIcon({ type }: Props) {
  return (
    <div className={`type-icon ${type}`}>
      {type === "story" && (
        <svg viewBox="0 0 9 9" fill="currentColor"><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
      )}
      {type === "task" && (
        <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="7" height="7" rx="1" /></svg>
      )}
    </div>
  );
}
