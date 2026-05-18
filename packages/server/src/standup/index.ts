import type { Database } from "bun:sqlite";
import type { StandupDigest, StandupItem } from "@cc/shared";

export class StandupService {
  constructor(private db: Database) {}

  generate(date: string): StandupDigest {
    const dayStart = new Date(`${date}T00:00:00`).getTime();
    const shipStart = dayStart - 86_400_000;
    const shipEnd = dayStart;

    const shippedRows = this.db
      .query<{ id: string; title: string; size: string | null }, [number, number]>(
        `SELECT id, title, size FROM stories
         WHERE status = 'done' AND updated_at >= ? AND updated_at < ?`,
      )
      .all(shipStart, shipEnd);

    const shipped: StandupItem[] = shippedRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: (r.size as StandupItem["size"]) ?? null,
      detail: "shipped",
    }));

    const wipRows = this.db
      .query<{ id: string; title: string; size: string | null }, []>(
        `SELECT id, title, size FROM stories WHERE status = 'in-progress'`,
      )
      .all();

    const inProgress: StandupItem[] = wipRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: (r.size as StandupItem["size"]) ?? null,
      detail: "in progress",
    }));

    const cutoff = Date.now() - 86_400_000;
    const blockerRows = this.db
      .query<{ session_id: string; active_story_id: string | null; tool_name: string }, [number]>(
        `SELECT e.session_id, s.active_story_id,
                JSON_EXTRACT(e.payload_json, '$.tool_name') AS tool_name,
                COUNT(*) AS fail_count
         FROM events e
         JOIN sessions s ON e.session_id = s.id
         WHERE e.event_name = 'PostToolUseFailure'
           AND e.ts >= ?
         GROUP BY e.session_id, tool_name
         HAVING fail_count >= 3`,
      )
      .all(cutoff);

    const seenStories = new Set<string>();
    const blockers: StandupItem[] = [];
    for (const row of blockerRows) {
      const sid = row.active_story_id;
      if (!sid || seenStories.has(sid)) continue;
      seenStories.add(sid);
      const story = this.db
        .query<{ title: string; size: string | null }, [string]>(
          `SELECT title, size FROM stories WHERE id = ?`,
        )
        .get(sid);
      blockers.push({
        storyId: sid,
        title: story?.title ?? sid,
        size: (story?.size as StandupItem["size"]) ?? null,
        detail: `${row.tool_name} failing ≥3×`,
      });
    }

    return { date, shipped, inProgress, blockers };
  }
}
