# Claude Control Dashboard — Design Handoff

**Status:** Brainstorm output, ready for spec phase
**Scope:** UI layout and behavior only — no backend, no WebSocket implementation
**Companion files:**

- `claude-control-dashboard-hierarchy.html` — interactive visual reference (ground truth)
- `DESIGN.md` — Supabase-inspired theme tokens this UI inherits from

---

## 1. Purpose

Claude Control is a passive observer dashboard for a local AI coding session running the Superpowers workflow (brainstorm → spec → plan → implement). It's a single-user, single-machine app served at `localhost`, read-heavy, with real-time updates via WebSocket.

The dashboard visualizes the three Superpowers artifacts (Story, Spec, Plan) and their relationship, lets the user navigate between them as facets of the work being done, and surfaces an auto-generated standup digest.

This handoff is the design output of the brainstorm phase. Take it into the spec phase to produce the implementation spec.

---

## 2. Original Requirements (source of truth)

Copied verbatim from the product handoff so this document is self-contained:

> **Product context.** Claude Control is a passive observer dashboard for a local AI coding session. It visualizes the Superpowers workflow (brainstorm → spec → plan → implement). Single-user, single-machine, served at localhost. Dark UI preferred (developer tool).
>
> **Pages / views (Phase 3 scope):**
>
> - **Plan view** at `/` (default) — Primary view. Show the active plan's tasks and steps with live checkbox state. Active task highlighted.
> - **Spec view** at `/spec` or tab — Show the linked design doc markdown alongside the plan for context.
> - **Stories** at `/stories` or sidebar — List of user stories with status (backlog / in-progress / done) and size badge (S / M / L). Click a story to see its detail.
> - **Standup** at `/standup` — Auto-generated daily digest: what shipped yesterday, what's in progress, blockers. Copy-to-clipboard.
>
> **Data relationships:**
>
> - A story is linked to a spec and/or a plan (via frontmatter fields)
> - A plan has tasks → steps with checkbox state (todo / done)
> - The active story + active plan are inferred from the current session
> - Plan checkbox state updates in real time via WebSocket
>
> **Key interactions:**
>
> - Real-time: WebSocket pushes plan checkbox changes, story updates, and session state. UI must reflect changes without a page reload.
> - Plan task expand/collapse: click a task to see its steps
> - Story detail: click a story to read its narrative + acceptance criteria
> - Standup copy: one-click copy of the full standup digest markdown
>
> **Navigation structure:**
>
> - Global: current session identifier, inferred workflow phase, connection status (live / disconnected)
> - Stories and Plan/Spec should be accessible without deep navigation — they're co-primary
> - Standup is a secondary destination, not always in view
>
> **Data volume (representative):**
>
> - Stories: 1–20 visible at a time
> - Plan tasks: 5–20 per plan, each with 2–6 steps
> - Spec: a few hundred lines of markdown
>
> **Constraints:**
>
> - No mobile layout needed (desktop only)
> - No authentication UI — token is in the URL, dashboard just works
> - Read-heavy: only stories allow writes (status, size) — everything else is read-only display

---

## 3. Conceptual Model

The original requirements list Plan, Spec, and Stories as peer views. They aren't peers — they're a derivation chain:

```
Story (foundation: user need, narrative, acceptance criteria)
  ↓
Spec  (technical design doc derived from the Story)
  ↓
Plan  (execution: tasks → steps derived from the Spec)
```

This maps almost exactly to the Superpowers workflow phases:

- **Brainstorm** phase produces the **Story**
- **Spec** phase produces the **Spec**
- **Plan** phase produces the **Plan**
- **Implement** phase executes the Plan's checkboxes

The dashboard treats **Story / Spec / Plan as three facets of the same story**, not three separate top-level views. The active story is the context; navigating to Spec or Plan is drilling into a facet of that story. This is the key UX shift from the literal reading of the requirements.

Two consequences of this model:

1. The **Story view** (narrative + acceptance criteria) becomes a first-class view, not just a click-target from the Stories board. It's the foundation, and you should be able to land directly on it.
2. The sidebar nav reflects this hierarchy: the active story sits at the top of the sidebar as a context card containing the three facets, while the Stories board (zoom-out) and Standup (reports) sit below as project-level destinations.

