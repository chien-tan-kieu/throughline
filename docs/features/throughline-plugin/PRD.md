# PRD — Throughline

**A Claude Code plugin that visualizes the Superpowers (Spec-Driven Development) workflow, with an optional Kanban board and story tracking for solo-developer-with-AI flow.**

> Status: Draft v0.3 (research-backed, scope locked from review)
> Audience: Tech Lead / senior engineers implementing or reviewing this
> Date: 2026-05
> License (intended): MIT

---

## 1. TL;DR

Throughline is a Claude Code plugin that ships hooks, slash commands, skills, and a local web dashboard. The dashboard is a **passive observer** of your Claude Code session — it doesn't deny tool calls, doesn't block stop, doesn't modify input. Hooks fire, the daemon listens, and the dashboard renders state.

The dashboard's job is to be a **better visualization of the Superpowers workflow** than tailing a terminal or jumping between markdown files in your IDE. It reads Superpowers' own artifacts (`docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`) and pairs them with the live event stream so you can watch a plan's checkboxes tick off in real time, see which tool calls correspond to which plan task, and track subagent activity that's otherwise invisible in the terminal.

On top of Superpowers' core flow (brainstorm → spec → plan → implement) the plugin adds a thin Kanban layer that solo-developer-with-AI flow can opt into: **user stories** (with **S/M/L sizing**) as the input format that feeds Superpowers, plus **standup** and **handoff** as context utilities — not Scrum ceremonies. There is no sprint, no velocity, no enforced cadence and no issue tracker sync — just continuous flow over a board, with the minimum scaffolding that makes solo work resumable and handovers clean.

Stack: Bun + bun:sqlite for the daemon; Vite + React + TypeScript for the dashboard. Distributed exclusively via the Claude Code plugin marketplace. Single-user, single-machine. Open-source MIT.

---

## 2. Background & Why This Exists

### 2.1 What Superpowers gives us

Superpowers (`obra/superpowers`) is a Claude Code plugin shipping a methodology: brainstorm → write spec → write plan → execute plan with subagents and TDD. It writes its artifacts to known paths:

- Specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Plans: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- Plan tasks use markdown checkbox syntax (`- [ ]` / `- [x]`) as a state log — checkboxes are toggled as work proceeds, and the file is the recovery mechanism if a session dies.

The methodology is solid. The visibility into what's happening is poor — terminal scrollback flies by, subagents run silently, and the only way to see plan progress is to refresh the markdown file in your IDE.

### 2.2 What's missing

Three concrete gaps with the current Superpowers experience:

1. **Plan progress vs reality** — checkboxes toggle in the plan file, but you can't easily see which tool calls produced which checkbox tick, how long each task took, or where the agent is stuck.

2. **Subagent opacity** — Superpowers' `subagent-driven-development` dispatches fresh subagents per task. From the terminal, this looks like brief status messages. There's no way to see the subagent tree, what each one is reading/editing, or the two-stage review output.

3. **No team-friendly layer** — Superpowers is purpose-built for solo flow. Working with teammates needs slightly more structure: who's working on what, what's the size of this piece of work, how do I hand off mid-flight. None of that exists today, and a heavy issue tracker is overkill for small features.

### 2.3 Why a plugin (not a standalone app)

Plugin distribution gives us:

- **Zero-touch install**: `/plugin install throughline@<marketplace>` ships the hooks. No editing user `settings.json`, no install script.
- **Auto-discovery of Superpowers**: when both plugins are installed, our hooks fire alongside Superpowers' skills. We share the same session.
- **Trust model**: users review the plugin marketplace listing before install. We don't need to convince them to run a third-party daemon spawner.

The cost: we're constrained to what plugin hooks can express. That's fine because we deliberately scoped to **observer-only** — the constraint matches the design.

### 2.4 Prior art

Existing community projects (`disler/claude-code-hooks-multi-agent-observability`, `hoangsonww/Claude-Code-Agent-Monitor`, `simple10/agents-observe`) are observability dashboards over hook events. None integrate with Superpowers. None add a workflow layer. The space we're claiming is "observability **of a methodology**" rather than raw event firehose.

---

## 3. Product Surfaces

### 3.1 Surface A: Workflow Visualizer

The primary surface. Pairs Superpowers artifacts with the live event stream:

- **Plan view**: render the current plan's markdown, with checkboxes synced to the actual file. Each task and step shows the tool calls that triggered it, the duration, and the verification outcome.
- **Spec view**: render the design doc, scrollable alongside the plan.
- **Subagent activity** (P0: flat list; P1: tree): subagent lifecycle events surfaced in the session timeline so you can see when a subagent starts, what it's doing, and when it finishes. P1 upgrades to a proper parent-child tree once event ordering is proven stable in practice.
- **Diff timeline**: per-file edit history scoped to the current plan, with which task caused each edit.
- **Phase indicator**: shows where in the brainstorm → spec → plan → implement cycle the session currently is, inferred from skill activations and artifact presence.
- **Replay scrubber**: drag through the last N minutes of session activity. Useful when stepping away and coming back.

### 3.2 Surface B: Kanban Layer

Optional. Solo-friendly defaults; continuous flow over a board, no enforced cadence.

- **User stories**: markdown documents under `docs/superpowers/stories/`. Each story has a title, narrative ("As a..., I want..., so that..."), acceptance criteria, S/M/L size, status (`backlog | in-progress | done`), and zero or more linked Superpowers spec/plan files. **A user story is the input to a Superpowers brainstorming session** — when the user invokes `/throughline:start <story-id>`, the plugin pre-populates Claude's context with the story and triggers Superpowers' brainstorming skill.
- **Standup view**: a single page summarizing "what shipped yesterday, what's in progress today, what's blocked." Auto-generated from the session/event log. Copy button for pasting into Slack/Discord/standup.
- **Handoff notes**: when a user marks a story or in-progress workflow as "needs handoff", the plugin generates a markdown summary — current state, what was just tried, what's next, links to the plan with checkbox state preserved. Handoff notes are written to `.throughline/handoffs/<date>-<story>.md`, ready to commit and share.

The Kanban layer is opt-in: if the user never creates a story, the plugin works fine as just the Workflow Visualizer.

---

## 4. Goals & Non-Goals

### 4.1 Goals (P0, MVP)

