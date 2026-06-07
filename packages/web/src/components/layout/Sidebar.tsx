import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.ts";
import { useWsStore } from "../../store/ws.ts";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeStoryId } = useWsStore();

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });

  const { data: activeStory } = useQuery({
    queryKey: ["story", activeStoryId],
    queryFn: () => api.fetchStory(activeStoryId!),
    enabled: !!activeStoryId,
  });

  const currentPath = location.pathname;
  const totalStories = stories.length;

  return (
    <aside className="sidebar">
      <div className="nav-section">
        <div className="nav-label">Active Story</div>
        {activeStory ? (
          <div className="active-story">
            <div className="active-story-header">
              <div className="active-story-top">
                <div className="type-icon story">
                  <svg viewBox="0 0 9 9" fill="currentColor"><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
                </div>
                <span className="active-story-key">{activeStory.id}</span>
                <span className="active-status-mini">{activeStory.status}</span>
              </div>
              <div className="active-story-title">{activeStory.title}</div>
            </div>
            <div className="active-story-nav">
              {(["story", "docs"] as const).map((facet) => (
                <button
                  key={facet}
                  className={`facet-nav${
                    facet === "story"
                      ? currentPath.startsWith("/story/") ? " active" : ""
                      : currentPath === `/${facet}` ? " active" : ""
                  }`}
                  onClick={() =>
                    navigate(
                      facet === "story"
                        ? `/story/${encodeURIComponent(activeStory.id)}`
                        : `/${facet}`,
                    )
                  }
                >
                  <span className="facet-nav-icon">
                    {facet === "story" && (
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2 H10 V12 L6 9.5 L2 12 Z" />
                      </svg>
                    )}
                    {facet === "docs" && (
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 2.5h5.5l2.5 2.5v6a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
                        <path d="M8.5 2.5V5H11" />
                        <path d="M5 7h4M5 9h2.5" />
                      </svg>
                    )}
                  </span>
                  {facet.charAt(0).toUpperCase() + facet.slice(1)}
                  <svg
                    className={`facet-check${
                      facet === "story" ||
                      (facet === "docs" && (activeStory.linked_spec_path || activeStory.linked_plan_path))
                        ? " has"
                        : ""
                    }`}
                    viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
                  >
                    <path d="M2 6 L5 9 L10 3" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px", color: "var(--text-muted)", fontSize: 12 }}>No active story yet</div>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-label">Workspace</div>
        <button
          className={`nav-item${currentPath === "/stories" ? " active" : ""}`}
          onClick={() => navigate("/stories")}
        >
          <svg style={{ width: 16, height: 16 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="3.5" height="11" rx=".5" />
            <rect x="6.5" y="2.5" width="3.5" height="8" rx=".5" />
            <rect x="11" y="2.5" width="3" height="6" rx=".5" />
          </svg>
          All Stories
          <span className="nav-badge">{totalStories}</span>
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-label">Reports</div>
        <button
          className={`nav-item${currentPath === "/standup" ? " active" : ""}`}
          onClick={() => navigate("/standup")}
        >
          <svg style={{ width: 16, height: 16 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 13 L6 8 L9 11 L14 4" />
            <path d="M11 4h3v3" />
          </svg>
          Standup
        </button>
      </div>
    </aside>
  );
}