The literal requirement _"`/` defaults to Plan"_ still holds — the default landing is the active story's Plan facet. Conceptually you're "inside Story #047 → Plan tab".

---

## 4. Information Architecture

### Five views total

| View          | Route hint                    | Purpose                                  | Default? |
| ------------- | ----------------------------- | ---------------------------------------- | -------- |
| Story         | `/story` or active-story root | Narrative + AC for the active story      | —        |
| Spec          | `/spec`                       | Design doc markdown for the active story | —        |
| Plan          | `/plan`                       | Tasks/steps with live checkbox state     | ✓        |
| Stories Board | `/stories`                    | All stories grouped by status            | —        |
| Standup       | `/standup`                    | Auto-generated daily digest              | —        |

The first three (Story / Spec / Plan) are facets of the **active story**. They share the same issue header (story key, title, status pill, size pill). They differ only in main content and side panel context.

The last two (Stories Board, Standup) are project-level destinations. They don't share the issue header structure.

### Navigation surfaces (intentional redundancy)

The hierarchy is communicated in **four places** that all stay in sync. Multiple surfaces are intentional — they reinforce the model from different zoom levels. None should be considered optional during initial release; the spec can decide later whether to drop the hierarchy strip once users have internalized the model.

1. **Sidebar Active Story card** — the persistent context. Story key, status, title at top; Story/Spec/Plan facet links below.
2. **Breadcrumb** — `Stories / #047 / Plan` format on each facet view. Hierarchical slashes, not bullets.
3. **Hierarchy strip** — horizontal chain `Story → Spec → Plan` with arrows, shown below the page header on facet views. Current node highlighted, Plan node shows progress inline.
4. **In-content tabs** — `Story / Spec / Plan` at the top of the issue main area, ordered left-to-right matching the derivation chain.

---

## 5. Global Layout

The viewport is a 48px topbar over a two-column body: 252px sidebar + flexible main. Desktop only, optimized for ~1440px width but resilient down to ~1100px.

### Topbar (fixed, 48px tall)

Houses the three globals the requirements mandate plus identity:

- **Brand** — Claude Control logo (green gradient mark) + name
- **Project identifier** — `[BE]` icon + `billing-engine` (static label, no switcher dropdown; single-machine context)
- **Workflow phase track** (center) — four-segment pill showing `Brainstorm · Spec · Plan · Implement` with the current phase in green. Read-only indicator, not interactive.
- **Session ID** (right) — `SESSION sess_a4f2c1` in monospace
- **Connection status** (right) — `● Live` pill in green with a pulsing dot animation; switches to a muted/red state when WebSocket disconnects

Nothing else lives in the topbar. No user avatar, no notifications, no search, no Create button — none apply to a single-user passive observer.

### Sidebar (252px, fixed width)

Top to bottom:

1. **Active Story section** — section label, then a containing card with:
   - Green gradient strip across the top (2px) marking it as the focus context
   - Header row: story type icon + key (`#047`) + status pill (`IN PROGRESS`)
   - Title (2-line clamp)
   - Three facet nav items inside an inset sub-panel: Story, Spec, Plan (in derivation order). The active facet has the standard left-bar green indicator. Each facet has a presence indicator on the right showing whether that document exists for this story (checkmark) or is the active in-progress one (animated dot).

2. **Workspace section** — section label, then `All Stories` nav item with the count badge.

3. **Reports section** — section label, then `Standup` nav item.

No sidebar footer. The session info that lived there in earlier iterations has moved to the topbar, since it's a global.

### Main content area

Scrollable, holds the active view. Views use either an issue layout (Story/Spec/Plan — main content + 280px right rail) or a full-width layout (Stories Board, Standup).

---

## 6. View Specifications

### 6.1 Story view (foundation, derives nothing)

**Page header**

