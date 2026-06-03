import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { StorySize } from "@cc/shared";
import { HierarchyStrip } from "../components/shared/HierarchyStrip.tsx";
import { LinkedCard } from "../components/shared/LinkedCard.tsx";
import { SizePill } from "../components/shared/SizePill.tsx";
import { StatusPill } from "../components/shared/StatusPill.tsx";
import { TypeIcon } from "../components/shared/TypeIcon.tsx";
import { api } from "../lib/api.ts";

const STATUSES = ["backlog", "in-progress", "done"] as const;
const SIZES: (StorySize | null)[] = [null, "XS", "S", "M", "L", "XL"];

function parseUserStory(body: string): { narrative: string; acceptanceCriteria: { text: string; done: boolean }[] } {
  const lines = body.split("\n");
  const asIdx = lines.findIndex((l) => /^as a/i.test(l.trim()));
  const acIdx = lines.findIndex((l) => /acceptance criteria/i.test(l));

  const narrative = asIdx >= 0
    ? lines.slice(asIdx, acIdx > asIdx ? acIdx : asIdx + 4).join(" ").trim()
    : "";

  const acLines = acIdx >= 0
    ? lines.slice(acIdx + 1)
        .filter((l) => l.trim().startsWith("-"))
        .map((l) => {
          const trimmed = l.replace(/^-\s*/, "").trim();
          const done = /^\[x\]/i.test(trimmed);
          const text = trimmed.replace(/^\[[ x]\]\s*/i, "");
          return { text, done };
        })
    : [];

  return { narrative, acceptanceCriteria: acLines };
}

export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: story } = useQuery({
    queryKey: ["story", id],
    queryFn: () => api.fetchStory(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (patch: { status?: string; size?: StorySize | null }) =>
      api.patchStory(id!, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["story", id] });
      const prev = queryClient.getQueryData(["story", id]);
      queryClient.setQueryData(["story", id], (old: typeof story) => old ? { ...old, ...patch } : old);
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      queryClient.setQueryData(["story", id], ctx?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["story", id] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });

  if (!story) {
    return <div style={{ padding: "40px 32px", color: "var(--text-muted)" }}>Loading…</div>;
  }

  const { narrative, acceptanceCriteria } = parseUserStory(story.body ?? "");

  const statusIdx = STATUSES.indexOf(story.status as typeof STATUSES[number]);
  const nextStatus = STATUSES[(statusIdx + 1) % STATUSES.length];

  return (
    <div>
      <HierarchyStrip
        nodes={[
          { label: "Story", to: `/story/${encodeURIComponent(story.id)}`, active: true },
          ...(story.linked_spec_path
            ? [{ label: "Docs" as const, to: "/docs?tab=spec" }]
            : story.linked_plan_path
            ? [{ label: "Docs" as const, to: "/docs?tab=plan" }]
            : []),
        ]}
      />
      <div className="page-header">
        <div className="issue-key-row">
          <TypeIcon type="story" />
          <span className="issue-key">{story.id}</span>
        </div>
        <div className="issue-title">{story.title}</div>
        <div className="issue-actions-row">
          <StatusPill
            status={story.status as "backlog" | "in-progress" | "done"}
            onClick={() => mutation.mutate({ status: nextStatus })}
          />
          <SizePill
            size={story.size}
            onClick={() => {
              const idx = SIZES.indexOf(story.size);
              const nextSize = SIZES[(idx + 1) % SIZES.length];
              mutation.mutate({ size: nextSize });
            }}
          />
        </div>
      </div>

      <div className="issue-layout">
        <div className="issue-main">
          {narrative && (
            <div className="story-quote">
              <span className="form">Story</span>
              <span className="form-text">{narrative}</span>
            </div>
          )}

          {acceptanceCriteria.length > 0 && (
            <>
              <div className="section-h">Acceptance Criteria</div>
              <div className="ac-list">
                {acceptanceCriteria.map((ac, i) => (
                  <div key={i} className={`ac-item${ac.done ? " done" : ""}`}>
                    <div className="ac-check">
                      {ac.done && (
                        <svg viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" style={{ width: 8, height: 8 }}>
                          <path d="M1.5 5l2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </div>
                    {ac.text}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="issue-side">
          <div className="field-group">
            <div className="field-group-title">Properties</div>
            <div className="field">
              <span className="field-label">Status</span>
              <StatusPill status={story.status as "backlog" | "in-progress" | "done"} />
            </div>
            <div className="field">
              <span className="field-label">Size</span>
              <SizePill size={story.size} />
            </div>
          </div>

          {(story.linked_spec_path || story.linked_plan_path) && (
            <div className="field-group">
              <div className="field-group-title">Linked Documents</div>
              {story.linked_spec_path && (
                <LinkedCard
                  icon="spec"
                  filename={story.linked_spec_path.split("/").pop() ?? "spec"}
                  to="/docs?tab=spec"
                />
              )}
              {story.linked_plan_path && (
                <LinkedCard
                  icon="plan"
                  filename={story.linked_plan_path.split("/").pop() ?? "plan"}
                  to="/docs?tab=plan"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
