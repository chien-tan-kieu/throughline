// packages/server/src/index.ts
import { Database } from "bun:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApiCtx } from "./api/index.ts";
import { createBus } from "./bus.ts";
import { HandoffService } from "./handoff/index.ts";
import {
  registerShutdownHandler,
  startIdleTimer,
  writeRuntimeJson,
} from "./lifecycle/index.ts";
import { createServer } from "./server.ts";
import { runMigrations } from "./store/migrate.ts";
import { StandupService } from "./standup/index.ts";
import { StoryService } from "./stories/index.ts";
import { SuperpowersWatcher } from "./superpowers/index.ts";
import { WsServer } from "./ws/index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");
const VERSION = "1.0.0";

export interface DaemonOptions {
  port?: number;
  portRangeStart?: number;
  dataDir?: string;
  cwd?: string;
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
  const cwd = options.cwd ?? process.cwd();

  const dataDir =
    options.dataDir ??
    join(cwd, ".claude-control");
  await mkdir(dataDir, { recursive: true });

  const db = new Database(join(dataDir, "claude-control.db"));
  await runMigrations(db, MIGRATIONS_DIR);

  const tokenFile = join(dataDir, "token");
  let token: string;
  try {
    token = (await readFile(tokenFile, "utf8")).trim();
  } catch {
    token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
    await writeFile(tokenFile, token, { mode: 0o600 });
  }

  const bus = createBus();

  const watcher = new SuperpowersWatcher(cwd, db, bus);
  const stories = new StoryService(cwd, db, bus);
  const standupService = new StandupService(db);
  const handoffService = new HandoffService(cwd, db);
  const wsServer = new WsServer(bus, token);

  watcher.setStoryLinker((storyId, type, absPath) =>
    stories.update(storyId, type === "spec" ? { linked_spec: absPath } : { linked_plan: absPath }).then(() => {}),
  );

  await watcher.start();
  await stories.start();

  const apiCtx: ApiCtx = { db, bus, watcher, stories, standup: standupService, handoff: handoffService };

  const activityRef = { fn: () => {} };

  const useRange = options.port === undefined;
  const defaultBase = options.portRangeStart ?? 47821;
  const startPort = options.port ?? defaultBase;
  const endPort = useRange ? defaultBase + 9 : startPort;

  let server: import("bun").Server | undefined;
  for (let port = startPort; port <= endPort; port++) {
    try {
      server = createServer({
        port,
        token,
        db,
        bus,
        wsServer,
        apiCtx,
        version: VERSION,
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
      wsServer.stop();
      watcher.stop();
      stories.stop();
      db.close();
      bound.stop(true);
    },
  };
}

if (import.meta.main) {
  await startDaemon();
  console.log("Claude Control daemon started.");
}
