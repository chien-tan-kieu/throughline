import { Database } from "bun:sqlite";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "bun";

export interface RuntimeJson {
  port: number;
  token: string;
  pid: number;
  started_at: string;
  version: string;
}

export async function writeRuntimeJson(
  dataDir: string,
  data: RuntimeJson
): Promise<void> {
  const path = join(dataDir, "runtime.json");
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function startIdleTimer(
  server: Server,
  db: Database,
  idleMs = 4 * 60 * 60 * 1000
): { reset: () => void; cancel: () => void } {
  let timer = setTimeout(shutdown, idleMs);

  function shutdown() {
    db.close();
    server.stop(true);
    process.exit(0);
  }

  return {
    reset() {
      clearTimeout(timer);
      timer = setTimeout(shutdown, idleMs);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}

export function registerShutdownHandler(
  server: Server,
  db: Database,
  cancelIdle: () => void
): void {
  process.once("SIGTERM", () => {
    cancelIdle();
    db.close();
    server.stop(true);
    process.exit(0);
  });
}
