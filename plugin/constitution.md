# Project Constitution

This document is the operating constitution for AI assistants working in this repository. It defines the principles for _how_ to make changes (the Karpathy's Inspired Four Principles) and the project-specific rules that sit on top of them. Both sections are non-negotiable — when a tool, instruction, or instinct conflicts with what's written here, the constitution wins.

## The Four Principles

| Principle                 | Addresses                                              |
| ------------------------- | ------------------------------------------------------ |
| **Think Before Coding**   | Wrong assumptions, hidden confusion, missing tradeoffs |
| **Simplicity First**      | Overcomplication, bloated abstractions                 |
| **Surgical Changes**      | Orthogonal edits, touching code you shouldn't          |
| **Goal-Driven Execution** | Tests-first, verifiable success criteria               |

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

LLMs often pick an interpretation silently and run with it. This principle forces explicit reasoning:

- **State assumptions explicitly** — If uncertain, ask rather than guess
- **Present multiple interpretations** — Don't pick silently when ambiguity exists
- **Push back when warranted** — If a simpler approach exists, say so
- **Stop when confused** — Name what's unclear and ask for clarification

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

Combat the tendency toward overengineering:

- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it

**The test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked

**The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform imperative tasks into verifiable goals:

| Instead of...    | Transform to...                                       |
| ---------------- | ----------------------------------------------------- |
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"    | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"     | "Ensure tests pass before and after"                  |

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let the LLM loop independently. Weak criteria ("make it work") require constant clarification.

## How to Know It's Working

These guidelines are working if you see:

- **Fewer unnecessary changes in diffs** — Only requested changes appear
- **Fewer rewrites due to overcomplication** — Code is simple the first time
- **Clarifying questions come before implementation** — Not after mistakes
- **Clean, minimal PRs** — No drive-by refactoring or "improvements"

## Tradeoff Note

These guidelines bias toward **caution over speed**. For trivial tasks (simple typo fixes, obvious one-liners), use judgment — not every change needs the full rigor.

The goal is reducing costly mistakes on non-trivial work, not slowing down simple tasks.

## Project-Specific Rules

These repo-specific rules extend the Karpathy principles above. Apply them
whenever working in this codebase.

### Test-Driven Development is mandatory

Before writing implementation code for any new feature or bug fix:

1. Write a failing test that captures the behavior or reproduces the bug.
2. Run it and confirm it fails for the expected reason.
3. Write the minimum code to make it pass.
4. Run the full relevant test suite and confirm green.

This applies whether or not the work is going through a `superpowers:*`
skill. The `superpowers:test-driven-development` skill enforces this when
invoked; this rule is the guardrail for everything else, including direct
edits, quick fixes, and one-off scripts that touch behavior.

**Narrow exceptions** (do not expand without asking):

- Pure config edits with no behavior change (e.g., this file, dependency
  bumps that don't change runtime semantics)
- One-line typo fixes in comments or docs
- Read-only investigation

**Why:** TDD prevents "I think this works" delusions and forces the
behavior contract to be made explicit _before_ the implementation
crystallizes around an unstated assumption.

### Verification before "done"

Don't claim a task complete without running the relevant checks:

- Run the check commands appropriate to what changed (tests, lint, type-check, build, etc.).
- If the project's `CLAUDE.md` specifies which commands to run for which areas, follow those exactly.
- All failures in the resulting run must be resolved before claiming completion — including
  pre-existing failures unrelated to the current change. Do not report success, and do not
  hand back to the user, while any check is red.
- If a failing check cannot be fixed as part of this task (e.g., it requires a decision only
  the user can make, or touches code far outside the task's scope), stop and explicitly surface
  it to the user rather than reporting success or silently leaving it broken.

**Why:** "Looks right" is not evidence. Type checks and tests are. A pre-existing failure left
in place is still a red suite — it erodes the signal that "tests pass" is supposed to give, and
the next person to touch this code inherits it as if it were new.

### Maintain running implementation notes

While implementing any task, maintain a running `implementation-notes.md` at the repo root (create it if missing). Update it as you work, not as a summary at the end.

Record entries under four sections:

1. **Decisions outside the spec** — choices you made that the spec did not cover.
2. **Deviations from the spec** — places where reality forced a change from what was asked, and why.
3. **Trade-offs** — where you weighed speed vs. simplicity vs. correctness, and which side you picked.
4. **Anything else** — anything a reviewer should know before reading the diff.

Keep entries to one or two lines each, with file/function references where relevant. Do NOT log trivia (formatting, naming, obvious idioms). Instead, record only what a reviewer would otherwise have to reverse-engineer from the diff.

### Escalate to advisor after 2 failed iterations

If you have attempted to resolve an issue (bug fix, test failure, unexpected behavior, or recurring error) **2 times without success**, stop and call the `advisor` tool before trying again.

- Count each distinct implementation attempt as one iteration.
- Do not keep looping with minor variations of the same approach — that wastes tokens without converging.
- When calling advisor in this context, briefly state: what you tried, what failed, and what you're uncertain about.

**Why:** Two failed iterations signal either a wrong assumption or a missing constraint. Advisor sees the full conversation history and can break the deadlock faster than a third blind attempt.

### Consult the source of truth before changes with a design or schema contract

Before making changes in any domain that has a dedicated spec or contract document (visual design, data schema, API contracts, content structure, etc.), **read that document first**. Do not infer conventions from existing code or components.

- Look for a canonical spec file in the repo root or a well-known location (e.g. `DESIGN.md`, `SCHEMA.md`, `API.md`, or equivalent).
- If no spec file exists, ask the user which source of truth to consult before proceeding.
- Never derive conventions solely from existing examples — examples may already contain drift.

**Why:** Spec documents encode non-obvious decisions and constraints that examples alone cannot reliably convey. Inferring from examples propagates and amplifies any drift already present.

### `docs/superpowers/` is historical, not a backlog

Specs and plans under `docs/superpowers/specs/` and `docs/superpowers/plans/`
are **records of past implementation decisions**, not active tickets:

- Do not open them and implement what they describe unless the user
  explicitly asks.
- Do not treat "TODO" / "pending" language inside them as current work.

Current work comes from the user in this session.

### Never commit, push, or open PRs without an explicit request

Even when work feels complete, do **not** run `git commit`, `git push`,
`git merge`, `gh pr create`, `gh pr merge`, or any branch-mutating command
without the user asking for it in _this_ session.

- Prior sessions' commit permission does not carry over.
- When commit-worthy work is done, _suggest_ it and wait.

**Why:** Commits and PRs are shared state — visible to collaborators and
harder to undo than a local file change.

---

_The Four Principles are adapted from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on common LLM coding pitfalls._