- Breadcrumb: `Stories / #047 / Story`
- Issue key row: story type icon + `#047`
- Title: `Migrate Stripe webhook handler to async queue` (26px, weight 400, letter-spacing -0.4px)
- Actions row: Status pill (editable on stories) + Size pill (editable on stories) — both writable per the constraints. No other action buttons (no Refresh, no Mark complete — read-only model).

**Hierarchy strip**

- `Story` (active, highlighted) → `Spec` → `Plan` (with `47%` progress meta)
- Each node clickable to jump to that facet

**Issue tabs** (in-content, redundant with sidebar facet nav)

- Story (active) / Spec / Plan with task count

**Main content** (left column, ~70%):

- **User Story** section in As/I Want/So That form, rendered as a callout block with left green border. The form labels (`AS`, `I WANT`, `SO THAT`) in green monospace uppercase, the form text in primary color.
- **Background** section: 2–3 paragraphs of context (why this matters, what incidents motivated it, who's affected).
- **Acceptance Criteria** section: checklist with `N / M verified` progress in the section header. Each AC item has a square checkbox indicator (filled green for done, outline for pending). Done items aren't struck through (they're claims, not tasks).

**Right rail** (280px):

- **Derived Documents** group: two linked-card components — one for Spec, one for Plan. The Plan card shows a progress bar inside.
- **Frontmatter** group: monospace pairs (`id: 047`, `spec: spec.md`, `plan: 004-async-webhook`, `status: in-progress`, `size: M`).

### 6.2 Spec view (derived from Story)

Same page header and hierarchy strip structure as Story view (the issue header is shared across all three facets — same story, different facet).

**Issue tabs**: Story / Spec (active) / Plan

**Main content**: rendered markdown of the design doc. Component anatomy in §7 covers the markdown styling. Code blocks use the same monospace + green keyword scheme as the rest of the app.

**Right rail**:

- **Parent** group: a linked-card pointing back to the Story.
- **Derived Plan** group: a linked-card to the Plan with progress.
- **Spec Metadata** group: monospace pairs (`status: approved`, `version: v3`, `author: @platform-team`).

### 6.3 Plan view (default landing, derived from Spec)

Same shared issue header.

**Issue tabs**: Story / Spec / Plan (active)

**Main content** — list of plan tasks. Each task is a card with:

- Header row: large checkbox (filled green for done, outlined with animated green square for active, empty for todo) + task type icon + key (`#047.2`) + title + progress (`2 / 4`) + chevron toggle
- Click anywhere on the header (except the checkbox) expands to show steps
- Steps inside the task: smaller checkboxes with the same three states (done = green fill, current = pulsing green square inside outline, todo = empty), label, and timestamp (or `in progress` / `queued` state text)
- The **active task** has a green-border tint and a subtle green gradient background so it's spottable from across the screen
- The **current step** has a pulsing animation so the eye locks onto where execution is right now

All checkboxes are **read-only** — they reflect filesystem state pushed via WebSocket. The UI never writes to them.

**Right rail**:

- **Parent Documents** group: linked-cards for the Story and Spec
- **Plan Progress** group: field rows for `Tasks: 1 of 5 done`, `Steps: 7 of 15 done`, `Plan started: 2h 14m ago`, `Last update: 4s ago` (the last one in green to signal liveness)

**Updated indicator**: an inline `● Updated 4s ago` element in the actions row of the page header, with the dot pulsing. Updates in real time as WebSocket messages arrive.

### 6.4 Stories Board view (zoom out)

**Page header**: simple — breadcrumb `Stories`, title `Stories`. No issue header (we're not inside a story).

**Body**: three-column Kanban layout — `Backlog`, `In Progress`, `Done`. Each column has:

- Header row: status dot (color-coded) + column name in monospace uppercase + count badge on the right
- Card list below

**Card anatomy** (compact, padding-tight):

- The **active session's card** has a small `● Active Session` label at the top with pulsing dot — distinguishes the actively-worked-on story from other in-progress stories
- Title (13px, primary color; muted gray for done stories)
- Bottom meta row:
  - Left: type icon + story key (`#047`)
  - Right: link indicators (small spec/plan icons showing which documents exist for that story — green when present, muted when absent), then size badge (S/M/L with color tier: S=neutral, M=amber, L=warm orange)

**Click behavior**:

- Active session's card → jumps to Plan view (because that's the default for the active story)
- Any other card → jumps to that story's Story view (foundation, since they don't have an active plan in this session)

