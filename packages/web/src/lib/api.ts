import type { StandupDigest, StoryDetail, StoryPatch, Story } from "@throughline/shared";
import { useWsStore } from "../store/ws.ts";

function base() {
  const { port, token } = useWsStore.getState();
  return { url: `http://127.0.0.1:${port}`, token };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, token } = base();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  fetchStories: () => apiFetch<Story[]>("/api/stories"),
  fetchStory: (id: string) => apiFetch<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`),
  fetchPlan: (path: string) => apiFetch<unknown>(`/api/plans/${encodeURIComponent(path)}`),
  fetchSpec: (path: string) => apiFetch<{ path: string; title: string; body: string }>(`/api/specs/${encodeURIComponent(path)}`),
  fetchStandup: (date?: string) => apiFetch<StandupDigest>(`/api/standup${date ? `?date=${date}` : ""}`),
  patchStory: (id: string, patch: StoryPatch) =>
    apiFetch<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  postHandoff: (storyId: string) =>
    apiFetch<{ filePath: string; content: string }>(`/api/handoff/${encodeURIComponent(storyId)}`, { method: "POST" }),
  fetchStatus: () => apiFetch<{ status: string; version: string }>("/api/status"),
};
