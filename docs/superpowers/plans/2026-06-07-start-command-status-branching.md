# Start Command Status-Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branch `/throughline:start` on story status so backlog launches brainstorming, in-progress produces a progress report, and done produces a closure review.

**Architecture:** `start.md` keeps steps 1–3b unchanged and adds a dispatch step that reads the story status, resolves the plugin install path, and loads the appropriate mode file from `plugin/commands/lib/start/`. Each mode file is a self-contained prose instruction document.

**Tech Stack:** Bash (path resolution, git log, curl), Claude `Read` tool, existing `/api/plans/:path` endpoint.

---

### Task 1: Create `plugin/commands/lib/start/backlog.md`

**Files:**
- Create: `plugin/commands/lib/start/backlog.md`

- [ ] **Step 1: Create the directory and write the file**

  ```bash
  mkdir -p plugin/commands/lib/start
  ```

  Write `plugin/commands/lib/start/backlog.md` with this exact content:

  ````markdown
  # Mode: Backlog

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
  ````

- [ ] **Step 2: Verify the file exists and matches**

  ```bash
  cat plugin/commands/lib/start/backlog.md
  ```

  Expected: the exact content above, no truncation.

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/commands/lib/start/backlog.md
  git commit -m "feat(plugin): add start/backlog mode file"
  ```

---

### Task 2: Create `plugin/commands/lib/start/in-progress.md`

**Files:**
- Create: `plugin/commands/lib/start/in-progress.md`

- [ ] **Step 1: Write the file**

  Write `plugin/commands/lib/start/in-progress.md` with this exact content:

  ````markdown
  # Mode: In Progress

  Produce a structured progress report for a story that is actively being implemented. The story data (`id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`) is available from the main command. Do not ask the user questions — run the steps below, then print the report.

  ## 1. Fetch the parsed plan (if linked)

  If `linked_plan_path` is set, URL-encode the path and fetch the parsed plan:

  ```bash
  PLAN_PATH_ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "<linked_plan_path>")
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
        "label": "Task label",
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

  Output the following report directly (do not summarise or paraphrase first — just print it):

  ```
  ## Progress: <story title>

  ### Plan status
  Task 1 — <label>: X/Y steps done
  Task 2 — <label>: X/Y steps done
  ...
  Overall: N/M tasks complete (P%)

  (Omit this section entirely if no plan is linked.)

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
  ````

- [ ] **Step 2: Verify the file exists and matches**

  ```bash
  cat plugin/commands/lib/start/in-progress.md
  ```

  Expected: the exact content above.

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/commands/lib/start/in-progress.md
  git commit -m "feat(plugin): add start/in-progress mode file"
  ```

---

### Task 3: Create `plugin/commands/lib/start/done.md`

**Files:**
- Create: `plugin/commands/lib/start/done.md`

- [ ] **Step 1: Write the file**

  Write `plugin/commands/lib/start/done.md` with this exact content:

  ````markdown
  # Mode: Done

  Produce a closure review for a completed story. The story data (`id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`) is available from the main command. Do not ask the user questions — run the steps below, then print the report.

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
  ````

