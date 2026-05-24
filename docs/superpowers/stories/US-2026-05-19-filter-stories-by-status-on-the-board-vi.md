---
id: US-2026-05-19-filter-stories-by-status-on-the-board-vi
title: Filter stories by status on the board view
status: done
size: S
created: 2026-05-19
---

## Story

As a **developer**, I want to **filter stories by status on the board view**, so that **I can focus on in-progress work without being distracted by backlog or completed items**.

## Acceptance criteria

- [ ] A filter control appears at the top of the Stories board view
- [ ] Filter options include: All, Backlog, In Progress, Done
- [ ] Selecting a filter immediately updates the visible story cards without a page reload
- [ ] The active filter is highlighted/selected in the UI
- [ ] Selecting "All" shows every story regardless of status
- [ ] Filter state persists across page navigations within the same session
- [ ] If no stories match the active filter, an empty state message is shown
- [ ] Filter works correctly when combined with existing sort order

## Notes

- The filter should be a client-side operation — no new API calls needed since the board already fetches all stories on load.
- Empty state copy: "No stories match this filter." with a "Clear filter" link.
- Default filter on first load should be "All".
- Consider adding a story count badge next to each filter option (e.g. "In Progress (3)").
