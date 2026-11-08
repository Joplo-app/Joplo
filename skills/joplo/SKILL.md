---
name: joplo
description: Build clickable, replayable feature demos with Joplo (scripted scenarios in TSX, viewed in a local board) when the user wants a feature prototype, an interactive or clickable demo, an A/B comparison of options or edge cases, or a demo for product, design, or review (功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示), including in a repo without joplo.config.ts, but not for slide decks or PPT.
---
# Joplo

Joplo turns a feature idea into a clickable, replayable demo. It is a player for pre-declared scenarios, not a free-form app prototype, and not a slide or PPT tool: you write the screens and scripted scenarios in TSX, the local board plays them step by step, and reviewers compare options and leave feedback.
Structure: a project has features; a feature has options (alternative designs, A/B) and cases (edge cases to cover); an option plays scenarios; a scenario is a list of steps.
A step is one user action (.click / .type / .select / .press) or system event plus its visible effects (set, toast, go, done). Results and errors come from these effects, not from real logic or a backend.
Viewers advance by clicking the highlighted element (other clicks only show a hint). Inputs show the sample value the step types; viewers cannot type their own, but the board's native feedback panel accepts real reviewer text.
Options and cases are compared in the local board; only the picked option is published.

## When to use
- The user wants to think a feature through before building it: a prototype, a clickable demo, A/B options, edge cases, or a walkthrough for product, design, or review.
- The user wants to compare how a feature changed between two versions or in a PR (see npx joplo skill diff).

## When not to use
- Production UI code or real backends: Joplo demos are scripted; nothing runs real logic.
- Demos where viewers must type their own free input.
- Slide decks, pitch decks, or text-and-bullet presentations with no product behavior to show: use a slides tool instead.

## Quick start
```sh
npx joplo@latest init demo && cd demo && npm install   # new project (an existing project uses its installed npx joplo)
npx joplo check                                        # compile and validate; fix until 0 errors
npx joplo dev                                          # stdout: the board URL; stderr: the feedback command for agents
npx joplo feedback watch . --local --follow --json     # in its own long-running shell: reviewer feedback as NDJSON
```
Run dev and the follower in separate long-running shells. dev keeps the board live: every saved edit recompiles and refreshes it.

