---
name: spec-viewer
description: Design contract for building or modifying the DocsPage in claude-control dashboard
---

# spec-viewer: DocsPage Design Contract

Use this skill when building or modifying `packages/web/src/pages/DocsPage.tsx` or any component it renders. This is a visual contract — it describes the CSS structure that must be used, not implementation steps.

> **See also:** `superpowers:frontend-design` for full aesthetic principles.

## 1. Design Tokens

All colours must use CSS variables. No inline hex. No Tailwind colour utilities inside DocsPage components.

| Variable | Semantic intent |
|----------|----------------|
| `--green` | Primary accent — Spec tab, active states, linked spec |
| `--green-border` | Green accent border (rgba, subtle) |
| `--green-glow` | Green accent background fill (very subtle) |
| `--blue` | Secondary accent — Plan tab, done-status |
| `--blue-border` | Blue accent border (rgba, subtle) |
| `--blue-glow` | Blue accent background fill |
| `--bg-elevated` | Card and panel surfaces |
| `--bg` | Page background, tab content area, code blocks |
| `--text-primary` | Headings, active labels |
| `--text-secondary` | Body text, markdown prose |
| `--text-muted` | Placeholders, empty states, metadata |
| `--border-faint` | Tab underline, section dividers |
| `--border` | Card edges, code block borders |
| `--border-strong` | Unchecked checkbox border |

## 2. Tab Component Pattern

```html
<div class="issue-tabs">
  <button class="tab active">Spec</button>   <!-- active: border-bottom: var(--green) -->
  <button class="tab">Plan</button>
</div>
```

- `.issue-tabs`: flex row, `border-bottom: 1px solid var(--border-faint)`
- `.tab`: `padding: 8px 12px`, `color: var(--text-muted)`, `border-bottom: 2px solid transparent`
- `.tab.active`: `color: var(--text-primary)`, `border-bottom-color: var(--green)`
- Tab icons are 14×14 SVG strokes, same stroke as the facet nav icons

## 3. Markdown Rendering Contract (`.markdown`)

The `.markdown` wrapper is required for all spec content rendered via `ReactMarkdown`.

| Element | Style |
|---------|-------|
| `h1` | 22px, weight 500, `--text-primary` |
| `h2` | 17px, weight 500, `border-top: 1px solid var(--border-faint)` (except first) |
| `h3` | 14px, weight 500, `--text-primary` |
| `code` (inline) | Source Code Pro, 12.5px, `color: var(--green)`, border `var(--border)` |
| `pre` | `background: var(--bg)`, `border: 1px solid var(--border)` |
| `blockquote` | `border-left: 2px solid var(--green-border)`, `background: var(--green-glow)` |
| `input[type="checkbox"]` (task lists) | `pointer-events: none`, unchecked: `border: var(--border-strong)`, checked: `border: var(--green)`, `background: var(--green-glow)` |

## 4. Right Sidebar Pattern

```html
<div class="issue-side">
  <div class="field-group">
    <div class="field-group-title">Documents</div>
    <div class="linked-card" style="border-color: var(--green-border)">  <!-- spec, active -->
      ...
    </div>
    <div class="linked-card">  <!-- plan, inactive -->
      ...
    </div>
  </div>
</div>
```

- `.field-group-title`: Source Code Pro, 10px, uppercase, letter-spacing 1.2px, `--text-muted`
- `.linked-card`: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`
- Active linked-card: accent border only — **no background fill change**
  - Spec active: `border-color: var(--green-border)`
  - Plan active: `border-color: var(--blue-border)`
- Clicking a linked-card navigates to the corresponding tab URL

## 5. Aesthetic Principles

- **Fonts:** Geist for prose, Source Code Pro for all labels/metadata/filenames/keys
- **Defaults are subdued:** muted text, faint borders, elevated-but-dark backgrounds
- **Accents are earned:** green for spec/active, blue for plan/done — applied sparingly
- **No purple gradients, no flat white backgrounds, no Inter/Roboto**
- All interactive elements use `transition: all 120ms ease`
