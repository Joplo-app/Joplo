---
name: product-demo-director
description: >-
  Plan and direct internal or stakeholder product demos in Joplo — concept
  proposals, feature walkthroughs, A/B design comparisons, and release demos —
  around user state change, business rules, and Action → Reaction → Meaning
  beats rather than UI feature tours (产品演示导演、功能方案演示、原型评审叙事、立项概念演示、A/B方案对比).
  Use when turning a product requirement, PRD, feature idea, or design trade-off
  into a Joplo project or work.
---

# Product Demo Director

Turn a product requirement, rough idea, or design dispute into a **decision-enabling behavioral story** in Joplo. A product demo succeeds when reviewers understand *who was blocked, how the user's state changes, how edge cases behave, and what open decisions need their call* — never when it merely tours buttons and panels.

Pair this skill with `visual-explanation` whenever a beat involves backend architecture, async state machines, multi-role handoffs, or quantitative trade-offs, and read the project's installed Joplo skills (`npx joplo skill authoring`, `story`, `cases`, `review`) for exact API contracts.

## 1. Classify the Demo Archetype First

Never force every product video into one template. Pick the archetype that matches the decision the audience needs to make; if ambiguous, offer 2 options with a recommendation.

| Archetype | Target duration | Decision it serves | Joplo structure | Content priority |
|---|---|---|---|---|
| **Concept Demo** (概念提案) | 60–120 s | *Should we build this?* | `work() + chapter()` or single-option `feature()` | Context → sharp Problem → target Outcome → 1 end-to-end workflow |
| **Feature Walkthrough** (方案评审) | 2–5 min | *Is this behavior complete & sound?* | `feature() + work() + flow()` with `cases`, `rules`, `mock()`, `questions` | Happy path + key business rules + failure/timeout/permission recovery + open `question()`s |
| **Design Comparison** (多方案对比) | 2–5 min | *Option A vs Option B — which trade-off do we accept?* | Same `feature` + multiple `works/<a>.tsx`, `works/<b>.tsx` running **identical `cases` & inputs** | Controlled side-by-side divergence on the exact step where A and B behave differently |
| **Release Demo** (发布介绍) | 30–90 s | *What new value can users get today?* | Standalone `work() + chapter()` | Before/after friction removal → core payoff; omit internal edge-case scaffolding |

 Archetype time allocations and beat templates: [demo-archetypes-and-beats.md](references/demo-archetypes-and-beats.md).

## 2. Lead with User State Change, Never Feature Inventory

Anchor the narrative on the six-layer funnel (trim lower layers only when the archetype does not need them):

1. **Context (背景)** — Who is doing what concrete task right now? (`Workspace admin onboarding a contractor before a launch`, never generic `User`).
2. **Problem (阻力)** — Where does the current workflow stall, fail, or waste attention?
3. **Outcome (目标体验)** — What does the world look like once solved? Show or state the target end-state early (Working Backwards) so every subsequent UI element has a clear reason to exist.
4. **Workflow (主流程)** — The thin, concrete end-to-end path from trigger to visible outcome.
5. **Behavior (系统响应与边界)** — Async states, permissions, retries, timeouts, duplicates, and cross-system architecture flows (`pulse()` / `setStatus()` on manual boards, or `trace()` on sequences / opt-in diagrams; `mock()` + `response()` written once and exercised across `flow({ api })` slices).
6. **Decision (待拍板分歧)** — Explicit `question()` items or A/B trade-offs that require human sign-off.

**Time budget rule**: Never spend equal seconds on every step. Skip or compress low-information mechanics (login, opening menus, boilerplate form fields); spend 60%+ of dwell time on contested business rules, high-risk state transitions, and recovery behavior.

## 3. Enforce the Atomic Beat Unit: `Action → Reaction → Meaning`

Every step or tight 2-step beat in a product demo must close all three links:

- **Action**: What the user or external trigger concretely did (`.click`, `.type`, incoming webhook/timeout).
- **Reaction**: How interface and system state visibly changed (`set`, `push`, `toast`, `pulse` / `setStatus` / `trace`, status transition).
- **Meaning**: *Why this change matters to the user or business rule* — expressed concisely via `explain()`, `narrate()`, or an unmistakable on-screen consequence (for example, `"人工确认后任务从断点继续，无需重跑前四步"`), never parroting `"用户点击了批准按钮"`.

When a system transition is visually rich (multi-service `pulse()` / `trace()`, state-machine guard, or cross-role handoff), apply `visual-explanation`: cue where to look, hold a brief `narrate(false)` observation beat while the transition plays out, then state the meaning.

## 4. Pre-Code Planning Contract (Lightweight Beat Brief)

Before writing TSX, align a compact plan (in your reply for small scope, or `BEAT_SHEET.md` when multi-slice):
1. **Archetype & Audience Decision**: Which of the 4 archetypes, who reviews it, and what they decide after watching.
2. **Concrete Cast & Scenario Data**: Named role(s), realistic domain inputs (no `foo`, `test123`, `Lorem ipsum`), and explicit `ai_assumption` markers (`origin: 'ai_assumption', status: 'pending'`) on any unconfirmed rule.
3. **Slice & Beat Table**: Per slice — `Given → When (Action → Reaction → Meaning) → Then (expected)` + estimated seconds.
4. **Open Decisions (`questions`)**: 1–3 concrete trade-offs surfaced by the flow.

## 5. Verification & Comprehension Handoff

1. Run `npx joplo check` (0 errors), `npx joplo outline`, storyboard/film visual checks (`visual-explanation`), and a 30-second live browser smoke test.
2. Start the live review listener (`npx joplo feedback watch <dir> --local --follow --json`, with `--once` if yielding the turn) before sharing the `joplo dev` board URL (`joplo` / `joplo-feedback` skill contract).
3. Alongside the board link, state in 3–4 plain lines what the demo proves and **the exact open decision(s)** reviewers should weigh in on (Comprehension Check: user goal, key system reaction, failure handling, open decision).
