---
name: joplo
description: Author playable, interactive shows with Joplo when the user wants to compare feature options and cases, explain an architecture, call chain or code change, or tell a story, explain news or trace a product's history, and deliver by link or embedded player (功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示、讲解视频、科普、教程、资讯解读), including an A/B comparison, a feature prototype, a clickable demo for product, design, or review, and work in a repo without joplo.config.ts, but not production backends, slide decks, PPT, or editing real video footage.
---
# Joplo

Joplo shows are playable, interactive pieces your agent writes in code: compare feature options, explain how a system runs, or show what happened. Share them by link or embed their player. It is a player for pre-declared scenarios, not a free-form app prototype with persistent data or real backend logic, and not a slide or PPT tool: you write the screens and scripted scenarios in TSX, the local board plays them step by step, and reviewers compare options and leave feedback.
Structure: a project is a portfolio of works; a work has slices (scenarios), and a slice has steps. Every work has a cover and enters the home page. Capabilities combine: feature review groups alternative works (options) with cases, coverage, rules and a pick; sequencing connects chapters; draft keeps a standalone work out of publication.
A step is one user action (.click / .type / .select / .press / .drag / .hover / .scroll / .act) or system event plus its visible effects (set, toast, go, done). Results and errors come from these effects, not from real logic or a backend.
During playback, the first picture-changing stage input pauses and applies that same input. Hover does not pause; blank clicks only pause without an exploration notice. Matching the next action advances the script and stays stopped; another reachable scenario asks to switch (default before the action; actionEntry: 'after' consumes it on confirmation); native controls and declared free reactions change only a local playground. Play, jump, scenario change and reset discard exploration. Screenshots, video and deep links always use scripted state.
work() is the only work entry point. Use work() + chapter() in works/<key>.tsx for a standalone show; compare feature options with feature() + work() in features/<f>/works/<key>.tsx. The UI calls these alternative works options. Both can coexist. Standalone works need no pick; draft: true excludes them from build and share. Publish one entry with --work <key>; feature publication still uses pick.

## When to use
- The user wants to think a feature through before building it: a prototype, a clickable demo, A/B options, edge cases, or a walkthrough for product, design, or review.
- The user wants to compare how a feature changed between two versions or in a PR (see npx joplo skill diff).
- The user wants an explainer, tutorial, science piece, or news explainer that plays like a video (narration, chapters, animated graphics): read .claude/skills/joplo-plugins/SKILL.md and the relevant installed plugin skill first.

## When not to use
- Production UI code or real backends: Joplo demos are scripted; nothing runs real logic.
- Apps that must persist audience edits or execute real backend logic. Local typing and controls are supported only as disposable exploration.
- Slide decks, pitch decks, or text-and-bullet presentations with no product behavior or animated explanation to show: use a slides tool instead.
- Editing real video footage: media plugins add background sound, but Joplo is not a footage editor.

## Quick start
```sh
npx joplo@latest init demo                            # compare feature options (default starter)
# Or: npx joplo@latest init demo --template work        # one standalone show
cd demo && npm install                                # an existing project uses its installed npx joplo
npx joplo check                                        # compile and validate; fix until 0 errors
npx joplo dev                                          # stdout: the board URL; stderr: the feedback command for agents
npx joplo feedback watch . --local --follow --json     # in its own long-running shell: reviewer feedback as NDJSON
```
Templates download from github:Joplo-app/joplo-templates/<name> (default branch, default name starter); new names need no CLI release. Missing names link to https://github.com/Joplo-app/joplo-templates. Templates are maintained manually, separately from releases, for the latest published CLI; older CLIs are not guaranteed. Init fills version placeholders with its own version; for offline recovery use --template <local path>. See npx joplo skill authoring for name priority and download checks.
Run dev and the follower in separate long-running shells. dev keeps the board live: every saved edit recompiles and refreshes it.

