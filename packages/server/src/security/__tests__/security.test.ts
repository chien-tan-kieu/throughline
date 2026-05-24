import { describe, expect, test } from "bun:test";
import { RateLimiter, checkAuth } from "../index.ts";

const PORT = 47821;
const TOKEN = "secret-token-abc";

function makeRequest(overrides: {
  host?: string;
  authorization?: string;
  url?: string;
}): Request {
  const headers = new Headers();
  headers.set("host", overrides.host ?? `127.0.0.1:${PORT}`);
  if (overrides.authorization !== undefined) {
    headers.set("authorization", overrides.authorization);
  }
  return new Request(
    overrides.url ?? `http://127.0.0.1:${PORT}/hooks/PreToolUse`,
    {
      method: "POST",
      headers,
    },
  );
}

describe("checkAuth", () => {
  test("returns null for valid host and token", () => {
    const req = makeRequest({ authorization: `Bearer ${TOKEN}` });
    expect(checkAuth(req, PORT, TOKEN)).toBeNull();
  });

  test("returns null for localhost host header", () => {
    const req = makeRequest({
      host: `localhost:${PORT}`,
      authorization: `Bearer ${TOKEN}`,
    });
    expect(checkAuth(req, PORT, TOKEN)).toBeNull();
  });

  test("returns 401 when Authorization header is missing", () => {
    const req = makeRequest({});
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(401);
  });

  test("returns 401 when token is wrong", () => {
    const req = makeRequest({ authorization: "Bearer wrong" });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(401);
  });

  test("returns 403 when Host is not localhost/127.0.0.1", () => {
    const req = makeRequest({
      host: "evil.example.com",
      authorization: `Bearer ${TOKEN}`,
    });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(403);
  });

  test("returns 403 when Host header is missing", () => {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${TOKEN}`);
    const req = new Request(`http://127.0.0.1:${PORT}/hooks/PreToolUse`, {
      method: "POST",
      headers,
    });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(403);
  });

  test("returns 401 when token is passed as query param", () => {
    const req = makeRequest({
      url: `http://127.0.0.1:${PORT}/?token=${TOKEN}`,
    });
    const res = checkAuth(req, PORT, TOKEN);
    expect(res?.status).toBe(401);
  });
});

describe("RateLimiter", () => {
  test("allows requests under limit", () => {
    const rl = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(rl.allow("sess-1")).toBe(true);
    }
  });

  test("blocks requests over limit", () => {
    const rl = new RateLimiter(3, 60_000);
    rl.allow("sess-1");
    rl.allow("sess-1");
    rl.allow("sess-1");
    expect(rl.allow("sess-1")).toBe(false);
  });

  test("tracks different sessions independently", () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.allow("sess-a")).toBe(true);
    expect(rl.allow("sess-b")).toBe(true);
    expect(rl.allow("sess-a")).toBe(false);
    expect(rl.allow("sess-b")).toBe(false);
  });

  test("resets after window expires", async () => {
    const rl = new RateLimiter(1, 10); // 10ms window
    rl.allow("sess-1");
    await new Promise((r) => setTimeout(r, 20));
    expect(rl.allow("sess-1")).toBe(true);
  });
});
