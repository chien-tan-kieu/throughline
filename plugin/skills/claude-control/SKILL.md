# claude-control

This session is being observed by the Claude Control plugin.

Claude Control records hook events (tool use, session start/end, subagent lifecycle) to a local SQLite database. It **never blocks tool calls or modifies responses** — it is observer-only.

No action is required from you. The daemon runs silently in the background.
