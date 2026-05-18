import { create } from "zustand";

type Phase = "brainstorm" | "spec" | "plan" | "implement";

interface WsState {
  port: number;
  token: string;
  connectionStatus: "live" | "disconnected";
  phase: Phase | null;
  sessionId: string | null;
  activeStoryId: string | null;
  setPort: (port: number) => void;
  setToken: (token: string) => void;
  setConnectionStatus: (s: "live" | "disconnected") => void;
  setPhase: (p: Phase | null) => void;
  setSessionId: (id: string | null) => void;
  setActiveStoryId: (id: string | null) => void;
}

export const useWsStore = create<WsState>((set) => ({
  port: 0,
  token: "",
  connectionStatus: "disconnected",
  phase: null,
  sessionId: null,
  activeStoryId: null,
  setPort: (port) => set({ port }),
  setToken: (token) => set({ token }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setPhase: (phase) => set({ phase }),
  setSessionId: (sessionId) => set({ sessionId }),
  setActiveStoryId: (activeStoryId) => set({ activeStoryId }),
}));
