import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Story } from "@cc/shared";
import { FilterBar } from "../components/stories/FilterBar.tsx";
import { KanbanColumn } from "../components/stories/KanbanColumn.tsx";
import { api } from "../lib/api.ts";
import { useUiStore } from "../store/ui.ts";

export function StoriesPage() {
  const queryClient = useQueryClient();
  const { data: stories = [], refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["stories"],
    queryFn: api.fetchStories,
  });
  const { storyFilter } = useUiStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeStory = stories.find((s) => s.id === activeId) ?? null;

  const { mutate } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patchStory(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["stories"] });
      const prev = queryClient.getQueryData<Story[]>(["stories"]);
      queryClient.setQueryData<Story[]>(["stories"], (old = []) =>
        old.map((s) => (s.id === id ? { ...s, status } : s))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["stories"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const story = stories.find((s) => s.id === active.id);
    if (!story || story.status === over.id) return;
    mutate({ id: story.id, status: over.id as string });
  }

  const backlog = stories.filter((s) => s.status === "backlog");
  const inProgress = stories.filter((s) => s.status === "in-progress");
  const done = stories.filter((s) => s.status === "done");

  return (
    <div>
      <div className="page-header">
        <div style={{ fontFamily: "Source Code Pro, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", marginBottom: 8 }}>
          Workspace
        </div>
        <div className="issue-title">All Stories</div>
        <FilterBar
          counts={{ backlog: backlog.length, "in-progress": inProgress.length, done: done.length }}
          onRefresh={refetch}
          isFetching={isFetching}
          lastUpdatedAt={dataUpdatedAt}
        />
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="board">
          <KanbanColumn status="backlog" stories={backlog} isFiltered={storyFilter !== "all" && storyFilter !== "backlog"} />
          <KanbanColumn status="in-progress" stories={inProgress} isFiltered={storyFilter !== "all" && storyFilter !== "in-progress"} />
          <KanbanColumn status="done" stories={done} isFiltered={storyFilter !== "all" && storyFilter !== "done"} />
        </div>
        <DragOverlay>
          {activeStory ? (
            <div className="card" style={{ cursor: "grabbing" }}>
              <div className="card-title">{activeStory.title}</div>
              <div className="card-meta">
                <span className="card-key">
                  <svg viewBox="0 0 9 9" fill="currentColor" style={{ width: 9, height: 9 }}><path d="M1 1 H8 V8 L4.5 6 L1 8 Z" /></svg>
                  {activeStory.id.split("-").slice(3).join("-") || activeStory.id}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
