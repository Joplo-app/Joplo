---
name: visual-explanation
description: >-
  Translate complex abstract information — algorithms, system architectures,
  protocols, multi-rule workflows, or quantitative trade-offs — into clear
  spatial-kinetic visual explanations in Joplo without degenerating into
  animated slide decks or Bento text cards (复杂信息可视动化、视觉解释、原理动化、反PPT图解).
  Use alongside product-demo-director or explainer-director before writing TSX
  stage/layer view code whenever a beat explains how a mechanism works, how
  state or data transforms, or why a trade-off holds.
---

# Visual Explanation (Kinetic Information Design)

Turn abstract claims, formulas, rules, and system mechanics into **spatial structure + continuous object evolution** so a viewer understands causality by watching the stage, even with subtitles muted.

This skill sits between narrative planning (`product-demo-director` or `explainer-director`) and Joplo TSX authoring (`joplo` + enabled plugin skills). Do not write `<Canvas>`, architecture board (`<ArchNode>`/`<FlowEdge>`), `<Diagram>`, `<Sequence>`, or `<StateMachine>` TSX for a complex piece until every beat has a concrete spatial-kinetic mapping under the five invariants below.

## 1. Pure-Geometry Void Stage — Never Build a "SaaS Dashboard" or Bento Slide

The #1 failure mode of code-generated explainers is wrapping every concept in bordered UI cards, titled panels, and badge soup — making an algorithm look like an enterprise admin console.

Instead, compose like a technical motion designer (pure dark or warm-paper void, `70%+` open negative space, one sculptural geometric figure per shot):

- **Strip outer panel boxes**: float the mechanism directly on the `<Canvas>` background. If a stack of 28 horizontal bars *is* the network, draw the 28 bars — do not put them inside a bordered card with a header bar and subtitle paragraph.
- **One visual subject per camera shot**: space distinct stages far apart on the `<Canvas>` (for example `400+` design px gap between zones) so `camera('zone_a')` frames **only** that single geometric subject in clean negative space, with zero neighboring boxes bleeding into the edges. Reserve the multi-zone map for deliberate overview pullbacks (`camera()`).

| Underlying relationship | Pure geometric form in Joplo | Anti-pattern to reject |
|---|---|---|
| **Network depth, queues, or pipelines** ("how a pass traverses stages or loops") | Stack of thin bars/slots + a single glowing specimen pill (`motion="probe"`) physically traveling through them and looping along an SVG arc | Four bordered dashboard cards saying "Input / Compute / Output" |
| **Per-item compute budget or attention weight** ("easy vs hard tokens, resource allocation") | The actual words/items in a clean row with `1` vs `4` glowing dots (`•`) or proportional ticks directly underneath each item | Formulas or text badges (`"O(N) adaptive compute"`) |
| **Domain boundaries & service calls** ("what talks to what") | **Default**: intentional manual architecture board (`<BoardZone>`/`<ClusterBox>`/`<ArchNode>`/`<Database>`/`<QueuePipe>` + `<FlowEdge>` + `pulse()` / `setStatus()` + authentic `<TechIcon>`s); opt-in auto-layout `<Diagram>` + `trace()` only for dense 15+ node graphs | Bullet list of architecture layers |
| **Time-ordered request/reply** ("in what exact order hops occur") | `<Sequence>` with actors as columns and numbered messages traced row by row | Static prose paragraph describing step 1, step 2, step 3 |
| **Entity lifecycle & guard conditions** | `<StateMachine>` bound to state + transition highlights | Status badge table with text descriptions |
| **Trade-offs & scaling laws** ("weights stay flat while depth grows", "space vs time") | `@joplo-app/plugin-viz` `<BarChart orientation="horizontal">` with `locked: true` invariant bars, or `<ScatterPlot pareto="top-left" />` with automatic Pareto frontier polyline and optimal quadrant tint | A two-column "Pros / Cons" card or hand-rolled `<div>` bars |
| **Before / after quantitative impact** ("CPU −70%, Memory −80%") | `@joplo-app/plugin-viz` `<DeltaBar>` (`variant="ghost"` default curtain-uncover retract with dashed baseline footprint, or `variant="paired"`) + silent observation beat | Abusing `<RatioBar>` (`100% / 100% · 节省 0% / 100%`) or FLIP-squashing text inside a shrinking div |
| **Part-to-whole breakdown, trends, timelines & attribution** | `@joplo-app/plugin-viz`: `<RatioBar>` (true part-to-whole only), `<LineChart>` + `revealTo()`, `<TimeLanes>` + `setCursor()` (narrow-bar external label auto-handled), `<Heatmap>` + `focusDatum('row:...')`, `<Sankey>` (cubic-Bezier ribbons), `<Waterfall>`, `<Radar>` (polygonal web) | Static prose bullets, hand-coded CSS bars, or unscaled horizontal boxes masquerading as flows |

Details and concrete layout recipes: [topology-and-motion.md](references/topology-and-motion.md).

## 2. Anchor on One Concrete Running Instance & Preserve Object Permanence