| ID  | Goal                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- |
| G1  | Distributed exclusively as a Claude Code plugin via marketplace                                             |
| G2  | Plugin hooks are observer-only — never return `decision: "block"`, `permissionDecision: "deny"`, etc.       |
| G3  | Lazy-spawned local daemon (Bun) bound to `127.0.0.1`, started by SessionStart command hook on first session |
| G4  | Dashboard SPA renders live state; one-way data flow from daemon                                             |
| G5  | Detect Superpowers presence and parse its artifacts (specs, plans with checkboxes)                          |
| G6  | Live plan view that pairs checkbox state with tool calls                                                    |
| G7  | Subagent activity surfaced in session timeline (flat list; tree view deferred to P1)                        |
| G8  | User stories with S/M/L sizing — files under `docs/superpowers/stories/`, dashboard CRUD                     |
| G9  | Slash command `/throughline:start <story-id>` that opens Superpowers' brainstorming with story as input              |
| G10 | Standup view (auto-generated from event log) with copy-to-clipboard                                         |
| G11 | Handoff notes generator                                                                                     |
| G12 | Cross-platform (macOS/Linux/Windows) — daemon binary cross-compiled with Bun                                |
| G13 | Single-user, single-machine, localhost-only, no telemetry, MIT licensed                                     |

### 4.2 Goals (P1, after MVP)

| ID  | Goal                                                              |
| --- | ----------------------------------------------------------------- |
| G14 | Replay scrubber                                                   |
| G15 | Token/cost meter from `PostToolUse` API tool payloads             |
| G16 | Diff timeline per file                                            |
| G17 | Story templates (custom narrative formats per project)            |
| G18 | Sprint container (group stories under a sprint with goal + dates) |

### 4.3 Non-Goals

- **NG1** — Does not modify user `~/.claude/settings.json`. All hooks come from the plugin's `hooks/hooks.json`.
- **NG2** — Does not deny, block, modify, or defer tool calls. No rules engine. No control plane. Hooks return `{}` (no-op) for decision-bearing events.
- **NG3** — Does not fork or modify Superpowers. We read its artifacts, we trigger its skills via slash commands, we never change its files.
- **NG4** — Not network-accessible. `127.0.0.1` only. No remote dashboard, no Tailscale story.
- **NG5** — No issue tracker integration (Jira/Linear/GitHub Issues). User stories are local markdown.
- **NG6** — No multi-user. One human, one daemon.
- **NG7** — No telemetry. Ever.
- **NG8** — No mobile UI, no IDE embedding.
- **NG9** — No phase enforcement. The dashboard can show "you're in spec phase" but can't prevent tool calls. Enforcement would require a control plane, which we explicitly aren't building.
- **NG10** — No ceremony enforcement. We surface standup and handoff helpers; we don't nag.

---

## 5. Concepts

### 5.1 Hook events we listen to

All purely observational. None return decisions.

| Event                    | Why we listen                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart` (command) | Bootstrap the daemon if not running, optionally inject context noting the dashboard URL                                    |
| `UserPromptSubmit`       | Capture what the user asked for; correlate with Superpowers skill activation                                               |
| `PreToolUse`             | Record intent, surface in dashboard before execution. Empty response (no-op).                                              |
| `PostToolUse`            | Record result, update plan progress if a checkbox toggled, update file diff timeline                                       |
| `PostToolUseFailure`     | Record errors                                                                                                              |
| `SubagentStart`          | Add to subagent list with `agent_id`, `agent_type`, parent reference recorded for future tree upgrade                      |
| `SubagentStop`           | Mark subagent complete with summary (the `last_assistant_message` field gives us this without parsing the transcript file) |
| `Stop`                   | Mark session inactive in dashboard                                                                                         |
| `Notification`           | Forward to OS notification (optional, user-configurable)                                                                   |
| `FileChanged`            | Watch the Superpowers spec/plan paths for external edits                                                                   |
| `InstructionsLoaded`     | Detect when Superpowers' skill files are loaded — phase inference                                                          |

For events that _can_ block (`PreToolUse`, `Stop`, `SubagentStop`), our handler always responds with `{}` or HTTP 200 with empty body — explicit no-op. We never return `decision: "block"` or `permissionDecision: "deny"`. This is enforced by a unit test: pin the handler outputs to a snapshot.

### 5.2 Why observer-only is the right scope

A control plane is tempting (deny dangerous tool calls, enforce phase rules) but it's a different product:

- **Trust burden**: a plugin that can deny tool calls needs to be trusted not to break user workflows. That's a much higher bar for adoption.
- **Surface area**: rules engines need DSLs, dry-run, conflict resolution, audit trails. All complex.
- **Distribution friction**: a control plugin that misfires once erodes trust permanently. An observer that misfires shows nothing temporarily — no harm.

By scoping to observer, we're competing on **UX of visibility**, not on policy enforcement. That's a cleaner positioning and a much smaller engineering surface.

### 5.3 Superpowers artifacts we parse

The dashboard reads these files. We never write to them.

| Path                                                  | Format   | What we extract                                                               |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Markdown | Title (H1), goal, full body for rendering, last modified                      |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`      | Markdown | Title, goal, architecture, tech stack, task list, **checkbox state** per step |

Plan checkboxes follow the format from Superpowers' `writing-plans` skill:

````markdown
### Task 1: Create migration file

**Files:**

- Create: `db/migrations/001_users.sql`

- [ ] Step 1: Write the failing test
  ```python
  ...
  ```
````

- [x] Step 2: Run test to verify it fails
- [ ] Step 3: Write minimal implementation

```

We parse this to a tree:
- Tasks (H3 headings starting with `Task N:`)
- Files block per task
- Steps as checkbox items
- State derived from `[ ]` vs `[x]`

When a `PostToolUse` event for `Edit` or `Write` modifies the plan file, we re-parse and diff the checkbox state to figure out which step just completed. That's how we attribute tool calls to plan steps.

### 5.4 Phase inference

Superpowers doesn't expose "current phase" as a structured state. We infer from signals:

- `InstructionsLoaded` event for `brainstorming/SKILL.md` → phase = `brainstorm`
- `InstructionsLoaded` event for `writing-plans/SKILL.md` → phase = `plan`
- `InstructionsLoaded` event for `executing-plans/SKILL.md` or `subagent-driven-development/SKILL.md` → phase = `implement`
- New file appearing in `docs/superpowers/specs/` → phase reached `spec`
- New file appearing in `docs/superpowers/plans/` → phase reached `plan`
- Checkbox state changes in plan → phase = `implement`

Inference is best-effort. If wrong, the dashboard shows "phase: unknown" rather than guessing badly.

---

## 6. System Architecture

```

