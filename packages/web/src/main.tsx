import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useWsStore } from "./store/ws.ts";

const params = new URLSearchParams(window.location.search);
const port = window.location.port ? Number(window.location.port) : 47821;
const token = params.get("token") ?? "";
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
