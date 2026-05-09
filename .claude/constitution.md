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

- **Backend changes** (anything under `backend/kb/` or `backend/tests/`):
  run `.venv/bin/pytest` from `backend/` and confirm green.
- **Frontend changes** (anything under `frontend/src/`):
  run `pnpm lint` and `pnpm test` from `frontend/` and confirm both green.
- If a run fails, fix it or explicitly surface the failure — do not report
  success with failing checks.

**Why:** "Looks right" is not evidence. Type checks and tests are.

### Consult the source of truth before visual or schema changes

- Before any visual change (Tailwind classes, palette, typography, motion):
  read `DESIGN.md` at repo root. Don't infer the design language from
  existing components.
- Before any change to wiki page structure, frontmatter, or section
  conventions: read `backend/knowledge/schema/SCHEMA.md`. The compile
  agent's output contract depends on it.

**Why:** Both docs encode non-obvious conventions. Inferring from existing
pages causes drift.

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
