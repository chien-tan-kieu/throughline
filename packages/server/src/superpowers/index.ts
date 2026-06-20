import type { Database } from "bun:sqlite";
import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ParsedPlan, Phase } from "@throughline/shared";
import type { Bus } from "../bus.ts";
import { diffCheckboxState } from "./diff.ts";
import { parsePlan } from "./parser.ts";
import { advancePhase } from "./phase.ts";

type StoryLinker = (storyId: string, type: "spec" | "plan", absPath: string) => Promise<void>;

export class SuperpowersWatcher {
  private plans = new Map<string, ParsedPlan>();
  private specs = new Map<string, string>();
  private watchers: Array<{ close(): void }> = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private storyLinker: StoryLinker | null = null;

  constructor(
    private cwd: string,
    private db: Database,
    private bus: Bus,
  ) {}

  setStoryLinker(fn: StoryLinker): void {
    this.storyLinker = fn;
  }

  async start(): Promise<void> {
    const plansDir = join(this.cwd, "docs/superpowers/plans");
    const specsDir = join(this.cwd, "docs/superpowers/specs");
    try {
      await this.loadDir(plansDir, true);
      await this.loadDir(specsDir, false);
      this.watchDir(plansDir);
      this.watchDir(specsDir);
    } catch {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, 30_000);
    }
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  getParsedPlan(path: string): ParsedPlan | null {
    return this.plans.get(resolve(path)) ?? null;
  }

  getSpecBody(path: string): string | null {
    return this.specs.get(resolve(path)) ?? null;
  }

  async handleFileChange(filePath: string): Promise<void> {
    const abs = resolve(filePath);
    const plansDir = resolve(join(this.cwd, "docs/superpowers/plans"));
    const specsDir = resolve(join(this.cwd, "docs/superpowers/specs"));

    let content: string;
    try {
      content = await readFile(abs, "utf-8");
    } catch {
      return;
    }

    if (abs.startsWith(plansDir)) {
      const isNew = !this.plans.has(abs);
      const prev = this.plans.get(abs) ?? { path: abs, title: "", tasks: [] };
      const next = parsePlan(content, abs);
      const diffs = diffCheckboxState(prev, next);

      this.plans.set(abs, next);
      this.upsertPlan(abs, next);
      this.bus.publish({
        type: "plan.changed",
        data: { path: abs, tasks: next.tasks },
      });

      if (diffs.length > 0) {
        this.maybeAdvancePhase("implement");
      } else if (prev.tasks.length === 0 && next.tasks.length > 0) {
        this.maybeAdvancePhase("plan");
      }
      if (isNew) await this.maybeAutoLink("plan", abs);
    } else if (abs.startsWith(specsDir)) {
      const isNew = !this.specs.has(abs);
      this.specs.set(abs, content);
      this.bus.publish({ type: "spec.changed", data: { path: abs } });
      if (isNew) {
        this.maybeAdvancePhase("spec");
        await this.maybeAutoLink("spec", abs);
      }
    }
  }

  private async maybeAutoLink(type: "spec" | "plan", absPath: string): Promise<void> {
    if (!this.storyLinker) return;
    const session = this.db
      .query<{ active_story_id: string | null }, [string]>(
        "SELECT active_story_id FROM sessions WHERE cwd = ? ORDER BY started_at DESC LIMIT 1",
      )
      .get(this.cwd);
    const storyId = session?.active_story_id;
    if (!storyId) return;
    const col = type === "spec" ? "linked_spec_path" : "linked_plan_path";
    const row = this.db
      .query<Record<string, string | null>, [string]>(
        `SELECT ${col} FROM stories WHERE id = ?`,
      )
      .get(storyId);
    if (!row || row[col]) return;
    await this.storyLinker(storyId, type, absPath);
  }

  private async loadDir(dir: string, isPlan: boolean): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const abs = resolve(join(dir, name));
      const content = await readFile(abs, "utf-8").catch(() => null);
      if (!content) continue;
      if (isPlan) {
        const parsed = parsePlan(content, abs);
        this.plans.set(abs, parsed);
        this.upsertPlan(abs, parsed);
      } else {
        this.specs.set(abs, content);
      }
    }
  }

  private watchDir(dir: string): void {
    const absDir = resolve(dir);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    try {
      const w = watch(absDir, { persistent: false }, (_event, filename) => {
        if (!filename?.endsWith(".md")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.handleFileChange(join(absDir, filename));
        }, 200);
      });
      this.watchers.push(w);
    } catch {
      const timer = setInterval(async () => {
        const entries = await readdir(absDir).catch(() => [] as string[]);
        for (const name of entries) {
          if (name.endsWith(".md"))
            await this.handleFileChange(join(absDir, name));
        }
      }, 5_000);
      this.watchers.push({ close: () => clearInterval(timer) });
    }
  }

  private upsertPlan(planPath: string, plan: ParsedPlan): void {
    const ts = Date.now();
    this.db.run("DELETE FROM plan_tasks WHERE plan_path = ?", [planPath]);
    this.db.run("DELETE FROM plan_steps WHERE plan_path = ?", [planPath]);
    for (const task of plan.tasks) {
      this.db.run(
        "INSERT INTO plan_tasks (plan_path, task_index, task_title, files_json, ts) VALUES (?, ?, ?, ?, ?)",
        [planPath, task.index, task.title, JSON.stringify(task.files), ts],
      );
      for (const step of task.steps) {
        this.db.run(
          "INSERT INTO plan_steps (plan_path, task_index, step_index, step_label, state, ts) VALUES (?, ?, ?, ?, ?, ?)",
          [planPath, task.index, step.index, step.label, step.state, ts],
        );
      }
    }
  }

  private maybeAdvancePhase(target: Phase): void {
    const session = this.db
      .query<{ id: string; inferred_phase: string | null }, [string]>(
        `SELECT id, inferred_phase FROM sessions WHERE cwd = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      )
      .get(this.cwd);

    if (!session) return;

    const current = (session.inferred_phase as Phase | null) ?? null;
    const next = advancePhase(current, target);
    if (next === current) return;

    this.db.run("UPDATE sessions SET inferred_phase = ? WHERE id = ?", [
      next,
      session.id,
    ]);
    this.bus.publish({
      type: "phase.inferred",
      data: { sessionId: session.id, phase: next },
    });
  }
}
