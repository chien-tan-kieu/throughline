# Filter Stories by Status — Design Spec

**Story:** US-2026-05-19-filter-stories-by-status-on-the-board-vi  
**Date:** 2026-05-20  
**Status:** Approved

---

## Summary

Add a client-side status filter to the Stories board view. A pill tab bar appears above the kanban columns; selecting a status fades non-matching columns and shows an empty-state message with a "Clear filter" link inside them. Filter state persists across page navigations within the session via a new Zustand UI store.

---

## Architecture

### New: `packages/web/src/store/ui.ts`

A Zustand store for UI-only preferences, separate from the WebSocket/session state in `useWsStore`.

```ts
type StoryFilter = 'all' | 'backlog' | 'in-progress' | 'done';

interface UiState {
  storyFilter: StoryFilter;
  setStoryFilter: (f: StoryFilter) => void;
}
```

Defaults to `'all'`. This store is the single source of truth for the active filter and persists across `StoriesPage` unmount/remount (e.g., navigating to a Story detail and back).

### New: `packages/web/src/components/stories/FilterBar.tsx`

Renders four pill buttons: All, Backlog, In Progress, Done. Each shows a count badge (`· N`).

Props:
```ts
type Props = {
  counts: { backlog: number; 'in-progress': number; done: number };
};
```

The "All" badge shows `counts.backlog + counts['in-progress'] + counts.done`.

Reads `storyFilter` and `setStoryFilter` from `useUiStore` internally — no filter state in props.

Active pill: green glow (matching topbar `.connection-pill` style — `rgba(62,207,142,0.08)` background, `rgba(62,207,142,0.3)` border, `#3ecf8e` text).

### Modified: `packages/web/src/components/stories/KanbanColumn.tsx`

Gains one optional prop:

```ts
isFiltered?: boolean;
```

When `isFiltered` is true:
- The column wrapper gets a `.filtered` class → `opacity: 0.28`
- The card list is replaced with: `"No stories match this filter."` (muted text) and a `"Clear filter"` link that calls `setStoryFilter('all')`

When `isFiltered` is false/undefined, behaviour is unchanged.

### Modified: `packages/web/src/pages/StoriesPage.tsx`

Three additions:
1. Read `storyFilter` from `useUiStore`
2. Render `<FilterBar counts={{ backlog: backlog.length, 'in-progress': inProgress.length, done: done.length }} />` in the page header, below the title
3. Pass `isFiltered` to each `KanbanColumn`:

```tsx
<KanbanColumn
  status="backlog"
  stories={backlog}
  isFiltered={storyFilter !== 'all' && storyFilter !== 'backlog'}
/>
```

The story arrays passed to each column are unchanged — `StoriesPage` continues to split by status as before. The filter only controls visibility, not what data is fetched.

---

## Visual Design

**Filter bar position:** Inside `.page-header`, below the `"All Stories"` title, replacing the current bottom margin space.

**Pill style** (new CSS classes in `index.css`):
- `.filter-pills` — `display: flex; gap: 6px;`
- `.filter-pill` — pill shape (`border-radius: 9999px`), `border: 1px solid var(--border)`, `color: var(--text-muted)`, monospace 10px uppercase
- `.filter-pill.active` — green glow matching topbar connection pill
- `.filter-pill .pill-badge` — count badge, same font, `opacity: 0.75` (1.0 when active)

**Faded column** (new CSS):
- `.column.filtered` — `opacity: 0.28` (no `pointer-events: none` — the "Clear filter" link inside must remain clickable)

**Empty state in faded column:**
> No stories match this filter.
> [Clear filter](#)

"Clear filter" is a plain `<button>` styled as a green text link (`color: var(--green)`).

---

## Behaviour

| Active filter | Backlog col | In Progress col | Done col |
|---|---|---|---|
| All | normal | normal | normal |
| Backlog | normal | faded | faded |
| In Progress | faded | normal | faded |
| Done | faded | faded | normal |

- Default on first load: `'all'`
- Selecting "All" always restores all columns
- "Clear filter" in any faded column resets to `'all'`
- Filter persists if the user navigates to a Story and returns
- Count badges reflect live story counts from the already-fetched data; no new API calls

---

## Testing

Each behaviour in the table above should have a test. Key cases:

- `FilterBar` renders correct active state for each filter value
- `FilterBar` count badges show correct numbers
- `KanbanColumn` with `isFiltered=true` renders the filtered empty state, not story cards
- `KanbanColumn` with `isFiltered=false` renders story cards normally
- `StoriesPage` passes correct `isFiltered` to each column for each filter value
- `useUiStore` `storyFilter` defaults to `'all'` and updates on `setStoryFilter`

---

## Out of Scope

- Multi-select filtering (e.g. Backlog + In Progress simultaneously)
- Persisting filter across browser sessions (sessionStorage / localStorage)
- Sorting stories within columns
- Hiding columns entirely (option A from design exploration — rejected in favour of fade)