- [ ] **Step 2: Verify the file exists and matches**

  ```bash
  cat plugin/commands/lib/start/done.md
  ```

  Expected: the exact content above.

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/commands/lib/start/done.md
  git commit -m "feat(plugin): add start/done mode file"
  ```

---

### Task 4: Update `plugin/commands/start.md` — dispatch step

**Files:**
- Modify: `plugin/commands/start.md`

- [ ] **Step 1: Replace step 4 in `plugin/commands/start.md`**

  The file currently ends at step 4 (the unconditional brainstorming invocation). Replace everything from step 4 onward with:

  ````markdown
  4. Determine the mode file based on the story's `status` field:

     | Status | Mode file |
     |--------|-----------|
     | `backlog` | `backlog.md` |
     | `in-progress` | `in-progress.md` |
     | `done` | `done.md` |

     If the status is not one of the above, print: "Unrecognized status '<status>' — defaulting to backlog mode." and use `backlog.md`.

     Resolve the install location and construct the absolute path to the mode file:

     ```bash
     INSTALL=$(jq -r '."throughline-local".installLocation' ~/.claude/plugins/known_marketplaces.json)
     echo "$INSTALL/plugin/commands/lib/start/<mode-file>"
     ```

     Replace `<mode-file>` with the filename from the table above.

     Use the `Read` tool on the absolute path returned by that command. Then follow the instructions in the loaded file exactly. The story context available to the mode file is: `id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`.
  ````

  The updated full file content of `plugin/commands/start.md` is:

  ````markdown
  ---
  description: Load a story and launch the appropriate workflow based on its status
  allowed-tools:
    - Bash
    - Read
  ---

  Start a story by loading it and dispatching to the appropriate workflow for its status.

  Usage: `/throughline:start <story-id>`

  1. Ensure daemon is running:
     ```bash
     bash -c 'S=$(jq -r ".[\"throughline-local\"].installLocation" ~/.claude/plugins/known_marketplaces.json 2>/dev/null)/plugin/commands/lib/ensure-daemon.sh; [ -f "$S" ] && bash "$S" || { echo "Cannot locate throughline install."; exit 1; }'
     ```
     If the script prints an error, stop and show it. Otherwise continue.

  2. Run `cat "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.throughline/runtime.json"` and parse `port` and `token` from the JSON output.

  3. Fetch the story:
     ```bash
     curl -s \
       -H "Authorization: Bearer <token>" \
       -H "Host: 127.0.0.1:<port>" \
       http://127.0.0.1:<port>/api/stories/<story-id>
     ```
     If 404, print "Story <story-id> not found." and stop.

  3b. Record the active story for the dashboard:
     ```bash
     curl -s -X PATCH \
       -H "Authorization: Bearer <token>" \
       -H "Host: 127.0.0.1:<port>" \
       -H "Content-Type: application/json" \
       -d '{"active_story_id":"<story-id>"}' \
       http://127.0.0.1:<port>/api/sessions/current || true
     ```
     (Best-effort — ignore any errors.)

  4. Determine the mode file based on the story's `status` field:

     | Status | Mode file |
     |--------|-----------|
     | `backlog` | `backlog.md` |
     | `in-progress` | `in-progress.md` |
     | `done` | `done.md` |

     If the status is not one of the above, print: "Unrecognized status '<status>' — defaulting to backlog mode." and use `backlog.md`.

     Resolve the install location and construct the absolute path to the mode file:

     ```bash
     INSTALL=$(jq -r '."throughline-local".installLocation' ~/.claude/plugins/known_marketplaces.json)
     echo "$INSTALL/plugin/commands/lib/start/<mode-file>"
     ```

     Replace `<mode-file>` with the filename from the table above.

     Use the `Read` tool on the absolute path returned by that command. Then follow the instructions in the loaded file exactly. The story context available to the mode file is: `id`, `title`, `status`, `body`, `linked_spec_path`, `linked_plan_path`, `created_at`, `port`, `token`.
  ````

- [ ] **Step 2: Verify the file**

  ```bash
  cat plugin/commands/start.md
  ```

  Confirm:
  - `description` field updated to "Load a story and launch the appropriate workflow based on its status"
  - Steps 1–3b are unchanged
  - Step 4 is the new dispatch table (no mention of `superpowers:brainstorming`)

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/commands/start.md
  git commit -m "feat(plugin): dispatch start command by story status"
  ```

---

## Manual Verification

No automated tests exist for prose command files. After all tasks are committed, verify each path:

- [ ] **Backlog path:** Run `/throughline:start` on a story with `status: backlog`. Confirm brainstorming launches.
- [ ] **In-progress path:** Run `/throughline:start` on a story with `status: in-progress`. Confirm a progress report is printed with plan status, git log, and AC assessment sections.
- [ ] **Done path:** Run `/throughline:start` on a story with `status: done` (e.g. `US-2026-06-02-plugin-parse-superpowers-spec-plan-files`). Confirm a closure review is printed with shipped items and AC review.
- [ ] **Fallback path:** Temporarily set a story's status to an unrecognized value (e.g. `review`) in its markdown file, restart the daemon, and run `/throughline:start`. Confirm the fallback message appears and brainstorming proceeds.
