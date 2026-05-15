import { z } from "zod";

const StoryFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  created: z.string(),
  size: z.string().optional(),
  linked_spec: z.string().optional(),
  linked_plan: z.string().optional(),
});

export type StoryFrontmatter = z.infer<typeof StoryFrontmatterSchema>;

export interface Story {
  id: string;
  file_path: string;
  title: string;
  size: string | null;
  status: string;
  linked_spec_path: string | null;
  linked_plan_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface StoryDetail extends Story {
  body: string;
}

export interface StoryPatch {
  title?: string;
  status?: string;
  size?: string;
  linked_spec?: string;
  linked_plan?: string;
}

export function parseFrontmatter(content: string): StoryFrontmatter | null {
  const parts = content.split("---");
  if (parts.length < 3) return null;

  const yamlBlock = parts[1].trim();
  const record: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) record[key] = value;
  }

  const result = StoryFrontmatterSchema.safeParse(record);
  return result.success ? result.data : null;
}