┌──────────────────────────────────────────────────────────────────────┐
│ User's Machine │
│ │
│ ┌──────────────────┐ ┌──────────────────────────────────┐ │
│ │ Claude Code │ │ throughline plugin │ │
│ │ CLI session │ │ (loaded by Claude Code) │ │
│ │ │ │ │ │
│ │ Hooks fire │ │ hooks/hooks.json │ │
│ │ (per plugin's │─load────│ commands/_.md (slashes) │ │
│ │ hooks.json) │ │ skills/_.md │ │
│ └──────────────────┘ │ bin/<platform>/cc-daemon │ │
│ │ └──────────────────────────────────┘ │
│ │ POST hook events │
│ ▼ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Throughline Daemon (Bun, 127.0.0.1:port) │ │
│ │ ┌────────────────────────────────────────────────────────┐ │ │
│ │ │ Bun.serve │ │ │
│ │ │ /hooks/:event ← receive events, no-op response │ │ │
│ │ │ /api/\* (REST) ← dashboard reads + writes stories │ │ │
│ │ │ /ws ← push events to dashboard │ │ │
│ │ │ / (static SPA) ← embedded dashboard build │ │ │
│ │ └────────────────────────────────────────────────────────┘ │ │
│ │ ┌────────────────────────────────────────────────────────┐ │ │
│ │ │ Event Bus (in-memory pub/sub) │ │ │
│ │ │ Superpowers Artifact Watcher (chokidar/Bun.watch) │ │ │
│ │ │ Plan Parser │ │ │
│ │ │ Story Manager │ │ │
│ │ │ bun:sqlite store │ │ │
│ │ └────────────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ▲ │
│ │ REST + WS │
│ │ │
│ ┌──────────────────┐ │ Project repo │
│ │ Browser tab │────┘ ├─ docs/superpowers/ │
│ │ React SPA │ │ ├─ specs/ │
│ │ (dashboard) │ │ └─ plans/ ← read by daemon│
│ └──────────────────┘ ├─ .throughline/ │
│ │ ├─ stories/ ← daemon owns │
│ │ └─ handoffs/ ← daemon writes │
│ └─ ... │
│ │
│ ~/.throughline/ │
│ ├─ daemon.log │
│ ├─ runtime.json (port, token, pid) │
│ └─ state.db (events, sessions) │
└──────────────────────────────────────────────────────────────────────┘

