# Spec/Plan Viewer Design

**Date:** 2026-06-04
**Story:** US-2026-06-02-plugin-parse-superpowers-spec-plan-files
**Status:** approved

## Overview

Replace the separate SpecPage and PlanPage in the Dashboard with a single combined `DocsPage` that shows both documents in a tabbed view. Ship a companion `spec-viewer` agent skill in the plugin that documents the design contract for this page, so agents building or modifying it produce consistent output.

## Architecture

### New files

| File | Purpose |
|------|---------|
| `packages/web/src/pages/DocsPage.tsx` | Combined Spec + Plan tabbed page |
| `plugin/skills/spec-viewer/SKILL.md` | Agent skill: design contract for the DocsPage |

### Deleted files

| File | Reason |
|------|--------|
| `packages/web/src/pages/SpecPage.tsx` | Replaced by DocsPage Spec tab |
| `packages/web/src/pages/PlanPage.tsx` | Replaced by DocsPage Plan tab |

### Modified files

| File | Change |
|------|--------|
| `packages/web/src/App.tsx` | Routing: add `/docs`, redirect `/`, `/plan`, `/spec` |
| `packages/web/src/components/layout/Sidebar.tsx` | Replace "Spec" + "Plan" facet buttons with single "Docs" |
| `packages/web/src/pages/StoryPage.tsx` | HierarchyStrip nodes and LinkedCard `to` props updated: `/spec` → `/docs?tab=spec`, `/` (plan) → `/docs` |

### Routing

| Old route | New behavior |
|-----------|-------------|
| `/` | Redirect to `/docs` |
| `/plan` | Redirect to `/docs` |
| `/spec` | Redirect to `/docs?tab=spec` |
| `/docs` | DocsPage (new) |

Tab state is driven by a `?tab=spec` / `?tab=plan` query param read via `useSearchParams()`. Default tab: `spec` if `linked_spec_path` is set, otherwise `plan`.

No new server endpoints are needed. Existing `/api/specs/:path` and `/api/plans/:path` are sufficient.

## DocsPage Component

### Layout

The page follows the existing issue-layout pattern:

```
HierarchyStrip:  Story → Docs (active)
Tabs:            [Spec]  [Plan]
────────────────────────────────────────────────
issue-main                    | issue-side
  Spec tab: .markdown render  |   Parent Story card
  Plan tab: task cards        |   Documents field-group
                              |     spec linked-card (green when active tab)
                              |     plan linked-card (blue when active tab)
```

### Spec tab

Renders `linked_spec_path` content via `ReactMarkdown` with `rehype-highlight`, wrapped in `.markdown`. Behaviour is identical to the current SpecPage. Shows a placeholder when no spec is linked.

### Plan tab

Renders the parsed plan from `linked_plan_path` as task cards (identical to current PlanPage). The right sidebar shows a progress summary (N/total tasks) with a progress bar. Shows a placeholder when no plan is linked.

### Right sidebar — Documents field group

Both doc links are always visible regardless of active tab. The active tab's linked-card uses the accent border (`--green-border` for Spec, `--blue-border` for Plan). Clicking a card switches to that tab.

### Sidebar (Sidebar.tsx)

The `["story", "spec", "plan"]` facet array becomes `["story", "docs"]`. The "docs" facet:
- Navigates to `/docs`
- `facet-check.has` is green if either `linked_spec_path` or `linked_plan_path` is non-null
- Active when `currentPath === '/docs'`

## Agent Skill: `spec-viewer`

**Location:** `plugin/skills/spec-viewer/SKILL.md`

### Purpose

A design-system reference for agents building or modifying the DocsPage. Not an implementation guide — it describes the visual contract so generated markup stays consistent with the existing CSS.

### Skill content sections

**1. Design tokens**
Maps CSS variables to semantic intent:
- `--green` / `--green-border` / `--green-glow` — primary accent (Spec, active states)
- `--blue` / `--blue-border` / `--blue-glow` — secondary accent (Plan)
- `--bg-elevated` — card and panel surfaces
- `--bg` — page background, tab content area
- `--text-primary` / `--text-secondary` / `--text-muted` — text hierarchy
- `--border-faint` / `--border` — separators and card edges

**2. Tab component pattern**
The `.issue-tabs` / `.tab` / `.tab.active` HTML structure and the green underline convention (`border-bottom-color: var(--green)`).

**3. Markdown rendering contract**
The `.markdown` class hierarchy — h1/h2/h3 sizing, inline `code` green treatment, `pre` block styling, `blockquote` left-border. Checkbox list items (`- [ ]` / `- [x]`) require a small CSS addition to `.markdown ul li input[type="checkbox"]` — the skill documents the expected visual treatment (pointer-events none, muted border unchecked / green checked).

**4. Right sidebar pattern**
`.field-group` → `.field-group-title` → `.linked-card` structure. Active document indicated by accent border, not background fill.

**5. Aesthetic principles**
Explicitly references the `frontend-design` skill: use CSS variables for all colours (no inline hex), monospace font (`Source Code Pro`) for labels and metadata, Geist for body text, subdued defaults with green/blue accents reserved for active/linked states. No generic AI defaults (no purple gradients, no Inter/Roboto, no flat white backgrounds).

## Error and empty states

| Condition | Behaviour |
|-----------|-----------|
| No active story | Full-page message: "No active story. Start one with `/claude-control:start`." |
| Active story, no spec linked | Spec tab placeholder: "No spec linked. Link one with `/claude-control:spec`." |
| Active story, no plan linked | Plan tab placeholder: "No plan linked. Link one with `/claude-control:plan`." |
| Both unlinked | Default tab is Spec; both placeholders shown on respective tabs |

## Testing

- Existing SpecPage and PlanPage tests (`__tests__/`) are deleted alongside their source files.
- New `__tests__/DocsPage.test.tsx` covers: tab switching, correct content rendered per tab, empty states, `?tab=` query param respected on mount.
- Sidebar test (`__tests__/Sidebar.test.tsx`) updated: remove assertions on "Spec"/"Plan" facets, add assertion for single "Docs" facet.
- No new server tests needed (no new server code).