## Workflow
1. No joplo.config.ts yet: npx joplo@latest init <dir> for feature comparisons, add --template work for a standalone show, or use . for the current directory, then npm install there (versions are pinned). Agent and Git files (.git, .gitignore, .agents, .claude, AGENTS.md, skills-lock.json) do not count as content; other existing files need init . --keep, which only adds missing files. init skips these skills when the same version is already installed and never overwrites edited ones. In an existing Joplo project, use its installed npx joplo.
2. Choose the starting template: compare feature options with npx joplo init <dir> (or --template starter); make one show people can play, pause and try with npx joplo init <dir> --template work. Bare names select built-ins, never a same-named local directory; use --template ./work for a local folder. Names matching [a-z0-9][a-z0-9-]* select directories in the template repository default branch, without version tags. Init installs engine skills and AGENTS.md, preserving any bundled plugin guides; after installing dependencies run skill install.
3. Read npx joplo skill authoring and choose the capabilities; for feature review read cases before asking the user about edge cases; demo and installed plugin skills as needed.
4. Plan before coding (npx joplo skill story): audience, one to three points, one line per scenario (Given → When → Then, how it opens and ends; a case's expected is its Then); show the plan to the user. A demo is a story, not a feature tour.
5. With minimal code, write one chapter for a standalone work, or one happy path and one error-and-recovery scenario for feature review.
6. Run npx joplo check, then npx joplo dev; confirm typing, clicks, and layers really behave as intended in the board.
7. Extend to every option and every case agreed with the user for feature review, or to the agreed chapters for a standalone work; run check until 0 errors.
8. Required after every round of development: before handing off, read npx joplo skill review and start npx joplo feedback watch [dir] --local --follow --json in its own shell (joplo dev prints this exact command); only then give the user the board URL dev printed. Never hand off with only a URL, and never end your response without a running watcher (use --once below). While they test, read its output with short waits (about 1–5s) and acknowledge each feedback right away; do not wait for approval or process exit. If you end your response while they test, add --once so the watcher exits (and wakes a host that resumes on background exit) on the first event, then resume with --since. Receive and apply review results with the joplo-feedback skill.
9. Only when the user asks to share or publish: npx joplo share --private --no-review --format json publishes picked options; npx joplo share --private --review also publishes a separate, always-private link containing every option for reviewers (data.review.url); data.url is the main link. For scoped review results with data.mode = review, only the private review was published and its link is data.url; read skill publish for this boundary. Confirming an option in the board is not a publish request. To share part of the project, add --scenario <scenario id> or --work <entry key> (repeatable): everything else stays out of the uploaded files; tell the user about any data.scope.borrowed items.

## Show the product, not slides
Every step is an action on the product and a visible change it causes. If a step could be a bullet on a slide, rebuild it as interface, state, or a trace.
- Feature: not a card listing "enter email / teammate gets a link / joins today"; instead Ana types the email, clicks Send, the row appears as Pending, then Leo's layer opens the mail and lands in the space.
- Backend or architecture: not a card "App → API → Queue → Worker"; instead an installed plugin view where each request hop and failure changes on screen, beside the UI whose status changes with it.
- Comparison: not a pros-and-cons table; instead options A and B each playing the same scenario, compared in the board.
- State or lifecycle: not a paragraph explaining statuses; instead a lifecycle view whose current state moves as the user acts.
- Cards only open, close, jump in time, or switch roles; text that explains belongs in captions and explain(). Worked example: npx joplo skill story.

## Review live with the user
Required: whenever you finish a round of development the user will look at, start the follower below before handing off, even for small changes and even if the user did not ask for a review. A hand-off without a running watcher loses their feedback.
The user reviews in the board: they click through scenarios, write comments with the board's native feedback icon, and may confirm (approve) an option. You receive each event the moment it is saved.
1. Start npx joplo feedback watch <dir> --local --follow --json in its own long-running shell (joplo dev prints this exact command; the board's feedback panel can copy it too). One follower covers every option of the project and attaches by itself to the new round each source edit opens.
   Successful dev startup/join registers review rounds before printing the ready link; no browser visit is required. Fix compile errors before starting watch. There is no idle expiry: inspect feedback list --local --all --json for closing reasons. A joined project depends on the original board process; keep its terminal running, or restart dev and watch after it stops.
2. Then give the user the board URL that dev printed (do not assume port 4790) and point them to the native feedback icon. If they want to drive the UI themselves, only give the link.
3. While they test, read the follower's output with short waits (about 1–5 seconds). Each stdout line is one JSON event (feedback, approved, closed) carrying eventId, workId, sessionId and context (route, scenario, step, source); deduplicate by eventId. A background shell alone does not wake an idle agent: stay in a receive loop, and do not claim you are still listening after ending your response unless the host can resume you.
   - If you will end your response while the user tests, and your host wakes you when a background command finishes (a host configured to resume on process exit does): run the follower in the background with --once added. It exits 0 on the first feedback or approval, which wakes you. Handle the events, then start it again with --since <createdAt of the last event> (the exit message prints this exact command) so nothing is replayed or lost. Without such a host, tell the user to message you after they confirm.
4. On feedback, acknowledge the actual text and its page/step right away, in the reviewer's language, then keep listening. Change the demo only when the user asked for changes; after edits, run npx joplo check. closed (source_changed) is then expected and the follower moves to the new round.
5. approved confirms that option version only: it is not proof the feedback was implemented and not permission to publish. The follower ends with exit 1 only when the board stops (restart dev, then the follower) or 130 on Ctrl+C.
Exact-session watching, Share polling, and applying pick / rule / question decisions: joplo-feedback skill and npx joplo skill review.

## Other ways to work together
- Pointing at something: after the user Alt+clicks a board element, run npx joplo selection and edit only that location.
- Designing a product with Joplo itself: keep one project with stable feature IDs and multiple works/scenarios (repository example: examples/joplo). Preserve actual evidence and label historical reconstructions; never invent review or approval history. Public design narration must be curated into visible scenarios because build strips private authoring fields. Details: npx joplo skill authoring.
- CI publication (only when authorized): separate PR comparison previews from the fixed main share, isolate credentials from author-code builds, and verify actual workflow runs after activation. A PR preview is published only while the PR is still open, so do not merge before its comparison link appears. Details: npx joplo skill diff.
- Comparing versions or a PR: read npx joplo skill diff. Preserve stable .key() identities, treat repeated candidates as uncertain, and build two real publish versions. If an embedded player changes scenario independently, use Realign and wait for both target positions before resuming. Use prepare → uncredentialed build → trusted publish only within the user's authorized scope.

## Common pitfalls
- Finishing development is not the end: always start npx joplo feedback watch [dir] --local --follow --json (add --once if you will end your response) before you give the user the board URL, and keep receiving their feedback. See npx joplo skill review.
- when takes a condition, not a boolean: when={eq($.ui.mode, 'code')}, never when={mode === 'code'}; for values known while writing use {flag && <X/>}. See npx joplo skill authoring.
- Every interactive element needs a flow step, disabled={true} with disabledReason, or unmodeled; otherwise check warns UNBOUND_INTERACTIVE. See npx joplo skill check.
- No onClick or other function props: behavior lives in flow steps (.click/.type/.select) and effects (set, push, go, done). See npx joplo skill authoring.
- Full-height layouts squeeze tables and forms: rows exist in the DOM but are cut off on screen; show 5–8 rows or move the table to its own layer. See npx joplo skill demo.
- Deep links use short params ?o=&c=&s=&step=&l= (l is the layer key and pins that layer, so later steps stop switching layers; layer= is ignored); wait for rendering before screenshots. See npx joplo skill demo.
- Rules you assume stay origin ai_assumption, status pending; never mark them confirmed for the user. See npx joplo skill cases.
- CHOICE_REQUIRED (exit 2): ask both publishing questions; never fix it by silently adding --private --no-review, and do not reuse the previous invocation. See npx joplo skill publish.
- Public portfolio work and the always-private review version are two separate links: give reviewers data.review.url, the audience data.url. See npx joplo skill publish.
- Required: before every share, ask the user public or private AND whether to also publish a review version. Never choose for them or reuse a previous choice; CI must pin both flags in its workflow. See npx joplo skill publish.
- Public shares enter the portfolio and search engines: write the project name, description, and feature goals and work summaries as search-result content; exclude unpublished information. See npx joplo skill publish.
- Never invent or set an access password for the user: ask them to type it in their own terminal or set JOPLO_SHARE_PASSWORD; never put passwords in command history, files, or conversation summaries. Private Pro shares accept --password; omit both password flags to preserve protection. See npx joplo skill publish.
- Never share or deploy without the user's go-ahead. Free links no longer expire, but every live share counts toward the account storage; if share fails with QUOTA_EXCEEDED (exit 6), tell the user the numbers and the two links from error.details, never delete their shares yourself. See npx joplo skill publish.
- Joplo Cloud narration spends the user's characters: run npx joplo voice --work <work-id> --dry-run (omit --work for all; --scenario follows continuing predecessors), inspect per-step details, use narrate(false) for silent steps, and tell them the estimate before a large batch; on TTS_QUOTA_EXCEEDED (exit 7) keep what was made, pass on error.details.usageUrl, and never retry in a loop or buy for them. See npx joplo skill publish.
- AiHubMix, OpenAI-compatible gateways and custom HTTP voice providers are gone: VOICE_UNSUPPORTED means ask the user to switch to Joplo Cloud narration, OpenAI or ElevenLabs (old audio still plays and ships); never hand-edit ~/.joplo/voice/profiles.json. See npx joplo skill publish.
- Playing a demo never generates Joplo Cloud narration (it would spend characters): steps without audio use the browser voice until the user clicks Generate missing audio or you run npx joplo voice with their go-ahead. See npx joplo skill publish.
- Re-sharing with the default voice keeps valid local clips plus reusable published clips, even when their voices differ (automatic captions must still match current text in the clip language; stale audio is excluded); an old custom provider named cloud stays unsupported until the user explicitly chooses official Joplo Cloud (use voice.profile: 'Joplo Cloud' when config owns the selection). See npx joplo skill publish.
- HAPPY_PATH_ONLY applies only to feature review: for a standalone explainer use work() + chapter(), with no cases or uses(); do not invent failure scenarios. See npx joplo skill check.
- Required for short films and explainers: static storyboards cannot show hard cuts or frozen pictures. Run npx joplo render <dir> --scenario-id <first chapter> --film --chain, fix every CUT and STILL it reports, and watch --video once before handing over (render supports --viewport/--no-frame, --crop and public --frames-out/--timeline; --video takes --width/--height, --voice, --clean and --srt for publishing; see joplo skill demo). See npx joplo skill demo.
- For multimodal stories, list assets and licenses first, prove one real asset in a playable chapter, then extend the batch within the agreed spending limit. Keep source claims separate from interpretations. See npx joplo skill story.
- For generated binary assets, first look for CC0/public-domain material; use an enabled generation plugin for gaps. Run resources --dry-run before spending; check/build/render never generate paid artifacts. Commit outputs and metadata, keep keys local. See npx joplo skill plugins.
- For background audio use a media plugin: enable it explicitly, read its skill, place play/stop in steps, and verify sound after a viewer gesture; local resource failures are warnings. See npx joplo skill plugins.
- Collect reusable assets before drawing complex visuals; keep source URLs, authors, licenses and changes in assets/SOURCES.md, and verify bundled fonts and samples separately. See npx joplo skill story.
- For audience exploration, use native UI controls or work.free; keep deterministic results in flow steps. Read demo before using drag, hover, scroll or plugin actions. See npx joplo skill demo.
- Components outside the catalog may exist as plugins: install the npm package, add it to config({ plugins }), then read npx joplo skill <plugin id> before writing its components. See npx joplo skill plugins.

## Reference
npx joplo skill <topic> prints guidance matching the installed version; npx joplo skill lists engine and enabled plugin topics. Installed engine references are linked below; plugin guides are indexed in ../joplo-plugins/SKILL.md.
- [authoring](./topics/authoring.md): Works → slices → steps; feature review, chapters, drafts, files, explicit plugins, named local reactions, composable effects, state and conditions; read-only asset usage reports
- [story](./topics/story.md): Plan a show before coding; for feature review start from needs, roles, goals and cases; for explainers and histories plan openings, continuity and captions
- [demo](./topics/demo.md): Scripted playback and local exploration, drag / hover / scroll / plugin actions, confirmed action entries, themes, layers, captions, deep links and screenshots; real-browser layout audits and evidence
- [focus](./topics/focus.md): Guide attention: one focus per step, defaults, spotlight / highlight / callout / numbered / hold / redact
- [cases](./topics/cases.md): Feature-attached works only: cases and coverage; ask the user before starting
- [check](./topics/check.md): Read diagnostics, music duration/markers and timing warnings, UNBOUND_INTERACTIVE, and fix the indicated file and line
- [selection](./topics/selection.md): Edit only the element selected by the user in the board
- [review](./topics/review.md): Local live feedback, Share polling, prompt acknowledgement, session/version isolation, and recovery
- [diff](./topics/diff.md): Compare public feature builds, stable step identity, uncertain matches, isolated PR CI publication
- [publish](./topics/publish.md): Standalone works, drafts, --work scope, feature pick, build, explicit public/private and review choices, portfolios and SEO, Pro passwords, review version, feedback write-back, deployment, chapters and phone viewing, viewers in several languages, narration (Joplo Cloud characters, keys, joplo voice)
- [plugins](./topics/plugins.md): Data-only action contracts, native local behavior, engine-clock presenters; Universal properties, plugin themes, state writes and director targets; Binary assets, explicit paid resource generation, persistent artifacts, media tracks and offline publishing; API v2 immutable hooks, scoped/localized snapshots, shared React and production-package checks
npx joplo components <Name> shows a component's props and an example. Pin these skills to a release: npx skills add https://github.com/Joplo-app/Joplo/tree/v<version> (Joplo-app/Joplo@v<version> does not work).
<!-- joplo-skill 0.7.1 sha256:98c282ff17de8faca2cdfd8540d4a0df1b53b30c0dd18ce52e5072809dfe3e63 -->
