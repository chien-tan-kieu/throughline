import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createBus } from "./bus.ts";
import {
  registerShutdownHandler,
  startIdleTimer,
  writeRuntimeJson,
} from "./lifecycle/index.ts";
import { createServer } from "./server.ts";
import { runMigrations } from "./store/migrate.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");
const VERSION = "0.1.0";

export interface DaemonOptions {
  port?: number;
  dataDir?: string;
  rateLimit?: { limit: number; windowMs: number };
}

export interface DaemonHandle {
  port: number;
  token: string;
  db: Database;
  stop: () => Promise<void>;
}

export async function startDaemon(
  options: DaemonOptions = {},
): Promise<DaemonHandle> {
  const dataDir =
    options.dataDir ??
    process.env.CLAUDE_PLUGIN_DATA ??
    join(process.env.HOME ?? "/tmp", ".claude-control");
  await mkdir(dataDir, { recursive: true });

  const db = new Database(join(dataDir, "claude-control.db"));
  await runMigrations(db, MIGRATIONS_DIR);

  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("hex");

  const bus = createBus();

  // onActivity ref: wired to idleTimer.reset after timer is created
  const activityRef = { fn: () => {} };

  // Port range binding: when no port given, try 47821–47830
  const useRange = options.port === undefined;
  const startPort = options.port ?? 47821;
  const endPort = useRange ? 47830 : startPort;

  let server: import("bun").Server | undefined;
  for (let port = startPort; port <= endPort; port++) {
    try {
      server = createServer({
        port,
        token,
        db,
        bus,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit,
      });
      break;
    } catch {
      if (port === endPort) {
        process.stderr.write(
          `Claude Control: could not bind to any port in ${startPort}–${endPort}\n`,
        );
        process.exit(1);
      }
    }
  }

  if (!server) throw new Error("Failed to bind server (unreachable)");

  const idleTimer = startIdleTimer(server, db);
  activityRef.fn = idleTimer.reset;
  registerShutdownHandler(server, db, idleTimer.cancel);

  await writeRuntimeJson(dataDir, {
    port: server.port,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
    version: VERSION,
  });

  const bound = server;
  return {
    port: server.port,
    token,
    db,
    stop: async () => {
      idleTimer.cancel();
      db.close();
      bound.stop(true);
    },
  };
}

// Run directly: bun run src/index.ts
if (import.meta.main) {
  await startDaemon();
  console.log("Claude Control daemon started.");
}
