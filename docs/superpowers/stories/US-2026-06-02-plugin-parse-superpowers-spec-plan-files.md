---
id: US-2026-06-02-plugin-parse-superpowers-spec-plan-files
title: "Plugin: parse superpowers spec/plan files into visual HTML for Dashboard"
status: done
size: 
created: 2026-06-02

linked_spec: /Users/chien.tankieu/Development/claude-control/docs/superpowers/specs/2026-06-04-spec-plan-viewer-design.md
linked_plan: /Users/chien.tankieu/Development/claude-control/docs/superpowers/plans/2026-06-04-spec-plan-viewer-docs-page.md
---

## Story

As a **developer using Claude Control**, I want to view my superpowers spec and plan files rendered as a visual HTML page in the Dashboard, so that I can quickly understand the structure and progress of my implementation plans without reading raw markdown files.

## Acceptance criteria

- [ ] Plugin can discover spec files under `docs/superpowers/specs/` and plan files under `docs/superpowers/plans/`
- [ ] A new Dashboard route (e.g. `/specs`) lists all discovered spec and plan files by name
- [ ] Clicking a spec or plan entry renders its markdown content as styled HTML in the Dashboard
- [ ] When a story has a linked spec and/or plan (`linked_spec_path`, `linked_plan_path`), the story detail view shows a "View Spec" / "View Plan" button that navigates to the rendered HTML
- [ ] Rendered HTML correctly handles markdown elements: headings, ordered/unordered lists, checkboxes (`- [ ]` / `- [x]`), code blocks, and inline code
- [ ] Spec and plan content for the same story can be viewed side-by-side or via tabs in a combined view
- [ ] The rendered view is read-only — no editing from the Dashboard
- [ ] An agent skill (`plugin/skills/spec-viewer` or similar) ships as a plugin artifact that encapsulates the HTML template and CSS styles, so the renderer is versioned and distributed with the plugin release; the skill's visual design instructions must reuse the `frontend-design` skill's styling system (typography, spacing, color tokens, component patterns) rather than defining a standalone style

## Notes

- `linked_spec_path` and `linked_plan_path` are already present on the story schema; the plugin just needs to surface them as navigable links.
- A lightweight markdown-to-HTML transform (e.g. `marked` or a bun-compatible equivalent) is preferred over shipping a full renderer — keep the bundle small.
- Checkbox state in plan files is purely visual; toggling from the Dashboard is out of scope for this story.
- The `spec-viewer` skill should import or extend the `frontend-design` skill (e.g. via a `---\nextends: frontend-design\n---` header or explicit `@import` of its style tokens) so the rendered HTML inherits the same design language as the rest of the Dashboard.
