---
name: joplo
description: Build clickable, replayable feature demos with Joplo (scripted scenarios in TSX, viewed in a local board) when the user wants a feature prototype, an interactive or clickable demo, an A/B comparison of options or edge cases, or a demo for product, design, or review (功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示), including in a repo without joplo.config.ts.
---
# Joplo

Joplo is a player for pre-declared scenarios, not a free-form app prototype.
Inputs show the sample value typed by the current step (read-only); viewers cannot type their own.
Clicking the highlighted element plays the next declared step; other clicks only show a hint.
Results and errors come from scenario effects (set, toast, done), not from real logic or a backend.
Options (A/B) and cases (edge cases) are compared in the local board; only the picked option is published.

## When to use
- The user wants to think a feature through before building it: a prototype, clickable demo, A/B options, edge cases, or a walkthrough for product, design, or review.
- Not for production UI code, real backends, or demos where viewers type free input.

## Workflow
1. No joplo.config.ts yet: npx joplo@latest init <dir>, then npm install in that directory (versions are pinned). In an existing Joplo project, use its installed npx joplo.
2. Read npx joplo skill authoring; read cases before asking the user about edge cases; demo and components as needed.
3. With minimal code, write one happy path and one error-and-recovery scenario.
4. Run npx joplo check, then npx joplo dev; confirm typing, clicks, and layers really behave as intended in the board.
5. Extend to every option and every case agreed with the user; run check until 0 errors.
6. Give the user the board URL and a short list of what to check, then wait for their feedback.
7. After the user agrees: npx joplo share --format json (picked options), or npx joplo share --review for reviewers comparing every option. Apply review results with the joplo-feedback skill.

## Common pitfalls
- when takes a condition, not a boolean: when={eq($.ui.mode, 'code')}, never when={mode === 'code'}; for values known while writing use {flag && <X/>}. See npx joplo skill authoring.
- Only catalog components and the listed HTML tags exist; <br/> is UNKNOWN_COMPONENT, so write 'Line 1\nLine 2' inside <Text>. See npx joplo skill components.
- Every interactive element needs a flow step, disabled={true} with disabledReason, or unmodeled; otherwise check warns UNBOUND_INTERACTIVE. See npx joplo skill check.
- No onClick or other function props: behavior lives in flow steps (.click/.type/.select) and effects (set, push, go, done). See npx joplo skill authoring.
- Full-height layouts squeeze tables and forms: rows exist in the DOM but are cut off on screen; show 5–8 rows or move the table to its own layer. See npx joplo skill demo.
- Deep links use short params ?o=&c=&s=&step=&l= (l is the layer key; layer= is ignored); wait for rendering before screenshots. See npx joplo skill demo.
- Rules you assume stay origin ai_assumption, status pending; never mark them confirmed for the user. See npx joplo skill cases.
- Never share or deploy without the user's go-ahead; free share links expire after 1 hour. See npx joplo skill publish.

Exact APIs: npx joplo skill <topic> prints guidance matching the installed version (authoring, demo, components, cases, check, selection, publish). Run npx joplo skill for the overview.
After the user Alt+clicks a board element, run npx joplo selection and edit only that location.
<!-- joplo-skill 0.2.6 sha256:1a85944ddba6531440255c014f0514ee93386ff5fedda21b9d923cced0df3aa8 -->
