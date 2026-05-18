import { useNavigate } from "react-router-dom";
import type { Story } from "@cc/shared";
import { useWsStore } from "../../store/ws.ts";

type Props = { story: Story };

export function StoryCard({ story }: Props) {
  const navigate = useNavigate();
  const { activeStoryId } = useWsStore();
  const isActive = story.id === activeStoryId;

  return (
    <div
      className={`card${isActive ? " active" : ""}`}
      onClick={() => navigate(isActive ? "/" : `/story/${encodeURIComponent(story.id)}`)}
    >
      {isActive && (
        <div className="card-active-label">
          <span className="pulse-dot" />
          Active
        </div>
      )}
      <div className="card-title">{story.title}</div>
      <div className="card-meta">
        <span className="card-key">
          <svg viewBox="0 0 9 9" fill="currentColor" style={{ width: 9, height: 9 }}><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
          {story.id.split("-").slice(3).join("-") || story.id}
        </span>
        <div className="card-meta-right">
          {story.linked_spec_path && (
            <svg className={`card-link-icon${isActive ? " active" : ""}`} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 1.5h6l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" /><path d="M9 1.5v2.5h2.5" />
            </svg>
          )}
          {story.linked_plan_path && (
            <svg className={`card-link-icon${isActive ? " active" : ""}`} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="2.5" width="10" height="9" rx=".5" /><path d="M4.5 5.5h5M4.5 7.5h5" />
            </svg>
          )}
          {story.size && (
            <span className={`card-size ${story.size.toLowerCase()}`}>{story.size}</span>
          )}
        </div>
      </div>
    </div>
  );
}