No filter chips, no "Create issue" buttons, no group-by dropdown. Read-heavy, single-user — none of those affordances apply.

### 6.5 Standup view (auto-generated digest)

**Page header**: breadcrumb `Standup`, title `Standup digest`.

**Toolbar row**: date display (`DATE  Sunday · May 17 · 2026`) on the left, copy button on the right (pill button, primary white-on-dark, transitions to green-tinted "Copied" state for ~1.8s after click).

**Body** (max-width 1100px to keep readable):

**Stats grid** — three cards in a row:

- `Steps shipped: 7` (in green) with sub-line `across 2 stories`
- `Stories in flight: 2` with sub-line listing story keys
- `Blockers: 1` (in warning yellow) with sub-line context

**Sections** — three card-style containers in order:

1. `Shipped yesterday` (green dot marker)
2. `In progress` (green pulsing dot marker)
3. `Blockers` (yellow warning dot marker)

Each section card has:

- Header row: section title + count badge
- Body: list of rows, each with `[step key] [type icon] [text] [timestamp]` in a 4-column grid. Rows are separated by faint borders.

The text uses inline `<strong>` for emphasis and inline `<code>` for technical references (class names, ticket IDs, file paths) — same code style as the rest of the app (green text, bordered background).

The copy button outputs **the full digest as markdown** — not just the text on screen. Format conventions:

- `## Shipped Yesterday` / `## In Progress` / `## Blockers` headers
- Bullet lists with the step key + text
- Suitable for direct paste into Slack or a team channel

---

## 7. Component Library

### 7.1 Type icons

Three variants, all 16×16px rounded squares (3px radius) with a 1px border and tinted background:

- **Story** — green, contains a small bookmark/flag SVG. Used everywhere a story is referenced.
- **Task** — blue, contains a small checkmark SVG. Used for plan tasks and step references.
- **Warn/error** (rare, semantic) — yellow/warn tint, used for blocker indicators in Standup.

When used in a denser context (card meta, breadcrumb), the type icon scales down to 12×12 or 14×14 with the inner SVG scaling proportionally.

### 7.2 Status pill (editable on stories)

Three variants matching story status:

- **In Progress** — green text on green-glow background with green border. Has a small filled circle icon on the left.
- **Done** — secondary-text on input-dark background with strong border.
- **Backlog** — muted-text on transparent background with standard border.

Always renders with a small chevron-down on the right to signal "this is a select / editable". Per the constraints, only the status pill on stories is editable; on tasks/steps, status is read-only display (via checkbox state).

### 7.3 Size pill (editable on stories)

Same height as status pill. Contains a small letter badge on the left (S/M/L) with size-tier color (S=neutral, M=amber, L=warm orange) and the size name in secondary text on the right.

Color tiers serve as a visual size encoding even without reading the letter.

### 7.4 Issue layout

Used by Story / Spec / Plan views. Two-column CSS grid: `1fr 280px` with no gap. The left column has a right border (faint) creating the visual separation. The right rail is unscrolled (no sticky behavior needed at the data volumes in scope).

### 7.5 Task card / step row (Plan view core)

Anatomy as described in §6.3. Three states for every checkbox-shaped indicator:

- **Done** — filled green background, white checkmark
- **Current/active** — outlined green border with a pulsing green inner square (animation: 1.6s ease-in-out, opacity 1 ↔ 0.4)
- **Todo** — outlined gray border, no fill

The task card's "active" state adds a green-tinted gradient background (`linear-gradient(180deg, green-glow 0%, bg-elevated 60%)`) on top of the green-border treatment.

### 7.6 Hierarchy strip

Used at the top of Story / Spec / Plan views, below the page header. Sits inside a strip with `bg-elevated` background and a bottom border. Contains three nodes (`Story`, `Spec`, `Plan`) separated by right-arrow icons. The active node has:

