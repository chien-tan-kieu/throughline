// Bootstrap DOM globals for bun test (jsdom is used by vitest via vite.config.ts but not by bun test)
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "http://localhost" });
const g = globalThis as unknown as Record<string, unknown>;
g["document"] = dom.window.document;
g["window"] = dom.window;
g["navigator"] = dom.window.navigator;
g["HTMLElement"] = dom.window.HTMLElement;
g["Element"] = dom.window.Element;
g["Node"] = dom.window.Node;
g["Text"] = dom.window.Text;
g["Comment"] = dom.window.Comment;
g["DocumentFragment"] = dom.window.DocumentFragment;
g["MutationObserver"] = dom.window.MutationObserver;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";

// Save original WebSocket before mocking so we can restore it after all tests
const _originalWebSocket = (globalThis as unknown as Record<string, unknown>)["WebSocket"];

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sentMessages: string[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  send(data: string) { this.sentMessages.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
(globalThis as unknown as Record<string, unknown>)["WebSocket"] = MockWebSocket;

import { useWsStore } from "../store/ws.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

const _originalFetch = (globalThis as unknown as Record<string, unknown>)["fetch"];

afterAll(() => {
  (globalThis as unknown as Record<string, unknown>)["WebSocket"] = _originalWebSocket;
  (globalThis as unknown as Record<string, unknown>)["fetch"] = _originalFetch;
});

afterEach(() => {
  (globalThis as unknown as Record<string, unknown>)["fetch"] = _originalFetch;
});

describe("useWebSocket", () => {
  test("opens connection without token in URL", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://127.0.0.1:47821/ws");
  });

  test("sends auth message as first message on open", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); });
    expect(MockWebSocket.instances[0].sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(MockWebSocket.instances[0].sentMessages[0])).toEqual({
      type: "auth",
      token: "abc123",
    });
  });

  test("sets connectionStatus to live on open", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "disconnected" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); });
    expect(useWsStore.getState().connectionStatus).toBe("live");
  });

  test("sets connectionStatus to disconnected on close", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", connectionStatus: "live" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => { MockWebSocket.instances[0].open(); MockWebSocket.instances[0].close(); });
    expect(useWsStore.getState().connectionStatus).toBe("disconnected");
  });

  test("sends subscribe message with topics after auth succeeds", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => {
      MockWebSocket.instances[0].open();
      MockWebSocket.instances[0].receive({ type: "auth.ok" });
    });
    const parsedMessages = MockWebSocket.instances[0].sentMessages.map((m) => JSON.parse(m));
    const subscribeMsg = parsedMessages.find((m) => m.type === "subscribe");
    expect(subscribeMsg).toBeDefined();
    expect(subscribeMsg.topics).toContain("stories");
    expect(subscribeMsg.topics).toContain("session");
  });

  test("fetches /api/sessions/current on open and hydrates activeStoryId", async () => {
    MockWebSocket.instances.length = 0;
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ sessionId: "s1", activeStoryId: "US-2026-01-01-hydrate", phase: null }),
    });
    (globalThis as unknown as Record<string, unknown>)["fetch"] = mockFetch;

    useWsStore.setState({ port: 47821, token: "abc123", activeStoryId: null });
    renderHook(() => useWebSocket(), { wrapper });

    await act(async () => {
      MockWebSocket.instances[0].open();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:47821/api/sessions/current",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer abc123" }) }),
    );
    expect(useWsStore.getState().activeStoryId).toBe("US-2026-01-01-hydrate");
  });

  test("updates phase on phase.inferred message", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "test", phase: null });
    renderHook(() => useWebSocket(), { wrapper });
    act(() => {
      MockWebSocket.instances[0].open();
      MockWebSocket.instances[0].receive({ type: "phase.inferred", data: { sessionId: "s1", phase: "implement" } });
    });
    expect(useWsStore.getState().phase).toBe("implement");
  });
});
