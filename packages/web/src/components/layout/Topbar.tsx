import { useWsStore } from "../../store/ws.ts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

const PHASES = ["brainstorm", "spec", "plan", "implement"] as const;

export function Topbar() {
  const { connectionStatus, phase, sessionId } = useWsStore();
  const phaseIdx = phase ? PHASES.indexOf(phase) : -1;
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.fetchStatus,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
            <path d="M6 4 L18 12 L6 20 Z" fill="#0f0f0f" />
          </svg>
        </div>
        <span className="brand-name">Throughline</span>
      </div>

      <div className="topbar-divider" />

      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div className="phase-track">
          {PHASES.map((p, i) => (
            <span key={p} style={{ display: "contents" }}>
              {i > 0 && <div className="phase-sep" />}
              <div
                className={`phase-step${i < phaseIdx ? " complete" : ""}${i === phaseIdx ? " active" : ""}`}
              >
                <span className="phase-dot" />
                {p}
              </div>
            </span>
          ))}
        </div>
      </div>

      <div className="topbar-right">
        {sessionId && (
          <span className="session-id">
            <span style={{ color: "var(--text-disabled)", textTransform: "uppercase", fontSize: 9, marginRight: 4 }}>SESSION</span>
            {sessionId.slice(0, 10)}
          </span>
        )}
        {status?.version && (
          <span className="version-badge">v{status.version}</span>
        )}
        <span className={`connection-pill${connectionStatus === "disconnected" ? " disconnected" : ""}`}>
          {connectionStatus === "live" && <span className="pulse-dot" />}
          {connectionStatus === "live" ? "Live" : "Disconnected"}
        </span>
      </div>
    </header>
  );
}
