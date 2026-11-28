# Anti-PPT & Visual Comprehension Audit

Run this checklist before declaring any Joplo explainer or complex demo complete. Any failed item requires structural revision, not copy polishing.

## 1. Hard Structural Rejections (Anti-PPT & Anti-Dashboard Gate)

- [ ] **No SaaS dashboard soup**: Did you wrap geometric concepts inside bordered cards with panel headers, subtitles, and pill badges? Strip the outer boxes — let layer stacks, return arcs, token rows, and proportional bars float directly on clean negative space (`≥ 65%` background void per close-up shot).
- [ ] **No neighbor bleed in close-ups**: In `--sheet`, does a close-up shot accidentally clip half of an adjacent panel at the frame edge? Increase inter-zone spacing (`≥ 360` design px) or tighten `camera()` targets.
- [ ] **No card-swap chapters**: Do 3+ consecutive steps merely hide one text box and show another? If yes, merge into one persistent geometry where objects move, loop, accumulate, or transform in place.
- [ ] **No stage-subtitle echo**: Does any on-stage banner repeat the step's `narrate()` or caption sentence? Strip sentences off the stage; keep only object values, short labels (`≤ 16` CJK chars), and pinned question/answer tags.
- [ ] **No unmotivated first-frame dump**: Does step 0 display more than 2–3 visual groups before the viewer knows what problem is being solved? Hide downstream machinery (`when={...}` or `opacity`) until its beat arrives.
- [ ] **No orphan disappearance**: When an input transforms into an internal representation or cached state, does it fly/morph via a shared `motion` key rather than vanishing while an unrelated box appears elsewhere?
- [ ] **No unlabelled illustrative numbers**: Are schematic numbers clearly marked `示意` / `illustrative` on screen, and separated from cited empirical facts?

## 2. Pacing & Observation Gate

- [ ] **Deliberate silence present**: Does at least the key mechanism or state-transition beat use `narrate(false)` + `hold(...)` (after a pointing cue) so the viewer can watch the motion without competing speech?
- [ ] **Asymmetric dwell**: Do novel mechanisms and trade-off payoffs get noticeably more time (`hold(4–6)` or multi-beat breakdown) than routine setup or repeated iterations?
- [ ] **Pause-and-explore affordance**: Where natural, can a curious viewer pause playback and click/toggle a control (`onClick` or `work.free`) to test a parameter (such as context length, temperature, or failure branch) on the exact same visual model?

## 3. Mechanical & Browser Evidence Gate

- [ ] `npx joplo check` reports `0` errors.
- [ ] `npx joplo render --scenario-id <slice> --sheet` inspected visually for every slice: zero clipped edges, zero overlapping labels, readable text at actual camera zoom, and clean separation from top-left step badge and bottom subtitle bar.
- [ ] `npx joplo render <dir> --scenario-id <first> --film --chain` inspected: zero unintended red `CUT` markers and zero unintended grey `STILL` spans (`≥ 1.5s` dead air without visual settle purpose).
- [ ] Real browser 30-second smoke test: page opens cleanly, playback advances across chapters, pause exploration responds, zero console/page errors.
