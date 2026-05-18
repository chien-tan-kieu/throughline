import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { describe, expect, test, vi } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  send(_data: string) {}
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { useWsStore } from "../store/ws.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useWebSocket", () => {
  test("opens connection with correct URL", () => {
    MockWebSocket.instances.length = 0;
    useWsStore.setState({ port: 47821, token: "abc123" });
    renderHook(() => useWebSocket(), { wrapper });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://127.0.0.1:47821/ws?token=abc123");
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
