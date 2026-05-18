import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { StandupDigest } from "@cc/shared";
import { StandupSection } from "../components/standup/StandupSection.tsx";
import { StatsGrid } from "../components/standup/StatsGrid.tsx";
import { api } from "../lib/api.ts";

function formatDigest(digest: StandupDigest): string {
  const fmt = (items: StandupDigest["shipped"]) =>
    items.length === 0
      ? "(none)"
      : items.map((i) => `- ${i.storyId} (${i.size ?? "—"}) — ${i.detail}`).join("\n");

  return [
    `## Standup — ${digest.date}`,
    "",
    "### Shipped Yesterday",
    fmt(digest.shipped),
    "",
    "### In Progress",
    fmt(digest.inProgress),
    "",
    "### Blockers",
    fmt(digest.blockers),
  ].join("\n");
}

export function StandupPage() {
  const [copied, setCopied] = useState(false);

  const { data: digest } = useQuery({
    queryKey: ["standup"],
    queryFn: () => api.fetchStandup(),
  });

  function handleCopy() {
    if (!digest) return;
    navigator.clipboard.writeText(formatDigest(digest)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div>
      <div className="report-toolbar">
        <span className="report-date">{digest?.date ?? "—"}</span>
        <button className={`copy-btn${copied ? " copied" : ""}`} onClick={handleCopy}>
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width: 13, height: 13 }}>
            <rect x="4" y="4" width="8" height="8" rx="1" />
            <path d="M2 10V2h8" />
          </svg>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="report-body">
        {digest && (
          <StatsGrid stats={[
            { label: "Shipped Yesterday", value: digest.shipped.length, accent: digest.shipped.length > 0 },
            { label: "In Progress", value: digest.inProgress.length },
            { label: "Blockers", value: digest.blockers.length },
          ]} />
        )}

        {digest ? (
          <>
            <StandupSection variant="shipped" items={digest.shipped} />
            <StandupSection variant="in-progress" items={digest.inProgress} />
            <StandupSection variant="blockers" items={digest.blockers} />
          </>
        ) : (
          <div style={{ color: "var(--text-muted)" }}>Loading standup…</div>
        )}
      </div>
    </div>
  );
}