- A bordered background using the green-border color
- Its icon colored green

The Plan node always shows a `47%` (or similar) progress meta inline.

### 7.7 Linked card

Used in side rails to point to related documents. A bordered card containing:

- Left icon (type icon or document icon)
- Center stack: filename (monospace, primary color) + sub-label (monospace, muted) + optional progress bar
- Right chevron arrow

Hover state: green border + bg-hover background + chevron turns green. Click navigates to the target view.

### 7.8 Stories board column / card

Column = bordered card with faint border, 8px radius, internal padding. Header has status dot + name + count badge.

Cards are tighter than the linked-cards — title-first, then a single meta row with type icon + key on the left and link indicators + size badge on the right. Active-session cards have a "● Active Session" label at the top.

### 7.9 Standup section card

Section title with leading dot marker. The dot color matches the section semantics (green for shipped/in progress, yellow for blockers). The in-progress section's dot pulses.

Rows inside sections use a 4-column grid: `[80px key] [16px type icon] [1fr text] [auto timestamp]`.

### 7.10 Buttons

Two button styles in scope:

- **Primary pill** (Copy button) — white-on-dark, pill-shape (9999px radius), 5px 14px padding. Hover transitions border to green. Transitions to green-tinted "Copied" state for confirmation.
- **Tertiary action** (status/size pills) — see §7.2 and §7.3.

No secondary or ghost button is currently used. If the spec adds editing UI (e.g., a story status menu), they should extend the status pill's click into a dropdown rather than introducing new button styles.

---

## 8. Design Tokens (summary)

Refer to `DESIGN.md` for the full Supabase-inspired token system. The dashboard uses these specific tokens:

### Colors

Backgrounds use the gray scale `#0f0f0f → #171717 → #1c1c1c → #1f1f1f → #212121` for deepening surface levels. Borders use `#242424` (faint) → `#2e2e2e` (standard) → `#363636` → `#393939` (strong). Text uses `#fafafa` (primary) → `#b4b4b4` (secondary) → `#898989` (muted) → `#4d4d4d` (disabled).

The green brand color appears at three opacities: `#3ecf8e` (solid for icons, dots, accents), `rgba(62, 207, 142, 0.3)` (border accent), `rgba(62, 207, 142, 0.08)` (background glow).

Semantic colors used sparingly: `hsl(45, 87%, 62%)` for warn/blocker, and the size badge colors (`size-s`, `size-m`, `size-l`) for the S/M/L visual tiering.

### Typography

- **Geist Sans** (close open-source proxy for Circular) for all body and UI text. Weight 400 default, 500 only for nav and buttons. No 700.
- **Source Code Pro** for monospace: code blocks, story keys, technical labels (always uppercase with 1.2px letter-spacing for the "developer console" labels).

Hero/issue titles at 26px / weight 400 / letter-spacing -0.4px / line-height 1.2 — keeping the design doc's "compressed, no waste" philosophy without going to the marketing-site 72px.

### Depth

No box shadows anywhere. Depth is communicated entirely through border color hierarchy (faint → standard → strong) and surface contrast. The green-border-on-glow treatment is the "elevated" state used for the active task, the active story card, and hover affordances.

---

## 9. States & Behaviors

### Real-time updates

The WebSocket pushes three kinds of messages (per requirements): plan checkbox changes, story updates, and session state. The UI must reflect these without a page reload.

Concrete behaviors:

- **Checkbox state change** — when a step transitions from todo → current → done, the checkbox should animate smoothly (the pulsing animation handles the "current" state inherently)
- **Active task change** — when execution moves to the next task, the "active" treatment migrates with it. Smooth transition (200ms ease) on the border color and background gradient.
- **Updated timestamp** — the `Updated 4s ago` indicator in the Plan view header should tick forward, and the pulsing dot animates continuously.
- **Connection drop** — the `● Live` topbar pill should switch to a "Disconnected" state in muted/red. Surface this prominently so the user knows the displayed state may be stale. Don't auto-reconnect silently without visual acknowledgment.

### Edit affordances

