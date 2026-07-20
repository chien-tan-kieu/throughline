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

type HandoffRow = {
  id: number;
  story_id: string | null;
  session_id: string | null;
  file_path: string;
  generated_at: number;
};

type MinedSession = {
  timeRange: string;
  files: string[];
  commits: string[];
  tests: string[];
  failing: string[];
  firstPrompt: string | null;
};

export class HandoffService {
  constructor(
    private cwd: string,
    private db: Database,
  ) {}

  async generate(storyId: string): Promise<HandoffResult | null> {
    const story = this.lookupStory(storyId);
    if (!story) return null;

    const content = await this.buildStorySections(story);
    const dateStr = new Date().toISOString().slice(0, 10);
    return this.writeHandoff(
      storyId,
      null,
      content,
      `${dateStr}-${storyId}.md`,
    );
  }

  async generateForSession(sessionId: string): Promise<HandoffResult> {
    const session = this.db
      .query<
        { active_story_id: string | null; started_at: number | null },
        [string]
      >(`SELECT active_story_id, started_at FROM sessions WHERE id = ?`)
      .get(sessionId);

    const story = session?.active_story_id
      ? this.lookupStory(session.active_story_id)
      : null;

    const mined = this.mineSession(sessionId, session?.started_at ?? null);
    const thisSession = this.renderThisSession(mined, !story);

    const dateStr = new Date().toISOString().slice(0, 10);

    if (story) {
      const content = [
        await this.buildStorySections(story),
        "",
        thisSession,
      ].join("\n");
      return this.writeHandoff(
        story.id,
        sessionId,
        content,
        `${dateStr}-${story.id}.md`,
      );
    }

    const content = ["# Handoff", "", thisSession].join("\n");
    const shortId = sessionId.slice(0, 8);
    return this.writeHandoff(
      null,
      sessionId,
      content,
      `${dateStr}-session-${shortId}.md`,
    );
  }

  private async writeHandoff(
    storyId: string | null,
    sessionId: string | null,
    content: string,
    fileName: string,
  ): Promise<HandoffResult> {
    const handoffsDir = join(this.cwd, ".throughline", "handoffs");
    await mkdir(handoffsDir, { recursive: true });

    const filePath = join(handoffsDir, fileName);
    await Bun.write(filePath, content);

    this.db.run(
      `INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (?, ?, ?, ?)`,
      [storyId, sessionId, filePath, Date.now()],
    );

    return { filePath, content };
  }

  private lookupStory(storyId: string): StoryRow | null {
    return (
      this.db
        .query<StoryRow, [string]>(
          `SELECT id, title, file_path, linked_plan_path, size, status
           FROM stories WHERE id = ?`,
        )
        .get(storyId) ?? null
    );
  }

