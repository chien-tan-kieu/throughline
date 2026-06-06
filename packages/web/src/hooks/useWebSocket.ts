import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useWsStore } from "../store/ws.ts";

export function useWebSocket() {
  const { port, token, setConnectionStatus, setPhase, setSessionId, setActiveStoryId } = useWsStore();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelayRef = useRef(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!port || !token) return;

    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token }));
        ws.send(JSON.stringify({ type: "subscribe", topics: ["stories", "session"] }));
        setConnectionStatus("live");
        retryDelayRef.current = 1000;
        fetch(`http://127.0.0.1:${port}/api/sessions/current`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data: { sessionId: string | null; activeStoryId: string | null; phase: string | null }) => {
            setActiveStoryId(data.activeStoryId);
            if (data.phase) setPhase(data.phase as Parameters<typeof setPhase>[0]);
            if (data.sessionId) setSessionId(data.sessionId);
          })
          .catch(() => {});
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "plan.changed") {
            queryClient.invalidateQueries({ queryKey: ["plan", msg.data.path] });
          } else if (msg.type === "story.changed") {
            queryClient.invalidateQueries({ queryKey: ["stories"] });
            queryClient.invalidateQueries({ queryKey: ["story", msg.data.id] });
          } else if (msg.type === "phase.inferred") {
            setPhase(msg.data.phase);
            setSessionId(msg.data.sessionId);
          } else if (msg.type === "session.updated") {
            setActiveStoryId(msg.data.activeStoryId ?? null);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        const delay = Math.min(retryDelayRef.current * 2, 30_000);
        retryDelayRef.current = delay;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      destroyed = true;
      retryTimerRef.current && clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [port, token]);
}
