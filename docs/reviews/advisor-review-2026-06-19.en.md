---
title: Advisor Review — Claude Control
date: 2026-06-19
reviewer: Claude (Opus 4.8) acting as advisor
scope: Review of the repo, plugin features, real-world practicality as an observer for the superpowers workflow, and mapping to the Agile/Scrum model
language: en
---

# Advisor Review — Claude Control

> Note: No `advisor` tool was available in this session (CLAUDE.md references one as an escalation tool, but it is not currently installed). This review was produced by Claude acting as the advisor, based on a survey of the internal source code and research into comparable tools/methodologies on GitHub and the wider internet.

## 1. Verdict (executive summary)

1. **The product is mislabeled.** This is **not** a Scrum tool. At its core it is a **Kanban + Spec-Driven Development (SDD) companion** with observation capability. The Scrum vocabulary (standup, story, sizing) is borrowed, but the underlying mechanism is *continuous-flow Kanban* layered over the *linear lifecycle of a single work item*. This is the single most important thing to clarify.
2. **The competitive differentiation is REAL and valuable.** There are a dozen observability tools for Claude Code, but **all of them confine themselves to telemetry/events** and explicitly state "project management out of scope." Claude Control is the only one that bridges *observation → a PM/methodology layer*. That is a genuine gap.
3. **The strongest use case isn't "Scrum" — it's "cross-session memory" (handoff).** The author of superpowers himself admits their memory/cross-session piece is "not wired up yet." `/handoff` + persistent stories fill exactly that gap. This should be the flagship feature, not standup.
4. **The biggest practical risks are coupling fragility and an overly narrow audience.** Phase inference hardcodes the skill names of a fast-moving third-party framework, and the entire PM layer depends on the human's discipline of manually writing stories.

## 2. What Claude Control actually is

| Layer | Mechanism | Assessment |
|-------|-----------|------------|
| **Observe** | Hooks (`PreToolUse`/`PostToolUse`/`SessionStart`/…) → Bun daemon + SQLite, never blocks | The observer-only design is correct and safe. But **thin**: it only stores events — no timeline viewer / cost / token / multi-session in the dashboard yet |
| **Infer** | Maps activity → superpowers phases `brainstorm → spec → plan → implement` via skill names + `InstructionsLoaded` paths + plan/spec file changes | Nice idea, but **brittle heuristics** (see §5) |
| **Manage (PM)** | Stories (md+frontmatter, `backlog→in-progress→done→archived`, size S/M/L), standup, handoff, closure review, Kanban + phase tracker | This is the differentiator — but also the part most prone to *framing* errors |

Key point: **"phase" and "status" are two orthogonal axes** — phase = where in the SDD lifecycle a *single* story is; status = which column on the board. Separating these two axes is a **correct** design decision. The problem is calling the whole system "Scrum."

## 3. Competitive landscape (research)

The "Claude Code observability via hooks" space is already crowded:

| Tool | Stack | Scope | PM layer? |
|------|-------|-------|-----------|
| [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Bun + SQLite + WS + Vue | Event timeline, multi-agent swim-lanes, pulse chart | ❌ "purely telemetry" |
| [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) | Node + SQLite + WS + React | Cost/token, subagent DAG, Sankey, **Kanban (Working/Waiting/Completed/Error)**, webhooks (Slack/PagerDuty…) | ❌ "PM & story tracking explicitly out of scope" |
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | OpenTelemetry + Grafana | Cost/performance/usage metrics | ❌ |
| eyes-on-claude-code, agents-observe, CAST, claude-session-dashboard | hooks/JSONL → dashboard | Session/agent monitoring | ❌ |
| **Claude Control (yours)** | Bun + SQLite + WS + React | Observe **+ stories + standup + handoff + phase-of-methodology** | ✅ **the only one** |

**Two insights from this table:**

- **Real differentiation:** no other tool steps into the PM/methodology layer. Positioned correctly, this is a small "blue ocean."
- **Don't race on telemetry:** the others are far ahead on cost/token/DAG/Sankey/notifications — and your dashboard (per the survey) is still *missing* both an event timeline and cost tracking. Competing there means diving into a red ocean you'll lose. Keep observability at "good enough" and pour effort into the PM layer.

## 4. Mapping to Agile/Scrum — straight analysis

| Scrum | Claude Control | Fit? |
|-------|----------------|------|
| Product Backlog | stories `status=backlog` | 🟡 yes, but no prioritization/ordering or epics |
| User Story + Acceptance Criteria | story md ("As a… I want… so that…") + AC checklist | 🟢 good fit |
| Estimation | size S/M/L (T-shirt) | 🟡 has sizing but **no velocity** → estimation has no feedback loop, it's just decoration |
| Definition of Done | acceptance criteria | 🟡 but the checkbox state is **unreliable** (`done.md` itself admits this) |
| Sprint (time-box) | — | 🔴 **does not exist** |
| Sprint Backlog / Planning | — (closest: `/start backlog`→brainstorming, but per-story) | 🔴 |
| Daily Standup | `/standup` digest | 🟡 has the format, but it's a **solo progress log**, not a team sync ritual |
| Sprint Review | `/start done`→closure review, `/handoff` | 🟡 per-story, not per-sprint |
| Retrospective | — (the closure review is product-focused, not process-focused) | 🔴 |
| Burndown / Velocity | — | 🔴 |
| Roles (PO/SM/Dev) | human = PO+SM, AI = Dev | 🔴 not modeled |

**Mapping conclusion:** the system is **strong on the work-item axis** (story, AC, sizing, board) but **entirely absent on the iteration/cadence/team axis** (sprint, velocity, ceremonies, roles). That is precisely the definition of **Kanban, not Scrum**.

And this **is not a flaw — it's a truth worth embracing:** a solo developer + AI is naturally suited to *continuous-flow Kanban* rather than *time-boxed team Scrum*. Most Scrum ceremonies exist to coordinate *humans with humans* — which isn't present here. Martin Fowler names the exact root tension: [SDD is inherently linear and front-loads specification, out of phase with Agile's "working software over comprehensive documentation"](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). Superpowers is also of the SDD family ([brainstorm→plan→execute, "primarily linear"](https://blog.fsck.com/2025/10/09/superpowers/)) — the same house as [Kiro, spec-kit, BMAD](https://github.com/github/spec-kit).

→ **Framing recommendation:** drop the "Scrum" label. Position it as **"a Kanban board + SDD lifecycle tracker for a solo-developer-with-AI flow."** Keep standup/handoff as *context utilities*, don't sell them as *ceremonies*.

## 5. Practicality of the "observer for superpowers" use case

**Accuracy weaknesses (real operational risks):**

- **Hardcoded skill names** (`superpowers:brainstorming`→brainstorm…). Superpowers is [moving fast; the author even says he'll redesign the plugin/skill mechanism](https://blog.fsck.com/2025/10/09/superpowers/). One upstream skill rename → the observer **silently** mis-infers with no error.
- **Missing `spec` detection** in the `InstructionsLoaded`-based inference (no match for `writing-specs`).
- **Monotonic phase, never downgrades** → it gets stuck at a high phase forever (brainstorm→plan, then delete the plan, still "plan").
- **Only a 20-most-recent-event window** → long sessions easily lose the signal.
- **Unreliable AC checkboxes** — acknowledged in the code itself; meaning "Definition of Done" currently leans on the git log, not on AC.

These make the observer's core promise ("accurately reflect where you are") only as trustworthy as these brittle heuristics.

**Audience — the intersection of three narrow sets:** you need (Claude Code) ∩ (superpowers installed) ∩ (the discipline to write stories/specs/plans as markdown in `docs/superpowers/`) simultaneously. Most Claude Code users don't use superpowers; many superpowers users don't write formal stories. This is the biggest growth constraint.

**The "killer" use case (strongest, worth concentrating on):** **cross-session memory / handoff.** Claude Code sessions are ephemeral; stories + handoffs survive across session boundaries. The superpowers author admits this is [the part he "hasn't had time to wire together"](https://blog.fsck.com/2025/10/09/superpowers/). Claude Control fills exactly that gap — far more valuable than standup.

## 6. Key risks

1. **Brittle coupling to a moving upstream** — depends on superpowers' skill names + the `docs/superpowers/{specs,plans,stories}` directory convention.
2. **The PM layer depends on manual discipline** — the observer doesn't create stories itself; the PM value only materializes if the human diligently creates/links stories. This conflicts with the spirit of "let AI reduce manual work."
3. **"Scrum for one" is a stretch** — standup/velocity/ceremonies lack a team to give them meaning; easily dismissed as a Scrum veneer.
4. **Observability is thin** relative to the field — missing timeline/cost/multi-session; weak under a head-to-head comparison.
5. **A small but visible inconsistency:** the CLI uses size `S|M|L`, the dashboard cycles `XS→S→M→L→XL`. Contract mismatch.

## 7. Recommendations (high → low priority)

1. **Reframe the product: "Kanban + SDD companion," drop the Scrum label.** Fix the README/`plugin.json` description to match reality. This is the cheapest change with the largest perception impact.
2. **Concentrate on handoff / cross-session memory** — auto-generate a handoff on `SessionEnd`/`PreCompact`; auto-load the most recent handoff on `/start`. This is the moat.
3. **Decouple hard dependencies on superpowers:** move the skill→phase map and the directory paths into **config**; treat superpowers as *one adapter*. Hedges against upstream churn and opens the door to spec-kit/Kiro.
4. **Harden phase inference:** add a `writing-specs`→spec branch; allow a **manual override** + show a "confidence" level; handle staleness/downgrade instead of strict monotonicity.
5. **Close the manual-discipline gap:** when a brainstorming session is observed with *no active story* → suggest "create a story?". Turn the observer into a gentle nudge.
6. **Fix the "Done" source:** either have the workflow tick checkboxes itself, or stop relying on checkboxes entirely and derive Done from explicit signals (commit/PR/handoff). Also reconcile size S/M/L between CLI and UI.
7. **Don't race on telemetry.** Keep observability "good enough"; if you add anything, only add things that serve the PM layer (e.g., actual time spent in each phase fed back into estimation → producing *real velocity*, turning sizing from decoration into data).

---

**One-line takeaway:** Claude Control solves a real problem the whole observability ecosystem leaves empty — but it's wearing a slightly oversized coat (Scrum) and tied to a slightly wobbly stake (superpowers). Fix those two things, push hard on handoff, and it goes from "interesting demo" to "a tool I use every day."

## References

- [obra/superpowers](https://github.com/obra/superpowers/)
- [Jesse Vincent — "Superpowers: How I'm using coding agents" (blog.fsck.com)](https://blog.fsck.com/2025/10/09/superpowers/)
- [Martin Fowler — Spec-Driven Development: Kiro, spec-kit, Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- [GitHub spec-kit](https://github.com/github/spec-kit)
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)
- [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel)