  private async buildStorySections(story: StoryRow): Promise<string> {
    const [storyBody, planText] = await Promise.all([
      Bun.file(story.file_path)
        .text()
        .catch(() => ""),
      story.linked_plan_path
        ? Bun.file(story.linked_plan_path)
            .text()
            .catch(() => "")
        : Promise.resolve(null),
    ]);

    const planSection =
      planText != null ? this.extractPlanSummary(planText) : "(no plan yet)";

    return [
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
  }

  private mineSession(
    sessionId: string,
    startedAt: number | null,
  ): MinedSession {
    const lastTs =
      this.db
        .query<{ ts: number | null }, [string]>(
          `SELECT MAX(ts) AS ts FROM events WHERE session_id = ?`,
        )
        .get(sessionId)?.ts ?? null;

    let timeRange = "(none)";
    if (startedAt != null) {
      const start = new Date(startedAt).toISOString();
      const end = lastTs ? new Date(lastTs).toISOString() : start;
      timeRange = `${start} → ${end}`;
    }

    const files = this.db
      .query<{ file_path: string }, [string]>(
        `SELECT DISTINCT JSON_EXTRACT(payload_json, '$.tool_input.file_path') AS file_path
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUse'
           AND JSON_EXTRACT(payload_json, '$.tool_name') IN ('Edit', 'Write')
           AND file_path IS NOT NULL
         ORDER BY file_path`,
      )
      .all(sessionId)
      .map((r) => r.file_path);

    const bashCommands = this.db
      .query<{ command: string }, [string]>(
        `SELECT JSON_EXTRACT(payload_json, '$.tool_input.command') AS command
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUse'
           AND JSON_EXTRACT(payload_json, '$.tool_name') = 'Bash'
           AND command IS NOT NULL
         ORDER BY ts`,
      )
      .all(sessionId)
      .map((r) => r.command);

    const commits = bashCommands.filter((c) => /\bgit commit\b/.test(c));
    const tests = bashCommands.filter((c) => /test/.test(c));

    const failing = this.db
      .query<{ tool_name: string }, [string]>(
        `SELECT JSON_EXTRACT(payload_json, '$.tool_name') AS tool_name, COUNT(*) AS c
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUseFailure'
         GROUP BY tool_name
         HAVING c >= 3`,
      )
      .all(sessionId)
      .map((r) => r.tool_name);

    const firstPrompt =
      this.db
        .query<{ prompt: string | null }, [string]>(
          `SELECT JSON_EXTRACT(payload_json, '$.prompt') AS prompt
         FROM events
         WHERE session_id = ?
           AND event_name = 'UserPromptSubmit'
         ORDER BY ts ASC
         LIMIT 1`,
        )
        .get(sessionId)?.prompt ?? null;

    return { timeRange, files, commits, tests, failing, firstPrompt };
  }

  private renderThisSession(mined: MinedSession, includeGoal: boolean): string {
    const renderList = (items: string[]) =>
      items.length === 0 ? "(none)" : items.map((i) => `- ${i}`).join("\n");

    const lines = ["## This session", ""];

    if (includeGoal && mined.firstPrompt) {
      lines.push(`Goal: ${mined.firstPrompt}`, "");
    }

    lines.push(
      `**Time range:** ${mined.timeRange}`,
      "",
      "### Files edited",
      renderList(mined.files),
      "",
      "### Commits",
      renderList(mined.commits),
      "",
      "### Test runs",
      renderList(mined.tests),
      "",
      "### Tools failing ≥3×",
      renderList(mined.failing),
    );

    return lines.join("\n");
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
      const taskBlock = lines.slice(
        taskIdx,
        Math.min(taskIdx + 30, nextTaskIdx),
      );
      const hasDoneStep = taskBlock.some((s) => s.match(/^- \[x\]/i));
      if (!hasDoneStep) return lines[taskIdx];
    }

    return lines[taskIndices[taskIndices.length - 1]];
  }

  list(): HandoffRow[] {
    return this.db
      .query<HandoffRow, []>(
        `SELECT id, story_id, session_id, file_path, generated_at FROM handoffs ORDER BY generated_at DESC`,
      )
      .all();
  }

  latest(storyId?: string): HandoffRow | null {
    const where = storyId ? "WHERE story_id = ?" : "";
    const query = this.db.query<HandoffRow, string[]>(
      `SELECT id, story_id, session_id, file_path, generated_at FROM handoffs
       ${where} ORDER BY generated_at DESC LIMIT 1`,
    );
    return (storyId ? query.get(storyId) : query.get()) ?? null;
  }

  async latestWithContext(
    storyId?: string,
  ): Promise<(HandoffRow & { title: string; content: string }) | null> {
    const row = this.latest(storyId);
    if (!row) return null;

    const content = await Bun.file(row.file_path)
      .text()
      .catch(() => "");

    let title = "Session handoff";
    if (row.story_id) {
      const story = this.lookupStory(row.story_id);
      title = `Handoff: ${story?.title ?? row.story_id}`;
    }

    return { ...row, title, content };
  }
}
