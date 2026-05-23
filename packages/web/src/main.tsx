import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useWsStore } from "./store/ws.ts";

const hash = new URLSearchParams(window.location.hash.slice(1));
const port = window.location.port ? Number(window.location.port) : 47821;
const token = hash.get("token") ?? "";
if (token) history.replaceState(null, "", window.location.pathname);
useWsStore.getState().setPort(port);
useWsStore.getState().setToken(token);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
