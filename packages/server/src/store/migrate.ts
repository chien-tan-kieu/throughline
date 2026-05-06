import { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations(db: Database, migrationsDir: string): Promise<void> {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = db.query("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (already) continue;

    const sql = await readFile(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.run("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", [
      file,
      Date.now(),
    ]);
  }
}
