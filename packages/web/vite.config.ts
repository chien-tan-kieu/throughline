import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DAEMON_PORT = process.env.VITE_DAEMON_PORT ?? "47821";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${DAEMON_PORT}`,
      "/ws": { target: `ws://127.0.0.1:${DAEMON_PORT}`, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
