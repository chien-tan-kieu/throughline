type StepState = "done" | "current" | "todo";
type Props = { label: string; state: StepState; time?: string };
export function StepRow({ label, state, time }: Props) {
  return (
    <div className={`step ${state}`}>
      <div className="step-check">
        {state === "done" && (
          <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 9, height: 9, color: "var(--bg-deepest)" }}>
            <path d="M1.5 4.5 L3.5 6.5 L7 3" />
          </svg>
        )}
      </div>
      <span className="step-label">{label}</span>
      {time && <span className="step-time">{time}</span>}
    </div>
  );
}