## Workflow
1. No joplo.config.ts yet: npx joplo@latest init <dir>, or npx joplo@latest init . for the current directory, then npm install there (versions are pinned). Agent and Git files (.git, .gitignore, .agents, .claude, AGENTS.md, skills-lock.json) do not count as content; other existing files need init . --keep, which only adds missing files. init skips these skills when the same version is already installed and never overwrites edited ones. In an existing Joplo project, use its installed npx joplo.
2. Read npx joplo skill authoring; read cases before asking the user about edge cases; demo and components as needed.
3. Plan before coding (npx joplo skill story): audience, one to three points, one line per scenario (Given → When → Then, how it opens and ends; a case's expected is its Then); show the plan to the user. A demo is a story, not a feature tour.
4. With minimal code, write one happy path and one error-and-recovery scenario.
5. Run npx joplo check, then npx joplo dev; confirm typing, clicks, and layers really behave as intended in the board.
6. Extend to every option and every case agreed with the user; run check until 0 errors.
7. Required after every round of development: before handing off, read npx joplo skill review and start npx joplo feedback watch [dir] --local --follow --json in its own shell (joplo dev prints this exact command); only then give the user the board URL dev printed. Never hand off with only a URL, and never end your response without a running watcher (use --once below). While they test, read its output with short waits (about 1–5s) and acknowledge each feedback right away; do not wait for approval or process exit. If you end your response while they test, add --once so the watcher exits (and wakes a host that resumes on background exit) on the first event, then resume with --since. Receive and apply review results with the joplo-feedback skill.
8. Only when the user asks to share or publish: npx joplo share --format json publishes picked options; npx joplo share --review publishes every option for reviewers. Confirming an option in the board is not a publish request. To share part of the project, add --scenario <scenario id> or --feature <feature id> (repeatable): everything else stays out of the uploaded files; tell the user about any data.scope.borrowed items.

## Show the product, not slides
Every step is an action on the product and a visible change it causes. If a step could be a bullet on a slide, rebuild it as interface, state, or a trace.
- Feature: not a card listing "enter email / teammate gets a link / joins today"; instead Ana types the email, clicks Send, the row appears as Pending, then Leo's layer opens the mail and lands in the space.
- Backend or architecture: not a card "App → API → Queue → Worker"; instead a Diagram where trace() lights each hop as the request moves and trace.fail() shows where it breaks, beside the UI whose status changes with it.
- Comparison: not a pros-and-cons table; instead options A and B each playing the same scenario, compared in the board.
- State or lifecycle: not a paragraph explaining statuses; instead a StateMachine whose current state moves as the user acts.
- Cards only open, close, jump in time, or switch roles; text that explains belongs in captions and explain(). Worked example: npx joplo skill story.

## Review live with the user
Required: whenever you finish a round of development the user will look at, start the follower below before handing off, even for small changes and even if the user did not ask for a review. A hand-off without a running watcher loses their feedback.
The user reviews in the board: they click through scenarios, write comments with the board's native feedback icon, and may confirm (approve) an option. You receive each event the moment it is saved.
1. Start npx joplo feedback watch <dir> --local --follow --json in its own long-running shell (joplo dev prints this exact command; the board's feedback panel can copy it too). One follower covers every option of the project and attaches by itself to the new round each source edit opens.
2. Then give the user the board URL that dev printed (do not assume port 4790) and point them to the native feedback icon. If they want to drive the UI themselves, only give the link.
3. While they test, read the follower's output with short waits (about 1–5 seconds). Each stdout line is one JSON event (feedback, approved, closed) carrying eventId, optionId, sessionId and context (route, scenario, step, source); deduplicate by eventId. A background shell alone does not wake an idle agent: stay in a receive loop, and do not claim you are still listening after ending your response unless the host can resume you.
   - If you will end your response while the user tests, and your host wakes you when a background command finishes (Claude Code does): run the follower in the background with --once added. It exits 0 on the first feedback or approval, which wakes you. Handle the events, then start it again with --since <createdAt of the last event> (the exit message prints this exact command) so nothing is replayed or lost. Without such a host, tell the user to message you after they confirm.
4. On feedback, acknowledge the actual text and its page/step right away, in the reviewer's language, then keep listening. Change the demo only when the user asked for changes; after edits, run npx joplo check. closed (source_changed) is then expected and the follower moves to the new round.
5. approved confirms that option version only: it is not proof the feedback was implemented and not permission to publish. The follower ends with exit 1 only when the board stops (restart dev, then the follower) or 130 on Ctrl+C.
Exact-session watching, Share polling, and applying pick / rule / question decisions: joplo-feedback skill and npx joplo skill review.

## Other ways to work together
- Pointing at something: after the user Alt+clicks a board element, run npx joplo selection and edit only that location.
- Designing a product with Joplo itself: keep one project with stable feature IDs and multiple options/scenarios (repository example: examples/joplo). Preserve actual evidence and label historical reconstructions; never invent review or approval history. Public design narration must be curated into visible scenarios because build strips private authoring fields. Details: npx joplo skill authoring.
- CI publication (only when authorized): separate PR comparison previews from the fixed main share, isolate credentials from author-code builds, and verify actual workflow runs after activation. A PR preview is published only while the PR is still open, so do not merge before its comparison link appears. Details: npx joplo skill diff.
- Comparing versions or a PR: read npx joplo skill diff. Preserve stable .key() identities, treat repeated candidates as uncertain, and build two real publish versions. If an embedded player changes scenario independently, use Realign and wait for both target positions before resuming. Use prepare → uncredentialed build → trusted publish only within the user's authorized scope.

## Common pitfalls
- Finishing development is not the end: always start npx joplo feedback watch [dir] --local --follow --json (add --once if you will end your response) before you give the user the board URL, and keep receiving their feedback. See npx joplo skill review.
- when takes a condition, not a boolean: when={eq($.ui.mode, 'code')}, never when={mode === 'code'}; for values known while writing use {flag && <X/>}. See npx joplo skill authoring.
- Only catalog components and the listed HTML tags exist; <br/> is UNKNOWN_COMPONENT, so write 'Line 1\nLine 2' inside <Text>. See npx joplo skill components.
- Every interactive element needs a flow step, disabled={true} with disabledReason, or unmodeled; otherwise check warns UNBOUND_INTERACTIVE. See npx joplo skill check.
- No onClick or other function props: behavior lives in flow steps (.click/.type/.select) and effects (set, push, go, done). See npx joplo skill authoring.
- Full-height layouts squeeze tables and forms: rows exist in the DOM but are cut off on screen; show 5–8 rows or move the table to its own layer. See npx joplo skill demo.
- Deep links use short params ?o=&c=&s=&step=&l= (l is the layer key and pins that layer, so later steps stop switching layers; layer= is ignored); wait for rendering before screenshots. See npx joplo skill demo.
- Rules you assume stay origin ai_assumption, status pending; never mark them confirmed for the user. See npx joplo skill cases.
- Never share or deploy without the user's go-ahead; free share links expire after 7 days. See npx joplo skill publish.

## Reference
npx joplo skill <topic> prints guidance matching the installed version; npx joplo skill lists them with line counts.
- authoring: Mental model, first steps, page / option / flow syntax, when conditions, a form example
- story: Plan a demo before coding; PM lens from a need to roles, goal, cases, and scenarios; openings, endings, captions; explainers and news-style demos
- demo: Layers, shots, captions, full-height layout, custom motion and data graphics, deep links, and screenshots
- focus: Guide attention: one focus per step, defaults, spotlight / highlight / callout / numbered / hold / redact
- diagram: Architecture, sequence and state diagrams: domain groups, automatic layout, traces, shot framing
- components: Component catalog, supported HTML tags, line breaks, props, and real images
- cases: Case dimensions: ask the user before starting
- check: Read diagnostics, UNBOUND_INTERACTIVE, and fix the indicated file and line
- selection: Edit only the element selected by the user in the board
- review: Local live feedback, Share polling, prompt acknowledgement, session/version isolation, and recovery
- diff: Compare public feature builds, stable step identity, uncertain matches, isolated PR CI publication
- publish: pick, build, share, review version, feedback write-back, deployment, chapters and phone viewing
npx joplo components <Name> shows a component's props and an example. Pin these skills to a release: npx skills add https://github.com/Joplo-app/Joplo/tree/v<version> (Joplo-app/Joplo@v<version> does not work).
<!-- joplo-skill 0.2.16 sha256:6838b110bf33f5fdac7014c8ad29a75e5ec2e9382717fd6e822d25b568597b51 -->
