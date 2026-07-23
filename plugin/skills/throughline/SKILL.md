# throughline

This session is being observed by the Throughline plugin.

Throughline records hook events (tool use, session start/end, subagent lifecycle) to a local SQLite database. It **never blocks tool calls or modifies responses** — it is observer-only.

No action is required from you. The daemon runs silently in the background.
