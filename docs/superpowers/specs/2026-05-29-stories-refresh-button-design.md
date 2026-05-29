# Stories Board — Refresh Button & Last Updated Time

**Date:** 2026-05-29  
**Status:** Approved

## Summary

Add a manual refresh button and absolute "last updated" timestamp to the Stories board page header. The control sits inline on the right end of the existing filter-pills row — no new rows, no layout changes.

## Motivation

The board auto-syncs via WebSocket `story.changed` events, but users have no way to force a re-fetch or know when data was last loaded. A lightweight refresh control addresses both: it gives confidence the view is fresh and lets users recover from missed WebSocket events.

## Design

### Placement

The existing `.filter-pills` flex row in `FilterBar` becomes a space-between row: filter pills on the left, a `[Updated HH:MM · ↻]` cluster on the right. No new rows are added to the page header.

### Timestamp

- Format: `Updated HH:MM` (24-hour absolute, via `toLocaleTimeString` with `{ hour: '2-digit', minute: '2-digit', hour12: false }`)
- Source: `dataUpdatedAt` from React Query's `useQuery` return value (Unix ms)
- Hidden when `dataUpdatedAt === 0` (before the first fetch resolves)
- Style: `Source Code Pro`, 10px, `var(--text-disabled)`

### Refresh button

- Icon: `↻` SVG or Unicode (16×16 icon, `var(--text-muted)`, hover `var(--text-primary)`, 120ms transition)
- Disabled while `isFetching` to prevent stacked requests
- While `isFetching`: icon applies `.spinning` CSS class (360° rotation, 600ms linear infinite)
- On click: calls `refetch()` from React Query

### CSS additions (`index.css`)

The existing `.filter-pills` rule gains `align-items: center` and `justify-content: space-between` so the right-side cluster aligns vertically and pushes to the far right without wrapping the existing pills.

```css
/* update existing rule */
.filter-pills { ...; align-items: center; justify-content: space-between; }

.updated-label {
  font-family: 'Source Code Pro', monospace;
  font-size: 10px;
  color: var(--text-disabled);
}

.refresh-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  color: var(--text-muted);
  transition: color 120ms ease;
  border-radius: 3px;
}
.refresh-btn:hover:not(:disabled) { color: var(--text-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 600ms linear infinite; }
```

## Component changes

### `StoriesPage.tsx`

Destructure `refetch`, `isFetching`, and `dataUpdatedAt` from `useQuery`. Pass them to `FilterBar`:

```tsx
const { data: stories = [], refetch, isFetching, dataUpdatedAt } = useQuery({
  queryKey: ["stories"],
  queryFn: api.fetchStories,
});

<FilterBar
  counts={...}
  onRefresh={refetch}
  isFetching={isFetching}
  lastUpdatedAt={dataUpdatedAt}
/>
```

### `FilterBar.tsx`

Add three optional props: `onRefresh`, `isFetching`, `lastUpdatedAt`. Wrap the existing pills in a flex row and append the right-side cluster:

```tsx
type Props = {
  counts: { backlog: number; "in-progress": number; done: number };
  onRefresh?: () => void;
  isFetching?: boolean;
  lastUpdatedAt?: number;
};
```

Render:
```tsx
<div className="filter-pills">
  <div style={{ display: "flex", gap: 6 }}>
    {/* existing pill buttons */}
  </div>
  {onRefresh && (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
      {lastUpdatedAt ? (
        <span className="updated-label">
          Updated {formatTime(lastUpdatedAt)}
        </span>
      ) : null}
      <button
        className="refresh-btn"
        onClick={onRefresh}
        disabled={isFetching}
        title="Refresh stories"
      >
        <RefreshIcon className={isFetching ? "spinning" : ""} />
      </button>
    </div>
  )}
</div>
```

`formatTime` is a local helper: `new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })`.

## Files touched

| File | Change |
|------|--------|
| `packages/web/src/pages/StoriesPage.tsx` | Pull `refetch`, `isFetching`, `dataUpdatedAt` from `useQuery`; pass to `FilterBar` |
| `packages/web/src/components/stories/FilterBar.tsx` | Add props; render timestamp + refresh button on right side of pills row |
| `packages/web/src/index.css` | Add `.refresh-btn`, `.spinning`, `.updated-label` styles |

## Out of scope

- Auto-refresh on a timer (the WebSocket already covers live updates)
- Relative timestamps ("2 min ago")
- Per-column refresh
