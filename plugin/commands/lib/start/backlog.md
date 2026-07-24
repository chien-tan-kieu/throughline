# Mode: Backlog

If a `## Last handoff` section is present in the context, read it first for prior progress before proceeding.

Invoke the `superpowers:brainstorming` skill directly via the Skill tool, passing the story as context:

```
skill: superpowers:brainstorming
args: |
  I want to work on this story:

  **ID:** <id>
  **Title:** <title>
  **Status:** <status>

  <body>
```

Do not ask the user to invoke the skill — invoke it yourself immediately.
