# Mode: In Progress

Produce a structured progress report for a story that is actively being implemented. The story data (`id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`) is available from the main command. Do not ask the user questions — run the steps below, then print the report.

If a `## Last handoff` section is present in the context, read it first for prior progress before producing the report.

## 1. Fetch the parsed plan (if linked)

If `linked_plan_path` is set, URL-encode the path and fetch the parsed plan:

```bash
PLAN_PATH_ENCODED=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "<linked_plan_path>")
curl -s \
  -H "Authorization: Bearer <token>" \
  -H "Host: 127.0.0.1:<port>" \
  "http://127.0.0.1:<port>/api/plans/$PLAN_PATH_ENCODED"
```

The response is a JSON object. The relevant shape:

```json
{
  "tasks": [
    {
      "index": 1,
      "title": "Task label",
      "steps": [
        { "label": "Step label", "state": "done" },
        { "label": "Step label", "state": "todo" }
      ]
    }
  ]
}
```

If `linked_plan_path` is null, or the endpoint returns 404, skip the **Plan status** section in the report.

## 2. Get git log since story creation

`created_at` from the story API is a Unix timestamp in milliseconds. Convert it to a date string, then fetch commits:

```bash
DATE=$(date -r $(( <created_at> / 1000 )) +%Y-%m-%d)
git log --oneline --since="$DATE"
```

## 3. Extract acceptance criteria

The acceptance criteria live in the `## Acceptance criteria` section of the story `body`. Parse this section from the body string. Each criterion is a markdown list item (`- [ ] ...` or `- [x] ...`). If no such section exists in the body, note "No acceptance criteria found" and skip the AC assessment.

## 4. Print the report

Output the following report directly (do not summarise or paraphrase first — just print it). Omit the **Plan status** section entirely if no plan is linked:

```
## Progress: <story title>

### Plan status
Task 1 — <title>: X/Y steps done
Task 2 — <title>: X/Y steps done
...
Overall: N/M tasks complete (P%)

### Recent activity
<last 5–10 lines from git log --oneline output, verbatim>

(Write "No commits found since <DATE>." if the log is empty.)

### Acceptance criteria
- [ ] <criterion text> — <likely met / outstanding — one sentence rationale based on plan task completion and commit messages>
- [ ] ...

(Write "No acceptance criteria section in story body." if none found.)

### Recommended next step
<One clear, specific action to move toward done. Base it on the first incomplete plan task if a plan is linked; otherwise on the first unmet acceptance criterion.>
```

After printing the report, wait for the user's instructions.
