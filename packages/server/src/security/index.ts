interface WindowCount {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowCount>();

  constructor(
    private readonly limit = 1000,
    private readonly windowMs = 60_000,
  ) {}

  allow(sessionId: string): boolean {
    const now = Date.now();
    const w = this.windows.get(sessionId);
    if (!w || now - w.windowStart > this.windowMs) {
      this.windows.set(sessionId, { count: 1, windowStart: now });
      return true;
    }
    w.count++;
    return w.count <= this.limit;
  }
}

export function checkAuth(
  req: Request,
  serverPort: number,
  token: string,
): Response | null {
  const host = req.headers.get("host") ?? "";
  const validHosts = [
    `127.0.0.1:${serverPort}`,
    `localhost:${serverPort}`,
    "127.0.0.1",
    "localhost",
  ];
  if (!validHosts.includes(host)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}` && queryToken !== token) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
