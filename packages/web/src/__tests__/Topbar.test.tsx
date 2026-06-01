import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { Topbar } from "../components/layout/Topbar.tsx";

vi.mock("../lib/api.ts", () => ({
  api: {
    fetchStatus: vi.fn().mockResolvedValue({ status: "ok", version: "1.0.0" }),
  },
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(MemoryRouter, null, children),
  );
}

describe("Topbar", () => {
  test("displays daemon version from /api/status", async () => {
    render(<Topbar />, { wrapper: Wrapper });
    expect(await screen.findByText("v1.0.0")).toBeTruthy();
  });
});
