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
  linked_spec_path: string | null;
  size: string | null;
  status: string;
};

export class HandoffService {
  constructor(
    private cwd: string,
    private db: Database,
  ) {}

  async generate(storyId: string): Promise<HandoffResult> {
    const story = this.db
      .query<StoryRow, [string]>(
        `SELECT id, title, file_path, linked_plan_path, linked_spec_path, size, status
         FROM stories WHERE id = ?`,
      )
      .get(storyId);

    if (!story) throw new Error(`Story not found: ${storyId}`);

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
      "## Completed Tasks",
      this.extractDoneTasks(story.linked_plan_path ? planSection : null),
      "",
      "## Next Up",
      planSection,
      "",
      "## Story Body",
      "",
      storyBody.replace(/^---[\s\S]*?---\n/, "").trim(),
    ].join("\n");

    const handoffsDir = join(this.cwd, ".claude-control", "handoffs");
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
    const taskLines = lines.filter((l) => l.match(/^###\s+Task/));
    if (taskLines.length === 0) return "(no tasks in plan)";

    const incomplete = taskLines.find((l) => {
      const idx = lines.indexOf(l);
      return !lines.slice(idx, idx + 20).some((s) => s.match(/^- \[x\]/i));
    });
    return incomplete ?? taskLines[taskLines.length - 1];
  }

  private extractDoneTasks(planSection: string | null): string {
    if (!planSection) return "(no plan yet)";
    return "(see plan for completed tasks)";
  }
}
