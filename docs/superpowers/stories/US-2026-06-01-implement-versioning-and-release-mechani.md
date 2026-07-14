---
id: US-2026-06-01-implement-versioning-and-release-mechani
title: implement versioning and release mechanism for this plugin
status: done
size: S
created: 2026-06-01
---

## Story

As a **plugin maintainer**, I want to **version and release the throughline plugin through a consistent, automated mechanism**, so that **users can track what version they're running and upgrades are predictable and safe**.

## Acceptance criteria

- [ ] The plugin follows semantic versioning (MAJOR.MINOR.PATCH) with the authoritative version declared in a single location (e.g., `package.json`)
- [ ] A `CHANGELOG.md` is maintained and updated as part of each release, summarising changes since the previous version
- [ ] A release script or `npm` lifecycle command (e.g., `npm run release`) bumps the version, updates the changelog, and creates a signed git tag (e.g., `v0.3.0`)
- [ ] The daemon exposes its running version at startup and via the `GET /api/status` endpoint so clients can detect version mismatches
- [ ] A GitHub release is created automatically (or with a single command) for each tag, attaching release notes derived from the changelog
- [ ] The version surfaced in the dashboard UI and `throughline:status` output matches the version declared in `package.json`
- [ ] CI runs the full test suite and blocks a release if any test fails

## Notes

- Runtime already exposes `version: "0.2.0"` in `.throughline/runtime.json` — the release mechanism should keep this in sync with `package.json`.
- Consider `standard-version` or `release-it` for automating changelog generation from conventional commits; both integrate cleanly with the existing npm workspace setup.
- Git tag signing requires the maintainer's GPG key to be configured; document the one-time setup step in `CONTRIBUTING.md`.