```

### 6.1 Data ownership

| State | Owner | Persistence |
|---|---|---|
| Hook events, sessions | daemon, SQLite | rolling 30 days |
| User stories | filesystem at `<repo>/docs/superpowers/stories/*.md` (canonical) + SQLite cache | git-tracked by user |
| Handoff notes | filesystem at `<repo>/.throughline/handoffs/*.md` | git-tracked by user |
| Superpowers specs/plans | filesystem at `<repo>/docs/superpowers/` (canonical, owned by Superpowers) | read-only for us |
| Runtime info (port, token, pid) | `~/.throughline/runtime.json` | written on start |
| UI selection, filters | browser sessionStorage | ephemeral |

Story and handoff files are markdown so they're git-friendly. The SQLite cache is for fast queries and gets rebuilt from files on daemon start. Files are the source of truth — if the user edits a story in their IDE, the watcher picks it up.

### 6.2 One-way data flow

The daemon is authoritative. Dashboard sends mutations through REST → daemon persists → daemon broadcasts via WS → all dashboard tabs receive. The dashboard's local state is a reactive projection, never authoritative.

Practically: TanStack Query manages REST cache; WS messages call `queryClient.setQueryData` to push server-pushed values into caches. Refresh the page and you get a fresh snapshot via REST + replay WS from a cursor.

---

## 7. Components

### 7.1 The plugin package

Standard Claude Code plugin layout:

```

throughline/
├── .claude-plugin/
│ └── plugin.json ← name, version, description
├── hooks/
│ └── hooks.json ← all hook handler definitions
├── commands/
│ ├── status.md ← /throughline:status
│ ├── start.md ← /throughline:start <story-id>
│ ├── story.md ← /throughline:story new|list|size
│ ├── standup.md ← /throughline:standup
│ ├── handoff.md ← /throughline:handoff <story-id>
│ └── open.md ← /throughline:open (open dashboard)
├── skills/
│ └── throughline/SKILL.md ← optional skill that explains the plugin to Claude
├── bin/
│ ├── darwin-x64/cc-daemon
│ ├── darwin-arm64/cc-daemon
│ ├── linux-x64/cc-daemon
│ ├── linux-arm64/cc-daemon
│ └── windows-x64/cc-daemon.exe
└── README.md

````

The `bin/` directory holds cross-compiled Bun binaries (one per platform). At ~80MB each, this is the bulk of the plugin size. Acceptable: plugin install is a one-time cost.

`hooks/hooks.json` references the bundled binary using `${CLAUDE_PLUGIN_ROOT}`:

```json
{
  "description": "Throughline — workflow visualizer",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/bin/<platform>/cc-daemon bootstrap",
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/PreToolUse",
            "timeout": 10,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"]
          }
        ]
      }
    ]
    // ... other events
  }
}
````

The `<platform>` placeholder is resolved at install time. (If Claude Code doesn't expand it natively, we ship a wrapper script that detects platform and forwards to the right binary.)

### 7.2 The daemon

**Runtime**: Bun 1.x. Same justifications as before — native HTTP/WS, `bun:sqlite`, `bun build --compile` cross-platform binaries, fast cold start.

**Process model**:

- Single-process, single-instance (singleton enforced by port binding).
- Detached from Claude Code session via `Bun.spawn(...).unref()`. Survives CC exits.
- Idle shutdown: if no events received in 4 hours, daemon self-exits to free resources.

**Subsystems**:

- `hooks/` — receive events, persist, broadcast. All handlers return no-op response.
- `superpowers/` — artifact watcher (file watch on `docs/superpowers/`), markdown parser, checkbox state diff.
- `stories/` — story CRUD (file-backed), watcher for external edits.
- `standup/` — query event log + story state, generate digest.
- `handoff/` — generate handoff markdown from current state.
- `bus/` — in-memory event emitter, WS fan-out.
- `store/` — SQLite events/sessions cache, story index, handoff log.
- `security/` — token check, Host header validation, CORS.
- `lifecycle/` — graceful SIGTERM, idle shutdown.

**No-op response illustrative code**:

```ts
// packages/server/src/hooks/preToolUse.ts
export async function handlePreToolUse(req: Request, db: DB, bus: Bus) {
  const payload = PreToolUseSchema.parse(await req.json());
  await persistEvent(db, payload);
  bus.publish(`session:${payload.session_id}`, {
    type: "event",
    data: payload,
  });

  // Always no-op. Never deny, never modify.
  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

A test asserts the response body is exactly `{}` for all decision-bearing events. This locks the observer-only contract at code-review time.

### 7.3 Slash commands

Implemented as standard Claude Code commands (markdown files with frontmatter under `commands/`):

| Command                         | What it does                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/throughline:status`                    | Print daemon status, dashboard URL, current session, active story                                                                 |
| `/throughline:open`                      | Print dashboard URL with token query (Claude shows it; user clicks)                                                               |
| `/throughline:story new <title>`         | Scaffold a new user story file                                                                                                    |
| `/throughline:story list`                | List stories with status and size                                                                                                 |
| `/throughline:story size <id> <S\|M\|L>` | Set/update story size                                                                                                             |
| `/throughline:start <story-id>`          | Load story content into Claude's context, instruct Claude to invoke Superpowers' brainstorming skill with this story as the basis |
| `/throughline:standup`                   | Generate today's standup digest                                                                                                   |
| `/throughline:handoff <story-id>`        | Generate handoff notes for the named story                                                                                        |

The interesting one is `/throughline:start`. It works by:

1. Reading the story file from disk.
2. Constructing a prompt like: _"I want to start work on this user story. Use the Superpowers brainstorming skill to refine it into a design spec before any implementation. Story: ..."_
3. Returning that prompt as the slash command's expansion.

Claude then sees the expanded prompt, the brainstorming skill activates (it's marked MUST-USE-BEFORE-CODE in Superpowers), and the story content is the input to the brainstorm. The plugin doesn't fight Superpowers' flow — it feeds it.

### 7.4 Dashboard

**Stack**: Vite 5 / React 18 / TypeScript strict / Tailwind / shadcn/ui / TanStack Query / Zustand / Recharts. Same as v0.2.

**Layout** (single-page, three sections):

```
┌──────────────────────────────────────────────────────────────────┐
│ Topbar: workflow phase | session ▾ | conn status | settings ⚙   │
├────────┬───────────────────────────────────────┬─────────────────┤
│ Left   │  Main: Workflow Visualizer           │  Right: Inspect │
│        │  ────────────────────────────────────│                 │
│ Stories│  [Spec] [Plan]  ← tabbed              │  Selected event │
│ ────── │                                       │  or task detail │
│ • US-1 │  ## Plan: 2026-05-04-auth.md          │                 │
│   M ✓  │  Goal: Implement OAuth login          │  Files          │
│ • US-2 │                                       │  Tool calls     │
│   L ●  │  ─ Task 1: schema migration  ✓        │  Duration       │
│ • US-3 │  ─ Task 2: User model        ✓ (180s) │  Verification   │
│   S    │  ─ Task 3: OAuth handler     ● (now)  │                 │
│        │     ├ [✓] Step 1: failing test        │                 │
│ ────── │     ├ [✓] Step 2: verify fail         │                 │
│ Phase  │     ├ [●] Step 3: implementation      │                 │
│ Plan ● │     └ [ ] Step 4: verify pass         │                 │
│        │                                       │                 │
│ Standup│  Subagent activity:                   │                 │
│ ────── │   • task-3-impl (running, 12s)        │                 │
│ Handoff│   • task-2-review (done, 8s)          │                 │
└────────┴───────────────────────────────────────┴─────────────────┘
```

**Views (P0)**:

1. **Plan view** — primary view, shown above. The plan markdown is rendered with checkbox state synced to the actual file. Active task highlighted. Each task shows associated tool calls (click to inspect).
2. **Spec view** — sibling tab to plan; shows the design doc for context.
3. **Subagent activity (flat)** — list of subagents that started/are running/finished in this session, with status and brief description. No parent-child nesting in P0.
4. **Stories sidebar** — list of stories with status (`backlog | in-progress | done`), size badge (S/M/L), filter/search. Click a story to open its file in inspector pane.
5. **Standup page** — separate route; auto-generated daily digest with copy button.
6. **Settings** — port, regenerate token, enabled features, log level.

**Views (P1)**:

7. **Replay scrubber** — drag through past events.
8. **Cost meter** — token + USD accumulator.
9. **Diff timeline** — per-file edit history with task attribution.

**Real-time**: WebSocket subscribe per active view. Topics: `session:<id>`, `stories`, `plan:<path>`, `subagents:<sessionId>`.

### 7.5 The shared package

Same role as before: Zod schemas for hook events, contract types for REST and WS, shared parsers (markdown checkbox parser, story frontmatter parser).

---

## 8. Lifecycle Flows

### 8.1 First install

```
$ claude
> /plugin marketplace add github.com/<org>/throughline-marketplace
> /plugin install throughline
[Claude Code reads plugin.json, hooks.json — hooks now active]

(next time the user starts a session)
$ claude
> [SessionStart fires → command hook spawns daemon]
> [HTTP hooks now route to daemon]

> /throughline:status
✓ Daemon running on http://127.0.0.1:47821
  Dashboard: http://127.0.0.1:47821/?token=<...>
  Open with: /throughline:open
```

No edit of `~/.claude/settings.json`. No CLI install command. The plugin's own `hooks/hooks.json` is loaded by Claude Code automatically.

### 8.2 Each session start

```
SessionStart event fires (matcher: startup|resume|clear|compact)
└─ command: ${CLAUDE_PLUGIN_ROOT}/bin/<platform>/cc-daemon bootstrap
   ├─ probe daemon /healthz → 200 → exit 0  (~50ms hot path)
   │   └─ optionally emit additionalContext mentioning dashboard URL
   └─ probe fail → spawn daemon detached → wait up to 3s → exit 0
```

The bootstrap binary writes the token to `$CLAUDE_ENV_FILE` so subsequent HTTP hooks can use `Authorization: Bearer $CLAUDE_CONTROL_TOKEN`:

```bash
# Inside bootstrap, after daemon is up:
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "export CLAUDE_CONTROL_TOKEN=$TOKEN" >> "$CLAUDE_ENV_FILE"
fi
```

### 8.3 Each tool call (the observer flow)

```
Claude generates Bash { command: "pytest" }
  ├─ PreToolUse fires (HTTP)
  │  └─ POST /hooks/PreToolUse → daemon
  │     ├─ persist event (async)
  │     ├─ broadcast WS to dashboard subscribers
  │     └─ respond {}      ← no-op, returns immediately, <30ms
  ├─ Tool executes (unaffected by us)
  ├─ PostToolUse fires (HTTP, async: true)
  │  └─ POST /hooks/PostToolUse → daemon
  │     ├─ persist event with tool_response
  │     ├─ if tool was Edit/Write on plan file → re-parse plan, diff checkbox state
  │     ├─ broadcast WS
  │     └─ respond {} (async, doesn't gate next CC step)
  └─ Loop continues
```

### 8.4 Story → Superpowers brainstorm flow

```
$ /throughline:story new "Add OAuth login"
  → daemon scaffolds docs/superpowers/stories/US-2026-05-04-oauth-login.md with template
  → user edits in IDE: narrative, acceptance criteria, leaves size blank

$ /throughline:story size US-2026-05-04-oauth-login M
  → daemon updates frontmatter

$ /throughline:start US-2026-05-04-oauth-login
  → command expands to a prompt that loads story content + instructs Superpowers brainstorm
  → Claude reads, brainstorming skill activates, asks clarifying questions
  → user answers, design doc gets written to docs/superpowers/specs/
  → SessionStart events from FileChanged hook → daemon picks up new spec
  → dashboard now shows story linked to spec

(time passes, Superpowers writes a plan)

  → daemon picks up plan via FileChanged
  → dashboard shows plan view with checkboxes empty
  → as Superpowers' subagents execute tasks, plan checkboxes tick → daemon syncs → dashboard updates

(work is done)

$ /throughline:story (mark done in dashboard, or manually edit frontmatter)
```

### 8.5 Standup generation

The standup digest is a function of (recent sessions, recent story state changes, recent handoffs). Generated on demand by `/throughline:standup` or by clicking "Standup" in dashboard:

```markdown
## Standup — 2026-05-05

### Yesterday

- ✓ Shipped: US-2026-05-03-user-model (M) — 12 commits, all tests green
- ✓ Shipped: US-2026-05-03-error-pages (S)

### Today

- ● In progress: US-2026-05-04-oauth-login (M) — plan at docs/superpowers/plans/2026-05-04-oauth.md, 4/12 tasks done

### Blockers

- (none auto-detected)
```

The "blockers" section is auto-detected from `PostToolUseFailure` patterns (e.g., test failures repeated >N times on the same task). Conservative — if not confident, says "(none auto-detected)" rather than fabricating.

### 8.6 Handoff notes

```
$ /throughline:handoff US-2026-05-04-oauth-login
  → daemon generates .throughline/handoffs/2026-05-05-oauth-login.md:

# Handoff: Add OAuth login (US-2026-05-04-oauth-login)

## Status as of 2026-05-05 14:32

**Story size:** M
**Phase:** implement (4/12 plan tasks complete)
**Plan:** docs/superpowers/plans/2026-05-04-oauth.md

## What's done
- Task 1: Create migration file ✓
- Task 2: User model ✓
- Task 3: OAuth state table ✓
- Task 4: Token storage helper ✓

## What's next (per the plan)
- Task 5: OAuth handler — `src/auth/handler.ts` (in progress)
  - [✓] Step 1: failing test written
  - [✓] Step 2: confirmed failing
  - [●] Step 3: implementation in progress
  - [ ] Step 4-7: ...

## Recent activity
- Last 3 PostToolUse events on this plan: ...
- Last test run: pytest tests/auth/test_handler.py — FAIL (exit 1)
- Recent commits: <git log --oneline -5 since branch creation>

## To resume
1. Read this handoff
2. Read the spec: docs/superpowers/specs/2026-05-04-oauth-design.md
3. Read the plan: docs/superpowers/plans/2026-05-04-oauth.md
4. Run `claude --resume <session-id>` or start fresh and reference plan
```

User commits this handoff to the repo. Teammate or future-self picks up.

---

## 9. Data Model

```sql
-- Hook events (cache, can be regenerated from disk if lost)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL,
  model TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  agent_type TEXT,
  permission_mode TEXT,
  status TEXT NOT NULL,
  active_story_id TEXT,            -- linked story
  active_plan_path TEXT,           -- linked Superpowers plan file
  inferred_phase TEXT              -- 'brainstorm' | 'spec' | 'plan' | 'implement' | null
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  event_name TEXT NOT NULL,
  matcher TEXT,
  payload_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_events_session_ts ON events(session_id, ts);
CREATE INDEX idx_events_event_ts ON events(event_name, ts);

-- Story index (canonical = filesystem; this is a search/filter cache)
CREATE TABLE stories (
  id TEXT PRIMARY KEY,             -- US-YYYY-MM-DD-slug
  file_path TEXT NOT NULL,         -- relative to repo
  title TEXT NOT NULL,
  size TEXT,                       -- 'S' | 'M' | 'L' | null
  status TEXT NOT NULL,            -- 'backlog' | 'in-progress' | 'done' | 'archived'
  linked_spec_path TEXT,
  linked_plan_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plan parse cache (canonical = the plan file; this is for fast queries)
CREATE TABLE plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path TEXT NOT NULL,
  task_index INTEGER NOT NULL,
  task_title TEXT NOT NULL,
  task_files_json TEXT,            -- list of files this task touches
  ts INTEGER NOT NULL
);

CREATE TABLE plan_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_path TEXT NOT NULL,
  task_index INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  step_label TEXT NOT NULL,
  state TEXT NOT NULL,             -- 'todo' | 'done'
  completed_at INTEGER,
  inferred_event_id INTEGER,       -- which PostToolUse event likely caused this step's completion
  ts INTEGER NOT NULL
);

-- Handoff log (canonical = filesystem)
CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  generated_at INTEGER NOT NULL
);
```

Retention: 30 days for `events`. Story and handoff caches live as long as the files exist. SQLite VACUUM nightly.

If the DB is lost or corrupt, the daemon rebuilds it on startup by reading story files and plan files from disk. Events cache is the only thing that's truly lost — and it's only a 30-day buffer anyway.

---

## 10. API Contract

### 10.1 Hook routes

`POST /hooks/<EventName>` — body matches Anthropic's JSON shape. Auth: `Authorization: Bearer <token>`.

**All hook handlers respond with HTTP 200 and body `{}`.** No exceptions. This is the observer contract.

Latency budget: P50 <30ms, P95 <100ms, P99 <300ms. (We're fast because we never compute decisions — just persist + broadcast.)

### 10.2 REST API

| Method | Path                                 | Description                                                      |
| ------ | ------------------------------------ | ---------------------------------------------------------------- |
| GET    | `/api/healthz`                       | Liveness (no auth)                                               |
| GET    | `/api/sessions`                      | List sessions                                                    |
| GET    | `/api/sessions/:id`                  | Session detail with events                                       |
| GET    | `/api/events?session=&since=&limit=` | Cursor-paginated event search                                    |
| GET    | `/api/stories`                       | List stories                                                     |
| GET    | `/api/stories/:id`                   | Story detail (rendered markdown + frontmatter)                   |
| POST   | `/api/stories`                       | Create story (writes file)                                       |
| PATCH  | `/api/stories/:id`                   | Update story (size, status, narrative — re-writes file)          |
| DELETE | `/api/stories/:id`                   | Archive story (moves file to `docs/superpowers/stories/archive/`) |
| GET    | `/api/plans/:path`                   | Parsed plan (tree of tasks + steps + state)                      |
| GET    | `/api/specs/:path`                   | Rendered spec markdown                                           |
| GET    | `/api/standup?date=`                 | Generated standup digest                                         |
| POST   | `/api/handoff/:storyId`              | Generate handoff (returns markdown + writes file)                |
| GET    | `/api/handoffs`                      | List past handoffs                                               |
| GET    | `/api/subagents/:sessionId`          | Subagent activity (flat list in P0; tree-shaped in P1)           |
| POST   | `/api/system/regenerate-token`       | New token; old invalidated                                       |

Auth: Bearer token on everything except `/healthz`.

### 10.3 WebSocket

`ws://127.0.0.1:<port>/ws?token=<token>`

```ts
type WSOut =
  | { type: "event"; data: EventRecord }
  | { type: "session.started"; data: Session }
  | { type: "session.ended"; data: { id: string } }
  | { type: "plan.changed"; data: { path: string; tasks: PlanTask[] } }
  | { type: "spec.changed"; data: { path: string } }
  | {
      type: "story.changed";
      data: { id: string; op: "create" | "update" | "delete" };
    }
  | { type: "subagent.started"; data: SubagentNode }
  | { type: "subagent.stopped"; data: { agent_id: string; summary: string } }
  | { type: "phase.inferred"; data: { sessionId: string; phase: Phase } };

type WSIn =
  | { type: "subscribe"; topics: string[] }
  | { type: "unsubscribe"; topics: string[] }
  | { type: "ping" };
```

Topics: `events`, `events:<sessionId>`, `plan:<path>`, `stories`, `subagents:<sessionId>`.

---

## 11. Story format

Stories live as markdown files with YAML frontmatter at `<repo>/docs/superpowers/stories/<id>.md`:

```markdown
---
id: US-2026-05-04-oauth-login
title: Add OAuth login
size: M
status: in-progress
created: 2026-05-04
linked_spec: docs/superpowers/specs/2026-05-04-oauth-design.md
linked_plan: docs/superpowers/plans/2026-05-04-oauth.md
---

## Story

As an unauthenticated visitor, I want to log in with Google OAuth, so that I
don't have to manage another password.

## Acceptance criteria

- [ ] User can click "Login with Google" on /login
- [ ] After successful auth, redirected to /dashboard
- [ ] User row created in `users` table on first login
- [ ] Subsequent logins reuse existing row
- [ ] Session persists across page reloads (24h)
- [ ] Logout clears session

## Notes

- Out of scope for this story: GitHub OAuth, password reset
```

Frontmatter is the structured part the daemon parses. Body is freeform — what Superpowers' brainstorming skill consumes.

**Sizing convention** (S/M/L, kept deliberately simple):

| Size  | Rough scope                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| **S** | Few hours. Single file or single concept. ~1-3 plan tasks.                                                          |
| **M** | Half-day to one day. ~3-8 plan tasks.                                                                               |
| **L** | Multi-day. ~8+ plan tasks, possibly multiple sub-features. **L stories should be decomposed during brainstorming.** |

The daemon doesn't enforce these — they're conventions documented in the README and shown as tooltips in the dashboard.

---

## 12. Security

Mostly inherited from v0.2 (the daemon is still localhost-bound and token-authed). The threat model is simpler now because we're observer-only:

| Threat                                                                      | Mitigation                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS rebinding (browser visits malicious site, JS POSTs to `127.0.0.1:port`) | Validate `Host` header — accept only `127.0.0.1[:port]` and `localhost[:port]`. Bearer token mandatory.                                                                                                                                |
| LAN attacker reaching daemon                                                | Hardcode `hostname: "127.0.0.1"`. No config option.                                                                                                                                                                                    |
| Token leak via committed file                                               | Token in `~/.throughline/runtime.json` (mode 0600), referenced from settings as `$CLAUDE_CONTROL_TOKEN` env var (set via `CLAUDE_ENV_FILE` in SessionStart). Plugin's `hooks.json` references the env var, never the token literal. |
| Story files leaking secrets                                                 | Stories are user-authored markdown. We don't have a way to know if they contain secrets. Document: don't paste API keys into stories.                                                                                                  |
| Path traversal via story id                                                 | Validate story ids against a strict regex, reject `..`                                                                                                                                                                                 |
| Daemon DoS via flood of hook events                                         | Rate-limit per session_id (1000 events/min hard cap). Beyond that, return 200 but don't persist.                                                                                                                                       |

What we _don't_ have to worry about now: rule injection, malicious imported rules, sideEffect shell escapes — all gone with the rules engine.

---

## 13. Distribution

Single channel: **Claude Code plugin marketplace**.

- Repo: `<org>/throughline` — the plugin source.
- Marketplace: either submit to an existing curated marketplace (e.g., `obra/superpowers-marketplace`) or run our own at `<org>/throughline-marketplace` for users to add.
- Install: `/plugin marketplace add <repo>` then `/plugin install throughline`.
- Update: handled by Claude Code's plugin update mechanism. We follow SemVer.

We don't ship to npm. We don't ship a Homebrew tap. We don't have an `install.sh`. The plugin's `bin/<platform>/` directory is the entire binary distribution mechanism.

### 13.1 Cross-platform binaries

`bun build --compile --target=bun-<os>-<arch>` for the five platform combos. Built in CI on tag push, attached to the GitHub release that the plugin pulls from.

The plugin repo can ship binaries either:

- (a) **In-repo**: commit the binaries to the plugin repo. Simplest; bloats repo size to ~400MB.
- (b) **Released artifact**: post-install script downloads the right binary from GitHub Releases. Smaller repo, but adds a network step at install.

**Default: (a)**, unless repo size becomes a real problem. Plugin marketplace install is meant to be self-contained, and a one-time 400MB pull is tolerable.

### 13.2 Embedded SPA

Production: `vite build` → `bun build --compile` embeds the SPA via `with { type: "file" }` import attributes. Single binary, serves the dashboard from in-memory paths.

Development: web on 5173 (`vite dev`), daemon on 47821, Vite proxies `/api`, `/hooks`, `/ws`.

---

## 14. Tech Stack

| Component       | Choice                                           | Why                                                                                 |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Server runtime  | Bun 1.x                                          | Native HTTP/WS, bun:sqlite, fast cold start, single-binary compile                  |
| Web build       | Vite 5 + React 18 + TS strict                    | Familiar, mature plugins, shadcn ecosystem                                          |
| Package manager | pnpm 9 (dev only)                                | Workspace-friendly. End users never run pnpm — they install via plugin marketplace. |
| UI components   | Tailwind + shadcn/ui                             | Copy-paste, no lock-in, dark default                                                |
| Server cache    | TanStack Query                                   | WS-driven invalidation works cleanly                                                |
| UI state        | Zustand                                          | Simple                                                                              |
| Validation      | Zod                                              | Type-infer, share between client/server                                             |
| Markdown        | `unified` + `remark`                             | Parse plan checkbox state, render specs/plans in dashboard                          |
| File watch      | Bun.watch + chokidar fallback                    | Bun.watch is fast on macOS/Linux; chokidar handles Windows quirks                   |
| DB              | bun:sqlite                                       | Built-in                                                                            |
| Logging         | pino                                             | Fast, structured, redaction                                                         |
| Tests           | bun:test (server, shared) + Playwright (web E2E) | bun:test is fast; Playwright is the standard for E2E                                |

### 14.1 Monorepo layout

```
throughline/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── events.ts         ← Zod schemas per hook event
│   │       ├── api.ts            ← REST/WS contract types
│   │       ├── plan.ts           ← plan markdown parser
│   │       └── story.ts          ← story frontmatter parser
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts          ← entry, daemon mode flag
│   │   │   ├── server.ts
│   │   │   ├── hooks/            ← all return no-op responses
│   │   │   ├── api/
│   │   │   ├── ws/
│   │   │   ├── superpowers/      ← artifact watcher, parser
│   │   │   ├── stories/
│   │   │   ├── standup/
│   │   │   ├── handoff/
│   │   │   ├── store/
│   │   │   ├── security/
│   │   │   └── lifecycle/
│   │   ├── migrations/
│   │   └── build.ts              ← Bun.build wrapper for --compile
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── pages/
│           ├── components/
│           ├── hooks/
│           └── lib/
├── plugin/                        ← what ships to the marketplace
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── commands/
│   ├── skills/
│   ├── bin/                       ← populated by CI from packages/server build
│   └── README.md
├── .github/workflows/             ← CI: lint, test, build matrix, package plugin
├── CONTRIBUTING.md
├── LICENSE                        ← MIT
└── README.md
```

### 14.2 Build pipeline

```bash
# Dev
pnpm dev
# → @throughline/web: vite dev (5173)
# → @throughline/server: bun run --watch src/index.ts (47821)

# Production
pnpm build
# 1. @throughline/shared: tsc emit
# 2. @throughline/web: vite build → dist/web/
# 3. @throughline/server: bun build --compile for each target → dist/bin/<target>/cc-daemon
# 4. Package: copy dist/bin/* into plugin/bin/<platform>/
# 5. Plugin is now ready to ship
```

CI runs the build matrix on tag push and produces a release with the `plugin/` directory zipped + linked from the marketplace JSON.

---

## 15. Performance & SLOs

| Metric                                            | P50   | P95    | P99    |
| ------------------------------------------------- | ----- | ------ | ------ |
| Bootstrap (warm — daemon up)                      | 30ms  | 100ms  | 250ms  |
| Bootstrap (cold — needs spawn)                    | 1.2s  | 2.5s   | 4s     |
| Hook handler latency (any event)                  | 20ms  | 80ms   | 200ms  |
| Plan re-parse on file change                      | <50ms | <150ms | <500ms |
| WS broadcast → UI render                          | 30ms  | 100ms  | 300ms  |
| Memory (idle)                                     | 50MB  | 80MB   | 150MB  |
| Memory (active session, 1k events, 50 plan steps) | 80MB  | 120MB  | 200MB  |

We're faster than v0.2 because there's no rule evaluation in the hot path. Hook handlers persist + broadcast and that's it.

DB writes are async (fire-and-forget), bounded by a high-water mark of 1000 in-flight. Backpressure: if overflow, drop oldest events but always keep `SubagentStart`/`SubagentStop` and tool failures (these matter for debugging).

---

## 16. Edge Cases & Failure Modes

| Case                                                                 | Behavior                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port 47821 already in use                                            | Try 47821..47830, persist whichever bound. If all taken, log and exit.                                                                                                     |
| Daemon crashes mid-session                                           | Hooks get connection refused → CC logs non-blocking error → next event tries again. SessionStart respawns. Dashboard shows "disconnected" until back.                      |
| Multiple parallel CC sessions                                        | Singleton daemon, each session tracked by `session_id`. Dashboard has selector.                                                                                            |
| `claude --resume`                                                    | SessionStart fires with matcher `resume`; daemon recovers session record. Session associations restored.                                                                   |
| User installs Superpowers after Throughline                       | Watcher detects new `docs/superpowers/` directory on next file event; starts parsing.                                                                                      |
| User uninstalls Superpowers                                          | Plan/spec views show "no Superpowers artifacts found". Stories and standup still work.                                                                                     |
| User has no Superpowers and no stories                               | Dashboard works as a plain event timeline. Useful but minimal.                                                                                                             |
| Plan file has malformed checkbox syntax                              | Parser skips malformed entries, logs warning. Doesn't crash.                                                                                                               |
| Story file edited externally (IDE) while daemon running              | File watcher picks up; cache reindexes; WS push to dashboard.                                                                                                              |
| Two browser tabs open on dashboard                                   | Both subscribe; both receive WS pushes; story edits in one reflect in other (eventual consistency, last write wins).                                                       |
| Plugin updated while daemon running                                  | New plugin version's `hooks.json` is loaded by CC at next session; daemon binary may have new version too. Daemon detects mismatch → graceful restart on next idle window. |
| `${CLAUDE_PLUGIN_ROOT}/bin/<platform>/` missing for current platform | Bootstrap exits non-zero with stderr explaining; user sees error in CC. Document supported platforms clearly.                                                              |
| User manually kills daemon                                           | Next hook respawns.                                                                                                                                                        |
| Disk full                                                            | Daemon stops persisting but keeps responding to hooks (logs warning). UI shows banner.                                                                                     |
| DB corruption                                                        | Detect on boot, rename file to `.bak`, init fresh. UI shows warning.                                                                                                       |
| User opens dashboard without token                                   | Static SPA served, but API calls fail with 401. Dashboard shows "no token — open via /throughline:open".                                                                            |

---

## 17. Risks

| Risk                                                                                | L   | I   | Mitigation                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic ships breaking changes to hooks API                                       | M   | H   | Pin CC version range in `plugin.json`. CI test against multiple CC versions. Empty-response fallback.                                                                                                                    |
| Bun cross-platform bugs (esp. Windows file watch, spawn detached)                   | M   | M   | Test matrix Day 1. Chokidar fallback for file watch. Document known Windows limitations.                                                                                                                                 |
| Superpowers changes its artifact paths or plan format                               | M   | H   | Parser is forgiving (skips unrecognized syntax, doesn't crash). Pin a minimum Superpowers version in README. CI test against Superpowers releases.                                                                       |
| Plugin binary distribution makes repo huge (5×80MB)                                 | H   | L   | Acceptable. If it becomes a problem, switch to release-artifact-on-install.                                                                                                                                              |
| Users want control plane features ("can it block bad commits?")                     | H   | L   | Document scope clearly. Suggest existing tools (git hooks, CC permission rules in user settings). Don't dilute scope.                                                                                                    |
| Subagent tree (P1) — race conditions and parent-child mapping harder than they look | M   | L   | P0 ships flat list (decision locked). Tree visualization deferred to P1, builds on `agent_id` + `transcript_path` recorded from P0 onward. By P1 we'll have weeks of real event traces to validate ordering assumptions. |
| Story sizing degenerates into "everything is M"                                     | M   | L   | UX nudge: dashboard shows distribution; if 80% are M, prompt user to reconsider. Don't enforce.                                                                                                                          |
| Dashboard becomes a screen-real-estate hog                                          | M   | M   | Keyboard-driven shortcuts, compact mode, "minimize to topbar" option.                                                                                                                                                    |
| OSS contribution overhead                                                           | M   | M   | Strict CONTRIBUTING.md, "good first issue" labels, contributor-friendly setup (`pnpm install && pnpm dev` should just work).                                                                                             |

---

## 18. MVP Scope

### 18.1 In MVP (target 6–8 weeks, 1 dev)

- Plugin scaffold (plugin.json, hooks.json, commands, skills).
- Daemon: Bun.serve, bun:sqlite, hostname-bound, Bearer auth, Host validation.
- Hook handlers for SessionStart (command), UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStart, SubagentStop, Notification, FileChanged, InstructionsLoaded — all observer-only.
- Bootstrap binary (probe + spawn detached), token persisted via `CLAUDE_ENV_FILE`.
- Slash commands: `/throughline:status`, `/throughline:open`, `/throughline:story (new|list|size)`, `/throughline:start`, `/throughline:standup`, `/throughline:handoff`.
- Superpowers artifact watcher (specs + plans), markdown parser with checkbox state diff.
- Phase inference from skill loads + artifact presence.
- Story CRUD, file-backed, with watcher.
- Standup generator, handoff generator.
- Dashboard: plan view, spec view, subagent activity (flat list), stories sidebar, standup page, settings.
- Cross-platform binaries (5 targets) in CI.
- Plugin packaging.
- README, CONTRIBUTING, LICENSE (MIT), demo gif/video.

### 18.2 Out of MVP (P1)

- Subagent tree visualization (parent-child nesting; flat list ships in P0)
- Replay scrubber
- Token/cost meter
- Diff timeline per file
- Sprint container (groups of stories with goal + dates)
- Story templates
- Subagent two-stage review output rendering
- "Why is this blocked?" auto-detection

### 18.3 Out of v1 entirely (P2+)

- Issue tracker integration (Linear/Jira/GitHub Issues)
- Multi-user / team-shared dashboard
- Mobile UI
- IDE embedding
- ML-suggested standup summaries
- Cloud sync of stories

---

## 19. Roadmap

```
Weeks 1–2  Foundation
           - Monorepo scaffold, Zod schemas for hook events
           - Daemon skeleton, hook routing (no-op responses), security gate
           - bun:sqlite store + migrations
           - Bootstrap binary, plugin scaffold

Weeks 3–4  Superpowers integration + Stories
           - Artifact watcher, plan/spec parser, checkbox diff
           - Phase inference logic
           - Story CRUD (file-backed + cache), watcher
           - Slash commands

Weeks 5–6  Dashboard
           - React+Vite scaffold, shadcn setup
           - Plan view + spec view + subagent activity (flat)
           - Stories sidebar, standup page
           - WS client with topic subscribe

Weeks 7–8  Distribution + Polish
           - Cross-compile binary matrix in CI
           - Plugin packaging end-to-end
           - Handoff generator
           - Security review pass
           - E2E test against real Claude Code + real Superpowers
           - README, demo video, CONTRIBUTING
           - v0.1.0 release to plugin marketplace
```

---

## 20. Open Source Considerations

- **License**: MIT.
- **Telemetry**: none. Stated explicitly in README and config.
- **Versioning**: SemVer. Breaking changes only in major versions.
- **Compatibility matrix**: pin Claude Code version range and Superpowers version range in README. Update in CI when either ships.
- **CONTRIBUTING.md**: monorepo dev setup (`pnpm install && pnpm dev`), how to add a hook event handler, how to add a slash command.
- **Issue templates**: bug (with repro + CC version + Superpowers version + OS), feature, security advisory.
- **Code of conduct**: Contributor Covenant.
- **Demo content**: short video showing install → first session with a story → watching plan checkboxes tick off live. This is the value prop in 90 seconds.
- **Roadmap visibility**: public GitHub Project board.
- **Branding honesty**: not affiliated with Anthropic, not affiliated with Superpowers. Trademarks acknowledged in README.

---

## Appendix A — Plugin `hooks.json` (illustrative)

```json
{
  "description": "Throughline — workflow visualizer for Superpowers and beyond",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/bin/cc-daemon-launcher bootstrap",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/UserPromptSubmit",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/PreToolUse",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/PostToolUse",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/PostToolUseFailure",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/SubagentStart",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/SubagentStop",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/Stop",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "InstructionsLoaded": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/InstructionsLoaded",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "matcher": "docs/superpowers/specs/*|docs/superpowers/plans/*|docs/superpowers/stories/*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47821/hooks/FileChanged",
            "timeout": 5,
            "headers": { "Authorization": "Bearer $CLAUDE_CONTROL_TOKEN" },
            "allowedEnvVars": ["CLAUDE_CONTROL_TOKEN"],
            "async": true
          }
        ]
      }
    ]
  }
}
```

Note: every HTTP hook is `async: true`. We never need a synchronous response because we never make decisions. This minimizes latency impact on Claude Code.

---

## Appendix B — Sample story file template

```markdown
---
id: US-{{date}}-{{slug}}
title: { { title } }
size: # S | M | L (fill in after rough scoping)
status: backlog # backlog | in-progress | done
created: { { date } }
linked_spec: # path to docs/superpowers/specs/... once created
linked_plan: # path to docs/superpowers/plans/... once created
---

## Story

As a [...], I want [...], so that [...].

## Acceptance criteria

- [ ] ...
- [ ] ...

## Notes

(Out-of-scope items, related links, prior context, etc.)
```

---

## Appendix C — Sample SessionStart `additionalContext`

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Throughline is observing this session.\nDashboard: http://127.0.0.1:47821 (run `/throughline:open` for token-included URL)\nActive story: US-2026-05-04-oauth-login (size M)\nLinked plan: docs/superpowers/plans/2026-05-04-oauth.md (4/12 tasks done)\n\nThis plugin only observes — it never blocks tool calls or modifies your work."
  }
}
```

The "only observes" line is intentional. Claude reads context, and if Claude knows the plugin can't block tool calls, it won't pre-emptively work around imagined restrictions. Honesty in context.

---

_End of PRD._
