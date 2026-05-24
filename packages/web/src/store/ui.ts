import { create } from "zustand";

export type StoryFilter = "all" | "backlog" | "in-progress" | "done";

interface UiState {
  storyFilter: StoryFilter;
  setStoryFilter: (f: StoryFilter) => void;
}

export const useUiStore = create<UiState>((set) => ({
  storyFilter: "all",
  setStoryFilter: (storyFilter) => set({ storyFilter }),
}));
