---
name: joplo
description: Build clickable, replayable feature demos with Joplo (scripted scenarios in TSX, viewed in a local board) when the user wants a feature prototype, an interactive or clickable demo, an A/B comparison of options or edge cases, or a demo for product, design, or review (功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示), including in a repo without joplo.config.ts, but not for slide decks or PPT.
---
# Joplo

Joplo is a player for pre-declared scenarios, not a free-form app prototype.
Its job is to show a product feature working through visuals and motion: the real interface operated step by step, state changing on screen, calls traced through diagrams. It is not a slide or PPT tool.
Inputs show the sample value typed by the current step (read-only); viewers cannot type their own.
Clicking the highlighted element plays the next declared step; other clicks only show a hint.
Results and errors come from scenario effects (set, toast, done), not from real logic or a backend.
Options (A/B) and cases (edge cases) are compared in the local board; only the picked option is published.

## Show the product, not slides
Every step is an action on the product and a visible change it causes. If a step could be a bullet on a slide, rebuild it as interface, state, or a trace.
- Feature: not a card listing "enter email / teammate gets a link / joins today"; instead Ana types the email, clicks Send, the row appears as Pending, then Leo's layer opens the mail and lands in the space.
- Backend or architecture: not a card "App → API → Queue → Worker"; instead a Diagram where trace() lights each hop as the request moves and trace.fail() shows where it breaks, beside the UI whose status changes with it.
- Comparison: not a pros-and-cons table; instead options A and B each playing the same scenario, compared in the board.
- State or lifecycle: not a paragraph explaining statuses; instead a StateMachine whose current state moves as the user acts.
- Cards only open, close, jump in time, or switch roles; text that explains belongs in captions and explain(). Worked example: npx joplo skill story.

## When to use
- The user wants to think a feature through before building it: a prototype, clickable demo, A/B options, edge cases, or a walkthrough for product, design, or review.
- Not for production UI code, real backends, or demos where viewers type free input.
- Not for slide decks, pitch decks, or text-and-bullet presentations: with no product behavior to show, use a slides tool instead.

## Workflow
1. No joplo.config.ts yet: npx joplo@latest init <dir>, or npx joplo@latest init . for the current directory, then npm install there (versions are pinned). Agent and Git files (.git, .gitignore, .agents, .claude, AGENTS.md, skills-lock.json) do not count as content; other existing files need init . --keep, which only adds missing files. init skips these skills when the same version is already installed and never overwrites edited ones. In an existing Joplo project, use its installed npx joplo.
2. Read npx joplo skill authoring; read cases before asking the user about edge cases; demo and components as needed.
3. Plan before coding (npx joplo skill story): audience, one to three points, one line per scenario (Given → When → Then, how it opens and ends; a case's expected is its Then); show the plan to the user. A demo is a story, not a feature tour.
4. With minimal code, write one happy path and one error-and-recovery scenario.
5. Run npx joplo check, then npx joplo dev; confirm typing, clicks, and layers really behave as intended in the board.
6. Extend to every option and every case agreed with the user; run check until 0 errors.
7. Give the user the board URL and a short list of what to check, then wait for their feedback.
8. After the user agrees: npx joplo share --format json (picked options), or npx joplo share --review for reviewers comparing every option. Apply review results with the joplo-feedback skill.

## Common pitfalls
- when takes a condition, not a boolean: when={eq($.ui.mode, 'code')}, never when={mode === 'code'}; for values known while writing use {flag && <X/>}. See npx joplo skill authoring.
- Only catalog components and the listed HTML tags exist; <br/> is UNKNOWN_COMPONENT, so write 'Line 1\nLine 2' inside <Text>. See npx joplo skill components.
- Every interactive element needs a flow step, disabled={true} with disabledReason, or unmodeled; otherwise check warns UNBOUND_INTERACTIVE. See npx joplo skill check.
- No onClick or other function props: behavior lives in flow steps (.click/.type/.select) and effects (set, push, go, done). See npx joplo skill authoring.
- Full-height layouts squeeze tables and forms: rows exist in the DOM but are cut off on screen; show 5–8 rows or move the table to its own layer. See npx joplo skill demo.
- Deep links use short params ?o=&c=&s=&step=&l= (l is the layer key and pins that layer, so later steps stop switching layers; layer= is ignored); wait for rendering before screenshots. See npx joplo skill demo.
- Rules you assume stay origin ai_assumption, status pending; never mark them confirmed for the user. See npx joplo skill cases.
- Never share or deploy without the user's go-ahead; free share links expire after 1 hour. See npx joplo skill publish.

Exact APIs: npx joplo skill <topic> prints guidance matching the installed version (authoring, story, demo, focus, diagram, components, cases, check, selection, publish). Run npx joplo skill for the overview; npx joplo components <Name> shows props and an example.
After the user Alt+clicks a board element, run npx joplo selection and edit only that location.
Pin these skills to a release: npx skills add https://github.com/Joplo-app/Joplo/tree/v<version> (Joplo-app/Joplo@v<version> does not work).
<!-- joplo-skill 0.2.10 sha256:5c5b69c99734353779acd34dbb711da3699e84c28f3eed2feaa96483e04fe19d -->
