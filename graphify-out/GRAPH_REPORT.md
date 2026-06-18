# Graph Report - .  (2026-06-16)

## Corpus Check
- 140 files · ~112,149 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 457 nodes · 748 edges · 31 communities (18 shown, 13 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Project Architecture & Concepts|Project Architecture & Concepts]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_React Dashboard & Client|React Dashboard & Client]]
- [[_COMMUNITY_Hook Pipeline & Lifecycle|Hook Pipeline & Lifecycle]]
- [[_COMMUNITY_Superpowers Watcher & Diff|Superpowers Watcher & Diff]]
- [[_COMMUNITY_Shared Types & Phase Inference|Shared Types & Phase Inference]]
- [[_COMMUNITY_REST Endpoints & Plugin Commands|REST Endpoints & Plugin Commands]]
- [[_COMMUNITY_API Module Implementations|API Module Implementations]]
- [[_COMMUNITY_Web Pages & Component Tests|Web Pages & Component Tests]]
- [[_COMMUNITY_Shared API Types & Diff Logic|Shared API Types & Diff Logic]]
- [[_COMMUNITY_Kanban Board Components|Kanban Board Components]]
- [[_COMMUNITY_Dashboard Design & Plans|Dashboard Design & Plans]]
- [[_COMMUNITY_WebSocket Server|WebSocket Server]]
- [[_COMMUNITY_Security & Auth|Security & Auth]]
- [[_COMMUNITY_Design System|Design System]]
- [[_COMMUNITY_Version Sync Scripts|Version Sync Scripts]]
- [[_COMMUNITY_Story Status & Start Branching|Story Status & Start Branching]]
- [[_COMMUNITY_Changelog Extraction|Changelog Extraction]]
- [[_COMMUNITY_Auth Functions|Auth Functions]]
- [[_COMMUNITY_Engineering Constitution|Engineering Constitution]]
- [[_COMMUNITY_Runtime JSON Type|Runtime JSON Type]]
- [[_COMMUNITY_Security Module|Security Module]]
- [[_COMMUNITY_Story Template Module|Story Template Module]]
- [[_COMMUNITY_StatusPill Component|StatusPill Component]]
- [[_COMMUNITY_TypeIcon Component|TypeIcon Component]]
- [[_COMMUNITY_StatsGrid Component|StatsGrid Component]]

## God Nodes (most connected - your core abstractions)
1. `StoryService — story CRUD, file watcher, SQLite cache` - 21 edges
2. `SuperpowersWatcher` - 19 edges
3. `StoryService` - 18 edges
4. `runMigrations()` - 15 edges
5. `WsServer` - 12 edges
6. `PRD — Claude Control Plugin` - 12 edges
7. `SuperpowersWatcher — file watcher + plan parser + checkbox diff` - 11 edges
8. `API Client (api.ts)` - 11 edges
9. `startDaemon()` - 10 edges
10. `HandoffService` - 9 edges

## Surprising Connections (you probably didn't know these)
- `StandupService.generate()` --shares_data_with--> `StoryService — story CRUD, file watcher, SQLite cache`  [INFERRED]
  packages/server/src/standup/index.ts → docs/superpowers/specs/2026-05-13-superpowers-integration-stories-design.md
- `HandoffService.generate()` --shares_data_with--> `StoryService — story CRUD, file watcher, SQLite cache`  [INFERRED]
  packages/server/src/handoff/index.ts → docs/superpowers/specs/2026-05-13-superpowers-integration-stories-design.md
- `stories/service.test.ts` --references--> `StoryService — story CRUD, file watcher, SQLite cache`  [EXTRACTED]
  packages/server/src/stories/__tests__/service.test.ts → docs/superpowers/specs/2026-05-13-superpowers-integration-stories-design.md
- `SuperpowersWatcher.maybeAutoLink() (private)` --shares_data_with--> `StoryService — story CRUD, file watcher, SQLite cache`  [INFERRED]
  packages/server/src/superpowers/index.ts → docs/superpowers/specs/2026-05-13-superpowers-integration-stories-design.md
- `Test: syncVersion script` --conceptually_related_to--> `Story: Implement versioning and release mechanism`  [INFERRED]
  packages/server/__tests__/sync-version.test.ts → docs/superpowers/stories/US-2026-06-01-implement-versioning-and-release-mechani.md

## Communities (31 total, 13 thin omitted)

### Community 0 - "Project Architecture & Concepts"
Cohesion: 0.05
Nodes (51): Agile Layer — User Stories, Standup, Handoff, Bun Workspace (monorepo host), @cc/server — Bun HTTP daemon package, @cc/shared — Shared TypeScript types, @cc/web — React dashboard package, CHANGELOG — Initial Release v1.0.0, CLAUDE.md — Claude Control Project Guide, Claude Control Daemon (Bun, 127.0.0.1) (+43 more)

