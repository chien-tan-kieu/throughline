// packages/server/src/stories/index.ts
import type { Database } from "bun:sqlite";
import { watch } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Story,
  type StoryDetail,
  type StoryPatch,
  parseFrontmatter,
} from "@cc/shared";
import type { Bus } from "../bus.ts";
import { scaffoldStory } from "./template.ts";

const STORY_ID_REGEX = /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function updateFrontmatterField(
  yaml: string,
  key: string,
  value: string,
): string {
  const regex = new RegExp(`^(${key}:).*$`, "m");
  return regex.test(yaml)
    ? yaml.replace(regex, `$1 ${value}`)
    : `${yaml}\n${key}: ${value}`;
}

function applyPatch(content: string, patch: StoryPatch): string {
  const parts = content.split("---");
  if (parts.length < 3) return content;
  let yaml = parts[1];
  if (patch.title) yaml = updateFrontmatterField(yaml, "title", patch.title);
  if (patch.status) yaml = updateFrontmatterField(yaml, "status", patch.status);
  if (patch.size !== undefined)
    yaml = updateFrontmatterField(yaml, "size", patch.size ?? "");
  if (patch.linked_spec !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_spec", patch.linked_spec ?? "");
  if (patch.linked_plan !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_plan", patch.linked_plan ?? "");
  return ["", yaml, ...parts.slice(2)].join("---");
}

export class StoryService {
  private storiesDir: string;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(
    private cwd: string,
    private db: Database,
    private bus: Bus,
  ) {
    this.storiesDir = join(cwd, "docs/superpowers/stories");
  }

  async start(): Promise<void> {
    await mkdir(this.storiesDir, { recursive: true });
    await this.loadAll();
    this.watcher = watch(
      this.storiesDir,
      { persistent: false },
      (_event, filename) => {
        this.handleFileEvent(filename);
      },
    );
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  list(): Story[] {
    return this.db
      .query<Story, []>(
        `SELECT id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at
         FROM stories WHERE status != 'archived' ORDER BY created_at DESC`,
      )
      .all();
  }

  get(id: string): StoryDetail | null {
    if (!STORY_ID_REGEX.test(id)) return null;
    const row = this.db
      .query<Story, [string]>("SELECT * FROM stories WHERE id = ?")
      .get(id);
    if (!row) return null;
    let content: string;
    try {
      content = readFileSync(row.file_path, "utf-8");
    } catch {
      return null;
    }
    const parts = content.split("---");
    const body = parts.slice(2).join("---").trim();
    return { ...row, body };
  }

  async create(title: string): Promise<Story> {
    const today = new Date().toISOString().slice(0, 10);
    const id = `US-${today}-${toSlug(title)}`;
    const filePath = join(this.storiesDir, `${id}.md`);
    await writeFile(filePath, scaffoldStory(id, title, today), "utf-8");
    const ts = Date.now();
    this.db.run(
      `INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?)`,
      [id, filePath, title, ts, ts],
    );
    this.bus.publish({ type: "story.changed", data: { id, op: "create" } });
    const created = this.db
      .query<Story, [string]>("SELECT * FROM stories WHERE id = ?")
      .get(id);
    if (!created) throw new Error(`Story not found after insert: ${id}`);
    return created;
  }

  async update(id: string, patch: StoryPatch): Promise<Story | null> {
    if (!STORY_ID_REGEX.test(id)) return null;
    const row = this.db
      .query<{ file_path: string }, [string]>(
        "SELECT file_path FROM stories WHERE id = ?",
      )
      .get(id);
    if (!row) return null;
    const content = await readFile(row.file_path, "utf-8");
    await writeFile(row.file_path, applyPatch(content, patch), "utf-8");
    const ts = Date.now();
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [ts];
    if (patch.title) {
      sets.push("title = ?");
      vals.push(patch.title);
    }
    if (patch.status) {
      sets.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.size !== undefined) {
      sets.push("size = ?");
      vals.push(patch.size ?? null);
    }
    vals.push(id);
    this.db.run(`UPDATE stories SET ${sets.join(", ")} WHERE id = ?`, vals);
    this.bus.publish({ type: "story.changed", data: { id, op: "update" } });
    const updated = this.db
      .query<Story, [string]>("SELECT * FROM stories WHERE id = ?")
      .get(id);
    if (!updated) throw new Error(`Story not found after update: ${id}`);
    return updated;
  }

  async archive(id: string): Promise<void> {
    if (!STORY_ID_REGEX.test(id)) return;
    const row = this.db
      .query<{ file_path: string }, [string]>(
        "SELECT file_path FROM stories WHERE id = ?",
      )
      .get(id);
    if (!row) return;
    const archiveDir = join(this.storiesDir, "archive");
    await mkdir(archiveDir, { recursive: true });
    await rename(row.file_path, join(archiveDir, `${id}.md`));
    this.db.run(
      "UPDATE stories SET status = 'archived', updated_at = ? WHERE id = ?",
      [Date.now(), id],
    );
    this.bus.publish({ type: "story.changed", data: { id, op: "delete" } });
  }

  private async handleFileEvent(filename: string | null): Promise<void> {
    if (!filename?.endsWith(".md")) return;
    const filePath = join(this.storiesDir, filename);
    const content = await readFile(filePath, "utf-8").catch(() => null);
    if (content === null) {
      const row = this.db
        .query<{ id: string }, [string]>(
          "SELECT id FROM stories WHERE file_path = ?",
        )
        .get(filePath);
      if (!row) return;
      this.db.run("DELETE FROM stories WHERE file_path = ?", [filePath]);
      this.bus.publish({
        type: "story.changed",
        data: { id: row.id, op: "delete" },
      });
      return;
    }
    const fm = parseFrontmatter(content);
    if (!fm) return;
    this.upsertRow(
      fm.id,
      filePath,
      fm.title,
      fm.status,
      fm.size ?? null,
      fm.linked_spec ?? null,
      fm.linked_plan ?? null,
    );
    this.bus.publish({
      type: "story.changed",
      data: { id: fm.id, op: "update" },
    });
  }

  private async reconcile(): Promise<void> {
    const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
    const onDiskPaths = new Set(
      entries
        .filter((n) => n.endsWith(".md"))
        .map((n) => join(this.storiesDir, n)),
    );

    const rows = this.db
      .query<{ id: string; file_path: string }, []>(
        "SELECT id, file_path FROM stories WHERE status != 'archived'",
      )
      .all();

    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
        this.bus.publish({
          type: "story.changed",
          data: { id: row.id, op: "delete" },
        });
      }
    }

    const knownPaths = new Set(rows.map((r) => r.file_path));
    for (const filePath of onDiskPaths) {
      if (knownPaths.has(filePath)) continue;
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (content === null) continue;
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      this.upsertRow(
        fm.id,
        filePath,
        fm.title,
        fm.status,
        fm.size ?? null,
        fm.linked_spec ?? null,
        fm.linked_plan ?? null,
      );
      this.bus.publish({
        type: "story.changed",
        data: { id: fm.id, op: "create" },
      });
    }
  }

  private async loadAll(): Promise<void> {
    const entries = await readdir(this.storiesDir).catch(() => [] as string[]);
    const onDiskPaths = new Set<string>();
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const filePath = join(this.storiesDir, name);
      onDiskPaths.add(filePath);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (content === null) continue;
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      this.upsertRow(
        fm.id,
        filePath,
        fm.title,
        fm.status,
        fm.size ?? null,
        fm.linked_spec ?? null,
        fm.linked_plan ?? null,
      );
    }
    const rows = this.db
      .query<{ id: string; file_path: string }, []>(
        "SELECT id, file_path FROM stories WHERE status != 'archived'",
      )
      .all();
    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
      }
    }
  }

  private upsertRow(
    id: string,
    filePath: string,
    title: string,
    status: string,
    size: string | null,
    linkedSpec: string | null,
    linkedPlan: string | null,
  ): void {
    const ts = Date.now();
    this.db.run(
      `INSERT OR REPLACE INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?), ?)`,
      [id, filePath, title, size, status, linkedSpec, linkedPlan, id, ts, ts],
    );
  }
}
