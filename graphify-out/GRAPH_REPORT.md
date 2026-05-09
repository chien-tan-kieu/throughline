# Graph Report - .  (2026-05-06)

## Corpus Check
- Corpus is ~12,789 words - fits in a single context window. You may not need a graph.

## Summary
- 39 nodes · 54 edges · 7 communities
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Design System & Visual Language|Design System & Visual Language]]
- [[_COMMUNITY_Foundation Spec & Daemon Architecture|Foundation Spec & Daemon Architecture]]
- [[_COMMUNITY_Hook Events & Workflow Visualization|Hook Events & Workflow Visualization]]
- [[_COMMUNITY_Agile Layer & Superpowers Integration|Agile Layer & Superpowers Integration]]
- [[_COMMUNITY_Claude Control PRD Core|Claude Control PRD Core]]
- [[_COMMUNITY_Plugin Scaffold & Shell Scripts|Plugin Scaffold & Shell Scripts]]
- [[_COMMUNITY_Dashboard & API Contracts|Dashboard & API Contracts]]

## God Nodes (most connected - your core abstractions)
1. `Claude Control PRD` - 12 edges
2. `Supabase-Inspired Design System` - 7 edges
3. `Claude Control Foundation Design Spec (Weeks 1-2)` - 7 edges
4. `Daemon Design (Foundation)` - 5 edges
5. `Plugin Scaffold (hooks.json, shell scripts)` - 5 edges
6. `Agile Layer Surface` - 4 edges
7. `Observer-Only Design Principle` - 4 edges
8. `Claude Control Daemon (Bun)` - 4 edges
9. `Dashboard SPA (React)` - 4 edges
10. `Hooks API Corrections (Live Docs Audit)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Dashboard SPA (React)` --conceptually_related_to--> `Supabase-Inspired Design System`  [INFERRED]
  docs/features/claude-control-plugin/PRD.md → DESIGN.md
- `Claude Control Daemon (Bun)` --semantically_similar_to--> `Daemon Design (Foundation)`  [INFERRED] [semantically similar]
  docs/features/claude-control-plugin/PRD.md → docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md
- `Plugin Package Structure` --semantically_similar_to--> `Plugin Scaffold (hooks.json, shell scripts)`  [INFERRED] [semantically similar]
  docs/features/claude-control-plugin/PRD.md → docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md
- `SQLite Data Model` --semantically_similar_to--> `SQLite Schema (001_initial.sql)`  [INFERRED] [semantically similar]
  docs/features/claude-control-plugin/PRD.md → docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md
- `Claude Control Foundation Design Spec (Weeks 1-2)` --references--> `Claude Control PRD`  [EXTRACTED]
  docs/superpowers/specs/2026-05-06-claude-control-foundation-design.md → docs/features/claude-control-plugin/PRD.md

## Hyperedges (group relationships)
- **Claude Control Observer Stack: Hooks, Daemon, Dashboard** — prd_hook_events, prd_daemon, prd_dashboard_spa, prd_observer_only_design [EXTRACTED 1.00]
- **Superpowers Integration: Stories, Artifacts, Phase Inference** — prd_user_stories, prd_superpowers_artifacts, prd_phase_inference, prd_superpowers_plugin [EXTRACTED 1.00]
- **Foundation Spec: Zod Schemas, Daemon, Plugin Scaffold, SQLite** — spec_shared_package, spec_daemon_design, spec_plugin_scaffold, spec_sqlite_schema [EXTRACTED 1.00]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Design System & Visual Language"
Cohesion: 0.38
Nodes (7): Border-Defined Depth System, Color Palette & Roles, Component Stylings, HSL-Based Color Token System, Layout Principles, Supabase-Inspired Design System, Typography Rules

### Community 1 - "Foundation Spec & Daemon Architecture"
Cohesion: 0.43
Nodes (7): Observer-Only Design Principle, CLAUDE_PLUGIN_DATA Runtime Data Storage, Daemon Design (Foundation), Claude Control Foundation Design Spec (Weeks 1-2), Shared Package - Zod Schemas, SQLite Schema (001_initial.sql), Testing Strategy (Observer Contract + Integration)

### Community 2 - "Hook Events & Workflow Visualization"
Cohesion: 0.33
Nodes (6): Hook Events (Observer), Phase Inference, Superpowers Artifacts Parsing, Workflow Visualizer Surface, Command Hooks Over HTTP Hooks Rationale, Hooks API Corrections (Live Docs Audit)

### Community 3 - "Agile Layer & Superpowers Integration"
Cohesion: 0.4
Nodes (6): Agile Layer Surface, Handoff Notes Generator, Slash Commands, Standup View, Superpowers Plugin (obra/superpowers), User Stories (S/M/L Sizing)

### Community 4 - "Claude Control PRD Core"
Cohesion: 0.4
Nodes (6): Claude Control PRD, Claude Control Daemon (Bun), SQLite Data Model, Monorepo Layout, Security Model, Tech Stack

### Community 5 - "Plugin Scaffold & Shell Scripts"
Cohesion: 0.5
Nodes (4): Plugin Package Structure, bootstrap.sh Daemon Bootstrap Script, forward.sh Hook Forwarder Script, Plugin Scaffold (hooks.json, shell scripts)

### Community 6 - "Dashboard & API Contracts"
Cohesion: 0.67
Nodes (3): Dashboard SPA (React), REST API Contract, WebSocket API Contract

## Knowledge Gaps
- **13 isolated node(s):** `Typography Rules`, `Layout Principles`, `Phase Inference`, `Standup View`, `Handoff Notes Generator` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Claude Control PRD` connect `Claude Control PRD Core` to `Foundation Spec & Daemon Architecture`, `Hook Events & Workflow Visualization`, `Agile Layer & Superpowers Integration`, `Plugin Scaffold & Shell Scripts`, `Dashboard & API Contracts`?**
  _High betweenness centrality (0.743) - this node is a cross-community bridge._
- **Why does `Dashboard SPA (React)` connect `Dashboard & API Contracts` to `Design System & Visual Language`, `Claude Control PRD Core`?**
  _High betweenness centrality (0.393) - this node is a cross-community bridge._
- **Why does `Supabase-Inspired Design System` connect `Design System & Visual Language` to `Dashboard & API Contracts`?**
  _High betweenness centrality (0.292) - this node is a cross-community bridge._
- **What connects `Typography Rules`, `Layout Principles`, `Phase Inference` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._