### Community 1 - "API Route Handlers"
Cohesion: 0.08
Nodes (16): mountHandoffRoutes(), mountApiRoutes(), mountSessionRoutes(), mountStandupRoutes(), mountStoryRoutes(), mountSuperpowersRoutes(), validatePath(), HandoffService (+8 more)

### Community 2 - "React Dashboard & Client"
Cohesion: 0.06
Nodes (11): useWebSocket(), apiFetch(), base(), formatDigest(), handleCopy(), HierarchyStrip(), SizePill(), StatusPill() (+3 more)

### Community 3 - "Hook Pipeline & Lifecycle"
Cohesion: 0.12
Nodes (14): dispatchEvent(), handleHookEvent(), registerShutdownHandler(), startIdleTimer(), writeRuntimeJson(), createBus(), startDaemon(), createServer() (+6 more)

### Community 4 - "Superpowers Watcher & Diff"
Cohesion: 0.06
Nodes (34): api/superpowers.ts, CheckboxDiff interface, diffCheckboxState(), dispatchEvent(), endSession(), handleHookEvent(), HandoffService.extractPlanSummary() (private), HandoffService.generate() (+26 more)

### Community 5 - "Shared Types & Phase Inference"
Cohesion: 0.09
Nodes (36): advancePhase() function, HookEventSchema — zod discriminated union, inferPhase() function, parseFrontmatter() function, parsePlan() function, parseSpec() function, ParsedPlan / PlanTask / PlanStep types, Phase — brainstorm | spec | plan | implement (+28 more)

### Community 6 - "REST Endpoints & Plugin Commands"
Cohesion: 0.09
Nodes (31): API /api/handoff endpoint, API /api/plans endpoint, API /api/specs endpoint, API /api/standup endpoint, API /api/stories endpoint, Command: handoff, Command: open, Command: plan (+23 more)

### Community 7 - "API Module Implementations"
Cohesion: 0.1
Nodes (28): API: Handoff routes, API Router (mountApiRoutes), API: Session routes, API: Standup routes, API: Story routes (CRUD), ApiCtx — shared service context passed to route handlers, BusEvent union type (hook, plan.changed, story.changed, etc.), isValidStoryId() — dual-format story ID validator (+20 more)

### Community 8 - "Web Pages & Component Tests"
Cohesion: 0.13
Nodes (26): api, DocsPage, DocsPage.test, FilterBar, FilterBar.test, HierarchyStrip, KanbanColumn, KanbanColumn.test (+18 more)

### Community 9 - "Shared API Types & Diff Logic"
Cohesion: 0.12
Nodes (3): parsePlan(), diffCheckboxState(), SuperpowersWatcher

### Community 11 - "Dashboard Design & Plans"
Cohesion: 0.31
Nodes (10): Dashboard Five Views (Plan, Spec, Story, Stories Board, Standup), claude-control-dashboard-hierarchy.html — Visual Reference, DocsPage — Combined Spec + Plan Tabbed View, claude-control-handoff.md — Dashboard Design Handoff, Phase 3 Plan — Dashboard + Standup + Handoff, Plan — Spec/Plan Viewer Docs Page, Spec — Phase 3 Dashboard Design, Spec — Spec/Plan Viewer Design (DocsPage) (+2 more)

### Community 14 - "Design System"
Cohesion: 0.38
Nodes (7): Border-Defined Depth System, Color Palette & Roles, Component Stylings, HSL-Based Color Token System, Layout Principles, Supabase-Inspired Design System, Typography Rules

### Community 16 - "Story Status & Start Branching"
Cohesion: 0.67
Nodes (4): Start command mode files (backlog.md, in-progress.md, done.md), Story status enum: backlog, in-progress, done, Start Command Status-Branching Design, Story: Filter stories by status on the board view

## Knowledge Gaps
- **63 isolated node(s):** `Typography Rules`, `Layout Principles`, `Bun Workspace (monorepo host)`, `@cc/web — React dashboard package`, `@cc/shared — Shared TypeScript types` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StoryService — story CRUD, file watcher, SQLite cache` connect `Project Architecture & Concepts` to `Superpowers Watcher & Diff`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `SuperpowersWatcher` connect `Shared API Types & Diff Logic` to `API Route Handlers`, `Hook Pipeline & Lifecycle`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `StoryService` connect `API Route Handlers` to `Hook Pipeline & Lifecycle`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `StoryService — story CRUD, file watcher, SQLite cache` (e.g. with `Spec — Filter Stories by Status Design` and `CHANGELOG — Initial Release v1.0.0`) actually correct?**
  _`StoryService — story CRUD, file watcher, SQLite cache` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Typography Rules`, `Layout Principles`, `Bun Workspace (monorepo host)` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Architecture & Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._