Abstract nouns (`data`, `context`, `payload`, `items`) force the viewer to simulate the example in working memory.

- **Pick one concrete specimen for the whole piece**: a real 4–6 token sentence, one `¥460` order, one `delete_files` tool call, or one failing request ID. Keep that exact specimen from hook to payoff.
- **Conserve object identity (`motion` key)**: when a sentence splits into tokens, when keys/values extract into a cache slot, or when seats shift between parties, reuse the **same `motion` key** across `when`-switched arrangements so Joplo flies the physical object from its origin to its destination. If the viewer cannot trace where an object came from, causal continuity is broken.

## 3. Scaffold Progressively to Cap Working Memory (Mayer Principles)

Never open a complex scene with every container, node, arrow, and metric already visible.

- **Pre-training before interaction**: introduce the minimal parts first (for example, input rail + model box), run one clean cycle, and only reveal the new structure (for example, the cache rack or billing queue) at the exact beat that motivates it.
- **Single-variable mutation per beat**: change one causal thing per step. If both the input changes and the rule changes in the same frame, split them into two beats.
- **Direct spatial labels, zero legends**: place short labels directly on or beside the object they name. Eliminate color-key legends that force eye saccades across the screen.
- **Strict channel split (eyes watch structure, ears hear *why*)**: when `narrate()` is active, strip full sentences off the stage. On-stage text holds object values, short labels, and state tags (`≤ 12–16` CJK chars); spoken narration supplies intent, causal connectors (`因为 / 但是 / 所以`), and consequences. Never read on-screen paragraphs aloud.

## 4. Encode Meaning in Both Motion and Stillness

Follow strict visual restraint: every movement consumes the viewer's entire attention budget, so zero decorative bounce, spinning icons, or gratuitous transitions.

- **Displacement (`motion` flight)** = transfer of ownership, routing, or storage write.
- **Proportional growth (`grow` / `growUp` / width / count)** = change in magnitude, cost, probability, or pressure, always anchored at zero or a shared baseline.
- **Accent color & pulse** = the single active causal locus of the current beat (keep one primary accent meaning across chapters).
- **Deliberate stillness** = invariance, reuse, locking, or immutability. Contrast what **stays completely still** (cached K/V blocks, locked ledger rows, frozen upstream state) against the **one small piece that moves** (the single newly computed token). Stillness next to motion explains "reuse" faster than any paragraph.

## 5. Choreograph Deliberate Silence Windows ("When to Stop Talking")

Continuous narration during complex visual transitions overloads phonological and visual working memory simultaneously.

Insert an **observation window** whenever a beat contains multi-element FLIP flights, multi-hop `pulse()` or `trace()` flows, a state reversal, or a counter-intuitive proportional shift:
1. **Lead-in beat (orient & point)**: use a short spoken cue telling the viewer *where* to look and *what* to watch for (for example, `"注意看右侧显存槽：旧词元的 K 和 V 会发生什么。"`).
2. **Silent observation beat (`narrate(false)` + `hold(1.8–3.0)`)**: trigger the visual transformation with **no spoken audio**, letting the viewer's eyes follow the flight, lock-in, and meter shift uninterrupted. Keep a concise step title (`≤ 16` CJK chars) for orientation.
3. **Payoff beat (conclude)**: once the visual settles, resume narration to name the takeaway or introduce the next tension (`"旧的纹丝不动，只有新词元算了一次——这就是复用。但代价在下面……"`).

Pace asymmetry: **slow-motion** the first cycle of a new mechanism (`3–4` distinct beats); **fast-forward** repeated cycles once the mental model is formed (`1` compressed beat advancing multiple items with `enterStagger`).

## 6. Falsifiable Verification Gate Before Hand-Off

Run the full audit in [anti-ppt-audit.md](references/anti-ppt-audit.md) before delivering any visual piece:

1. **Muted-Frames Test (`--sheet`)**: render every slice with `npx joplo render --scenario-id <id> --sheet --out <tmp>/sheet.png` and inspect the PNG. Covering captions and narration, a reader must still see *what object changed, where it moved, and how quantities shifted*. Three consecutive frames that only swap text blocks fail the gate — rebuild them as spatial objects.
2. **Blind-Audio Test**: read `narrate()` lines in sequence without pictures. Reject any line that sounds like UI screen-reading (`"左边出现蓝框"`) or flat `"然后……然后……"` chaining.
3. **Film Continuity & Layout Audit**: run `npx joplo render <dir> --scenario-id <first> --film --chain --out <tmp>/film.png` (fix unintended red `CUT`; for long grey `STILL` ≥ 3.0 s during narration, add progressive stage content rather than cosmetic camera drift/nudges, while keeping deliberate reading and observation holds still) and verify zero overlapping labels, clipped containers, or host-chrome collisions (`<Canvas safe={[...]}>`).
4. **30-Second Live Smoke Check**: open the real board/built page in a browser, play through the observation windows and interactive pause states, and confirm zero white screens or console errors.
