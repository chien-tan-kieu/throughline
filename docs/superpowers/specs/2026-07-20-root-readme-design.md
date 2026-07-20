# Design — Root `README.md`

> Status: Approved (brainstorm)
> Date: 2026-07-20
> Scope: A single artifact — the repository's root `README.md`.

## 1. Goal

Create the repository's front-door `README.md`. There is currently no root
README (only a dev-focused `plugin/README.md`). This document serves two
audiences in one layered page: **adopters** (marketing pitch, quick start,
command reference) up top, and **contributors** (architecture, dev workflow)
in a collapsible section below.

## 2. Decisions (locked during brainstorm)

- **Audience:** Both, layered — adopter pitch first, `Development` section after.
- **Visuals:** Captured **live** from the running dashboard via Chrome
  automation, against the existing `.throughline/throughline.db`
  (396 events, 5 stories — a populated board, not empty state). Static
  screenshots for now; no GIF this pass.
- **Styling:** Rich / polished — centered HTML header block, badge row,
  table of contents, emoji section markers, Mermaid diagrams, collapsible
  `<details>` sections.
- **Boundaries:** Root README links to `plugin/README.md` for deep
  install/verify/build detail rather than duplicating it. Deep-dev material
  (`DESIGN.md`, `CLAUDE.md`, release workflow) is linked, not inlined.

## 3. Positioning

Tagline: *"See your Claude Code + Superpowers workflow — brainstorm → spec →
plan → implement — flow across a live Kanban board. Observer-only,
local-first, zero-config."*

Selling points derive from the three PRD gaps, reframed as benefits:

1. **Plan progress vs. reality** — watch a plan's checkboxes tick off in real
   time, tied to the tool calls that produced them.
2. **Subagent visibility** — see the otherwise-invisible subagent tree and
   activity that Superpowers dispatches.
3. **Resumable solo flow** — stories with S/M/L sizing, `standup`, and
   `handoff` keep continuous solo-with-AI work resumable across sessions.

Trust framing throughout: **observer-only** — never blocks tool calls, never
modifies responses; **local-first** — all data in `~/.throughline`.

## 4. Structure

1. Centered HTML header — title, tagline, badge row (version 3.0.2, MIT,
   Bun, Claude Code plugin, observer-only), quick-nav links.
2. Hero screenshot — live Kanban board.
3. Table of contents.
4. Why Throughline / selling points (§3 as emoji bullets).
5. How it works — Mermaid diagram: hooks → daemon (`bun:sqlite`) →
   WebSocket → dashboard; observer-only guarantee called out.
6. The lifecycle — Mermaid flowchart brainstorm → spec → plan → implement,
   mapped to board columns / story states.
7. Screenshot gallery — story detail, standup/plan progress (2–3 shots).
8. Quick start — marketplace install (`dist` branch JSON), then
   `/throughline:open`.
9. Command reference — table of all 9 slash commands (`open`, `status`,
   `standup`, `resume`, `plan`, `story`, `spec`, `start`, `handoff`) with
   one-line descriptions and usage.
10. Configuration — `~/.throughline` data dir, `CLAUDE_PLUGIN_DATA`
    override, port range 47821–47830.
11. Development (collapsible) — monorepo layout, Bun workflow, test
    commands; links to `plugin/README.md`, `DESIGN.md`, `CLAUDE.md`, release
    workflow.
12. FAQ (collapsible) — needs Superpowers?, performance impact?, data
    location?.
13. License / footer (MIT).

## 5. Media plan

- Start the web dashboard against the existing `.throughline` data.
- Capture via Chrome into `docs/media/`: `board.png`, `story.png`,
  `standup.png`.
- Embed with repo-relative paths.
- If live capture is blocked (daemon won't start, browser unavailable), fall
  back to clearly-marked image placeholders at the same paths so the README
  still ships.

## 6. Out of scope

- Comparison-to-alternatives table, roadmap section, animated GIF.
- Changes to `plugin/README.md` or other docs.