Per the read-heavy constraint, only **story status** and **story size** are writable. The status pill and size pill on the Story / Spec / Plan view headers should be clickable to open a small dropdown / menu for changing the value. Confirmation happens immediately (optimistic update), then reconciles with the backend.

Everything else — plan checkboxes, step states, task progress, all narrative content, all markdown — is read-only display.

### Navigation behaviors

- Sidebar facet nav, hierarchy strip nodes, in-content tabs, breadcrumb segments, linked-cards in side rails — **all of these navigate** between views and should keep state in sync (the active class on whichever surface communicates "you are here").
- Stories Board card clicks: active session's card → Plan view; other cards → Story view of that story (when implemented per-story; in the mock all non-active cards just go to the same Story view).
- Task header click toggles expand/collapse. The checkbox area itself doesn't toggle — that area is reserved for visual state.

### Edge cases

- **No active story** (start of session, between stories) — the Active Story sidebar card should show an empty/idle state with a message like "No active story yet" and the facet nav should be disabled. Plan view loads with an empty/placeholder state.
- **Story with no spec or no plan** — backlog stories that haven't been speced or planned. The facet links should indicate absence (e.g., grayed out or a "not yet" badge) and clicking should show a helpful empty state ("This story doesn't have a spec yet").
- **Disconnected** — see above.
- **Long lists** — 20 stories max per requirement, but the board should still scroll within columns rather than expanding indefinitely. Plan tasks similarly.

---

## 10. Data Model Mapping

Per the requirements, the data model is:

- **Story** — narrative + acceptance criteria, with frontmatter: `id`, `status` (backlog/in-progress/done), `size` (S/M/L), `spec` (link), `plan` (link)
- **Spec** — markdown design doc, with frontmatter: `status`, `version`, `author`, links back to story
- **Plan** — has tasks; each task has steps; each step has checkbox state (todo/done) and the "current" state is inferred from filesystem activity (the step currently being worked on)

UI fields and where they come from:

| UI element                            | Source                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Active story key, title, status, size | Active story's frontmatter                                                 |
| Story narrative + AC                  | Active story's markdown body                                               |
| Spec markdown                         | Linked spec file                                                           |
| Plan tasks + steps                    | Linked plan file's structure                                               |
| Step done/todo state                  | Plan file's checkbox marks (real-time via WebSocket)                       |
| Current step indicator                | Inferred from session activity (which step Claude is currently working on) |
| Updated timestamp                     | Filesystem mtime or WebSocket message timestamp                            |
| Workflow phase                        | Inferred from session state                                                |
| Session ID                            | Generated when the dashboard starts                                        |
| Stories list                          | Directory scan of `stories/`                                               |
| Standup digest content                | Aggregated from session log over the last 24h                              |

The handoff doesn't prescribe file formats — that's the spec's job. The key invariants are:

- Stories, specs, and plans are markdown files on disk
- The dashboard is a read view over those files plus a small write surface for story status/size
- WebSocket is the change-notification channel; the dashboard re-reads from disk on notification

---

## 11. Out of Scope

The following are explicitly **not** part of this design and should not be invented during spec/implementation:

- User accounts, authentication UI, profile management
- Search across stories/specs/plans
- Creating new stories, specs, or plans from the UI (those come from the Claude Code session itself)
- Editing plan tasks/steps from the UI (filesystem is the source of truth)
- Notifications, toasts, or any push-style UI alerts
- Comments, mentions, assignees, reporters
- Sprints, milestones, releases
- Activity feed / change history
- Multi-project switching (single-machine context)
- Mobile or responsive layouts below ~1100px
- Light theme
- Print / export beyond the standup copy-to-clipboard

If a need for any of these emerges during spec, treat it as a separate story and don't bolt it into this design.

---

## 12. Design Decisions & Rationale

These are choices already made during brainstorm that the spec phase should treat as decided unless there's a strong reason to revisit:

**Hierarchy is shown in four surfaces (sidebar / breadcrumb / hierarchy strip / tabs).** Redundancy is intentional during initial adoption to teach the model. The hierarchy strip is the easiest candidate to drop later if user research shows it's unused.

