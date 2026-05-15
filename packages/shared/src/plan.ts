export interface PlanStep {
  index: number;
  label: string;
  state: "todo" | "done";
}

export interface PlanTask {
  index: number;
  title: string;
  files: string[];
  steps: PlanStep[];
}

export interface ParsedPlan {
  path: string;
  title: string;
  tasks: PlanTask[];
}

export function parsePlan(content: string, path: string): ParsedPlan {
  const lines = content.split("\n");
  let title = "";
  const tasks: PlanTask[] = [];
  let currentTask: PlanTask | null = null;
  let inFilesBlock = false;

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }

    const taskMatch = line.match(/^### Task (\d+):\s*(.+)/);
    if (taskMatch) {
      currentTask = {
        index: parseInt(taskMatch[1], 10),
        title: taskMatch[2].trim(),
        files: [],
        steps: [],
      };
      tasks.push(currentTask);
      inFilesBlock = false;
      continue;
    }

    if (!currentTask) continue;

    if (line.trim() === "**Files:**") {
      inFilesBlock = true;
      continue;
    }

    if (inFilesBlock) {
      if (line.trim() === "") {
        inFilesBlock = false;
        continue;
      }
      if (line.startsWith("- ")) {
        currentTask.files.push(line.slice(2).trim());
        continue;
      }
    }

    const todoMatch = line.match(/^- \[ \] (.+)/);
    if (todoMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: todoMatch[1].trim(),
        state: "todo",
      });
      continue;
    }

    const doneMatch = line.match(/^- \[x\] (.+)/i);
    if (doneMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: doneMatch[1].trim(),
        state: "done",
      });
    }
  }

  return { path, title, tasks };
}
