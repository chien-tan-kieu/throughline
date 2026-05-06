import { z } from "zod";

const BaseHookSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.string(),
  permission_mode: z.enum([
    "default",
    "plan",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
  ]),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
});

const SessionStartSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SessionStart"),
  model: z.string().optional(),
});

const SessionEndSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SessionEnd"),
});

const UserPromptSubmitSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("UserPromptSubmit"),
  prompt: z.string(),
});

const UserPromptExpansionSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("UserPromptExpansion"),
  expansion: z.string().optional(),
});

const PreToolUseSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PreToolUse"),
  tool_name: z.string(),
  tool_input: z.unknown(),
});

const PostToolUseSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostToolUse"),
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_response: z.unknown(),
});

const PostToolUseFailureSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostToolUseFailure"),
  tool_name: z.string(),
  tool_input: z.unknown(),
  error: z.string(),
});

const SubagentStartSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SubagentStart"),
  agent_type: z.string(),
  prompt: z.string(),
  subagent_id: z.string(),
  parent_session_id: z.string(),
});

const SubagentStopSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("SubagentStop"),
  agent_type: z.string(),
  subagent_id: z.string(),
  stop_reason: z.enum(["completed", "error", "user_interrupt"]),
  output: z.string(),
});

const StopSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("Stop"),
  stop_reason: z.string().optional(),
});

const NotificationSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("Notification"),
  message: z.string(),
  level: z.string().optional(),
});

const InstructionsLoadedSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("InstructionsLoaded"),
  file_path: z.string(),
  memory_type: z.enum(["Project", "User", "Local", "Managed"]),
  load_reason: z.string(),
  globs: z.array(z.string()).optional(),
  trigger_file_path: z.string().optional(),
  parent_file_path: z.string().optional(),
});

const PreCompactSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PreCompact"),
});

const PostCompactSchema = BaseHookSchema.extend({
  hook_event_name: z.literal("PostCompact"),
});

export const HookEventSchema = z.discriminatedUnion("hook_event_name", [
  SessionStartSchema,
  SessionEndSchema,
  UserPromptSubmitSchema,
  UserPromptExpansionSchema,
  PreToolUseSchema,
  PostToolUseSchema,
  PostToolUseFailureSchema,
  SubagentStartSchema,
  SubagentStopSchema,
  StopSchema,
  NotificationSchema,
  InstructionsLoadedSchema,
  PreCompactSchema,
  PostCompactSchema,
]);

export type HookEvent = z.infer<typeof HookEventSchema>;