**Geist Sans as the Circular substitute.** Circular is proprietary. Geist is the closest open-source proxy with the geometric character and rounded terminals the design system calls for. If the team licenses Circular for the production build, swap the `font-family` declaration and the visual identity sharpens.

**Issue keys (`#047`, `#047.2`, `#047.2.3`).** Not mandated by requirements but worth keeping. They aid scannability in the Standup digest, in cross-references between views, and in the rail's linked-issue cards. They map naturally to file-system story IDs.

**Project key `BE` in the topbar.** Display-only single-character identifier. Not a switcher. Reflects the active project; in a real multi-project scenario, the dashboard would be launched per-project anyway.

**Story/Spec/Plan as tabs of the same header.** They're facets of the same story, so they share the issue header (key, title, status, size). The tabs switch only the main content and right rail. This reinforces the "you are inside one story" model.

**Plan as default route.** Per requirements. Conceptually you're "inside Story #047 → Plan tab" by default. The breadcrumb makes the parent navigable.

**Active story distinguished from in-progress non-active stories on the board.** The active session works on one story at a time, but other stories may be in-progress status (work started but not currently executing). The "● Active Session" label badge on the active card makes the distinction visible without inventing a new status.

**No shadows, ever.** Per DESIGN.md. Depth comes from borders. On a dark theme, shadows are nearly invisible and break the system.

**Right rail at 280px.** Wide enough for linked-card filenames and frontmatter without dominating. Narrow enough that the main content gets the bulk of the screen at ~1280px and above.

**Read-only checkbox interaction.** Plan steps are filesystem-driven. Allowing UI to write to them invites split-brain bugs (UI thinks a step is done; filesystem says no; reconciliation gets ugly). Keep the write surface to story status/size only.

---

## 13. Open Questions for Spec Phase

Items deliberately left for the spec writer to decide:

1. **Frontend framework.** The mock is plain HTML+CSS+vanilla JS to stay neutral. Spec should pick (React? Solid? Just keep it vanilla for the localhost simplicity? — argument for vanilla: no build step, faster iteration, fits "passive observer" simplicity. Argument for React/Solid: easier state management for the WebSocket updates.)

2. **WebSocket protocol.** Message shape, reconnect strategy, heartbeat, message acknowledgment.

3. **State management.** How the UI tracks "current active story", "current step", "expand/collapse state of tasks" across navigation. localStorage? Just URL params? In-memory only?

4. **Markdown renderer.** What library renders the spec and story markdown. Code highlighting library choice.

5. **File-watching strategy on the backend.** How the server detects changes (fs.watch? polling? chokidar?) before pushing WebSocket updates.

6. **Routing.** Client-side router vs server-rendered pages. Hash routes vs HTML5 history.

7. **Build/dev setup.** How `localhost:[port]` gets served. Vite? esbuild? Just static files + node http server?

8. **Empty/error states beyond what's covered in §9.** What does it look like when the directory has no stories? When a story references a missing spec file? When the WebSocket has been disconnected for over a minute?

9. **Standup digest generation.** Where the digest content comes from. Is it generated server-side by analyzing session logs? Or is it stored in a `standup.md` file the session writes to? Or generated on-demand when the user navigates to Standup view?

10. **Story status/size write protocol.** When the user changes a story's status from `backlog` to `in-progress`, does the UI rewrite the story's frontmatter directly via an API endpoint, or does it go through the Superpowers workflow somehow? Optimistic update with rollback on error, or wait for server confirmation?

---

## 14. Visual Ground Truth

The companion HTML file `claude-control-dashboard-hierarchy.html` is the canonical visual reference. Open it in a browser to see all five views, hover states, animations, and interactions. When the spec or implementation has a question about "what should this look like", the HTML is the answer.

The HTML uses Google Fonts (Geist + Source Code Pro) via CDN. For the production build, either inline the fonts or use a local copy — the dashboard runs at localhost and shouldn't have an external network dependency for fonts.

The HTML has no backend. All data is static, all interactions are local DOM. It's a layout reference, not a working prototype.
