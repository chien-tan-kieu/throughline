---
id: US-2026-05-23-fix-auth-stop-exposing-token-via-url-in-
title: Fix auth: stop exposing token via URL in claude-control plugin
status: in-progress
size: 
created: 2026-05-23
---

## Story

As a **developer using the claude-control plugin**, I want to **authenticate without the token being passed in the URL**, so that **the auth token is never recorded in browser history, server logs, or referrer headers**.

## Acceptance criteria

- [ ] The auth token is no longer passed as a query parameter in any URL
- [ ] The claude-control dashboard URL does not include the token in the address bar
- [ ] Authentication uses a secure transport mechanism (e.g. HttpOnly session cookie or Authorization header)
- [ ] Opening the dashboard does not expose the token in browser history or developer tools network tab URLs
- [ ] Server-side access logs do not record the token in request paths or query strings
- [ ] All plugin API calls that previously sent the token via URL are updated to use headers or a cookie
- [ ] Existing authenticated sessions continue to work after the mechanism change
- [ ] The plugin README / setup docs are updated to reflect the new auth flow

## Notes

- Current behaviour: token is appended to the dashboard URL as a query parameter (`?token=<value>`), which leaks it into browser history and any HTTP server logs that record full request URLs.
- Recommended approach: on the first authenticated load, exchange the URL token for a short-lived HttpOnly session cookie, then strip it from the URL via `history.replaceState`. API calls from the Claude Code plugin should use the `Authorization: Bearer` header (they already do — this story is about the browser-facing dashboard URL only).
- Check `packages/web` for where the token is currently injected into the URL and `packages/server/src/api` for session/auth middleware.
