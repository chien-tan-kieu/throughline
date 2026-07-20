# Mode: Done

Produce a closure review for a completed story. The story data (`id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`) is available from the main command. Do not ask the user questions — run the steps below, then print the report.

If a `## Last handoff` section is present in the context, read it first for prior progress before producing the report.

**Important:** Checkbox state in the story body is not reliable — checkboxes remain unchecked in the file even when a story is done. Assess completion from git log and linked document filenames only, never from checkbox state.

## 1. Get git log since story creation

`created_at` from the story API is a Unix timestamp in milliseconds. Convert it to a date string:

```bash
DATE=$(date -r $(( <created_at> / 1000 )) +%Y-%m-%d)
git log --oneline --since="$DATE"
```

## 2. Extract acceptance criteria

Parse the `## Acceptance criteria` section from the story `body`. Each criterion is a markdown list item (`- [ ] ...` or `- [x] ...`). Strip the checkbox prefix — treat text only. If no such section exists, note "No acceptance criteria found."

## 3. Print the report

Output the following report directly:

```
## Closure review: <story title>

### What was shipped
- <3–6 bullet points derived from git log, grouped by concern>

(Write "No commits found since <DATE>." if the log is empty.)

### Acceptance criteria review
- <criterion text>
  Assessment: <met / not met / partially met> — <one sentence rationale from commit messages and linked_spec_path / linked_plan_path filenames>

(Write "No acceptance criteria section in story body." if none found.)

### Deliberately deferred
<Any items the story body or spec/plan filenames suggest were out of scope, or "None identified." if everything appears covered.>
```

After printing the report, wait for the user's instructions.
