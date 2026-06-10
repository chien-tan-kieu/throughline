---
id: US-2026-06-08-optimize-story-id-generation-to-use-incr
title: Optimize Story ID generation to use incremental integers (US{n}) stored in SQLite
status: done
size: 
created: 2026-06-08
---

## Story

As a **developer**, I want story IDs to follow a simple incremental format like `US1`, `US2`, `US3`, so that IDs are short, readable, and collision-free without depending on date and title slugs.

## Acceptance criteria

- [ ] New stories receive an ID in the format `US{n}` where `n` is a positive integer (e.g. `US1`, `US42`)
- [ ] The integer counter is stored in SQLite and persists across daemon restarts
- [ ] Each new story increments the counter by 1 from the last assigned ID, with no gaps on retry or error
- [ ] IDs are unique: no two stories can share the same integer `n`
- [ ] The `file_path` for new stories reflects the new ID format (e.g. `stories/US42.md`)
- [ ] Existing stories with the old date-slug format continue to work and are not renamed
- [ ] The `/api/stories` list endpoint returns both old and new format IDs without error

## Notes

The current ID format (`US-yyyy-MM-dd-<title-slug>`) is truncated to 50 chars, which causes collisions for same-day stories with similar titles. The new format uses an auto-increment integer column in the `stories` SQLite table (or a separate `counters` table) to guarantee uniqueness. The counter must be atomic — use SQLite's `AUTOINCREMENT` or a `SELECT MAX(n) + 1` inside a transaction to avoid races.
