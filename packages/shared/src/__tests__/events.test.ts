import { describe, expect, test } from "bun:test";
import { HookEventSchema } from "../events.ts";

const base = {
  session_id: "sess-1",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp/project",
  permission_mode: "default" as const,
};

describe("HookEventSchema discriminated union", () => {
  test("parses SessionStart", () => {
    const result = HookEventSchema.parse({ ...base, hook_event_name: "SessionStart" });
    expect(result.hook_event_name).toBe("SessionStart");
  });

  test("parses PreToolUse with required fields", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    expect(result.hook_event_name).toBe("PreToolUse");
  });

  test("parses SubagentStop with corrected field names", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "SubagentStop",
      agent_type: "general-purpose",
      subagent_id: "sub-abc",
      stop_reason: "completed",
      output: "done",
    });
    expect(result.hook_event_name).toBe("SubagentStop");
    if (result.hook_event_name === "SubagentStop") {
      expect(result.subagent_id).toBe("sub-abc");
      expect(result.output).toBe("done");
    }
  });

  test("parses InstructionsLoaded with memory_type enum", () => {
    const result = HookEventSchema.parse({
      ...base,
      hook_event_name: "InstructionsLoaded",
      file_path: "/tmp/CLAUDE.md",
      memory_type: "Managed",
      load_reason: "startup",
    });
    expect(result.hook_event_name).toBe("InstructionsLoaded");
  });

  test("rejects unknown hook_event_name", () => {
    expect(() =>
      HookEventSchema.parse({ ...base, hook_event_name: "Unknown" })
    ).toThrow();
  });

  test("rejects invalid permission_mode", () => {
    expect(() =>
      HookEventSchema.parse({ ...base, hook_event_name: "SessionStart", permission_mode: "invalid" })
    ).toThrow();
  });

  test("all 14 event names parse without error", () => {
    const events: Array<[string, Record<string, unknown>]> = [
      ["SessionStart", {}],
      ["SessionEnd", {}],
      ["UserPromptSubmit", { prompt: "hello" }],
      ["UserPromptExpansion", {}],
      ["PreToolUse", { tool_name: "Bash", tool_input: {} }],
      ["PostToolUse", { tool_name: "Bash", tool_input: {}, tool_response: {} }],
      ["PostToolUseFailure", { tool_name: "Bash", tool_input: {}, error: "oops" }],
      ["SubagentStart", { agent_type: "general-purpose", prompt: "go", subagent_id: "s1", parent_session_id: "p1" }],
      ["SubagentStop", { agent_type: "general-purpose", subagent_id: "s1", stop_reason: "completed", output: "done" }],
      ["Stop", {}],
      ["Notification", { message: "hi" }],
      ["InstructionsLoaded", { file_path: "/tmp/f", memory_type: "Managed", load_reason: "startup" }],
      ["PreCompact", {}],
      ["PostCompact", {}],
    ];
    for (const [name, extra] of events) {
      expect(() =>
        HookEventSchema.parse({ ...base, hook_event_name: name, ...extra })
      ).not.toThrow();
    }
  });
});
