import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type HandoffResult = {
  filePath: string;
  content: string;
};

type StoryRow = {
  id: string;
  title: string;
  file_path: string;
  linked_plan_path: string | null;
  size: string | null;
  status: string;
};

export class HandoffService {
  constructor(
    private cwd: string,
    private db: Database,
  ) {}

  async generate(storyId: string): Promise<HandoffResult | null> {
    const story = this.db
      .query<StoryRow, [string]>(
        `SELECT id, title, file_path, linked_plan_path, size, status
         FROM stories WHERE id = ?`,
      )
      .get(storyId);

    if (!story) return null;

    const storyBody = await Bun.file(story.file_path).text().catch(() => "");

    let planSection = "(no plan yet)";
    if (story.linked_plan_path) {
      const planText = await Bun.file(story.linked_plan_path).text().catch(() => "");
      planSection = this.extractPlanSummary(planText);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const content = [
      `# Handoff: ${story.title}`,
      "",
      `**Story:** ${story.id} · **Status:** ${story.status} · **Size:** ${story.size ?? "—"}`,
      "",
      "## Next Up",
      planSection,
      "",
      "## Story Body",
      "",
      storyBody.replace(/^---[\s\S]*?---\n/, "").trim(),
    ].join("\n");

    const handoffsDir = join(this.cwd, ".throughline", "handoffs");
    await mkdir(handoffsDir, { recursive: true });

    const fileName = `${dateStr}-${storyId}.md`;
    const filePath = join(handoffsDir, fileName);
    await Bun.write(filePath, content);

    this.db.run(
      `INSERT INTO handoffs (story_id, file_path, generated_at) VALUES (?, ?, ?)`,
      [storyId, filePath, Date.now()],
    );

    return { filePath, content };
  }

  private extractPlanSummary(planText: string): string {
    const lines = planText.split("\n");
    if (lines.length === 0) return "(no tasks in plan)";

    const taskIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^###\s+Task/)) taskIndices.push(i);
    }

    if (taskIndices.length === 0) return "(no tasks in plan)";

    for (let ti = 0; ti < taskIndices.length; ti++) {
      const taskIdx = taskIndices[ti];
      const nextTaskIdx = taskIndices[ti + 1] ?? lines.length;
      const taskBlock = lines.slice(taskIdx, Math.min(taskIdx + 30, nextTaskIdx));
      const hasDoneStep = taskBlock.some((s) => s.match(/^- \[x\]/i));
      if (!hasDoneStep) return lines[taskIdx];
    }

    return lines[taskIndices[taskIndices.length - 1]];
  }

  list(): Array<{ id: number; story_id: string; file_path: string; generated_at: number }> {
    return this.db
      .query<{ id: number; story_id: string; file_path: string; generated_at: number }, []>(
        `SELECT id, story_id, file_path, generated_at FROM handoffs ORDER BY generated_at DESC`,
      )
      .all();
  }
}
