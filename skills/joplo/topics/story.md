# Joplo storytelling and planning: story

The PM lens, cases and coverage in this topic apply only to works attached to a feature. General storytelling also applies to standalone work()/chapter() pieces; those do not need review cases.

A demo is a short story a viewer follows without you: who wants what, what gets in the way, what the product does, and the visible result.
It is not a feature tour. Plan it in a few lines before writing TSX, show the plan to the user, then build. Sources: docs/research/storytelling-and-demos.md.

## 1. Show the product working, not slides
Joplo exists to demonstrate product behavior with visuals and motion. It is not a PPT tool: a demo made of text cards and bullet lists has failed, however good the text.
- Every step = Action (a click, typing, an incoming message, a system event) → Reaction (a new row, a status, a toast, a trace, an object moving) → Meaning (why this change matters to the user's goal or mental model). Skipping Meaning leaves viewers watching clicks without knowing what was proved.
- Match the narrative spine to the job: product demos follow user state change (Context → Problem → target Outcome → Workflow → edge Behavior → open Decision); explainers build a mental model (shared premise AND → misconception or bottleneck BUT → mechanism & new trade-off THEREFORE, never a paper's Intro/Method/Results table of contents).
- Show, do not tell: a claim like 'invites are fast' becomes the invite happening on screen; 'the queue absorbs spikes' becomes animated flow packets or a trace through the queue while the UI stays responsive.
- On-screen writing has a supporting role: captions narrate what is on screen, explain() says why it matters, cards only open, close, jump in time, or switch roles.
- Pick the visual by what you prove: UI flow → the product screens; who calls whom → the diagram plugin; time order → sequence view; lifecycle → lifecycle view; two answers → options A/B on the same scenario.
Slide version (wrong): the same points as cards, nothing to operate, nothing changes.
```tsx
flow('Invite by email', { start: '/members' })
  .card('Invite by email', { points: ['Enter an email', 'Teammate gets a link', 'Joins the same day'] })
  .card('Why it matters', { points: ['Faster onboarding', 'Fewer support tickets'] })
```
Product version (right): the same points, proven by the interface.
```tsx
flow('Invite a teammate', { start: '/members' })
  .card('Ana needs Leo in the space today', { sub: 'She is the space admin' })
  .click('btn_invite', 'Ana opens Invite', set($.ui.inviteOpen, true))
  .type('in_email', 'leo@acme.com', 'Ana enters Leo's email')
  .click('btn_send', 'The invite is on its way', set($.ui.inviteOpen, false),
    push($.data.pending, { email: 'leo@acme.com', status: 'Pending' }), toast.success('Invite sent to leo@acme.com'))
  .card('Now Leo', { role: 'leo' })
  .click('mail_join', 'Leo opens the link and lands in the space', go('/space'), done('Leo joins the same day'))
```
Backend behind the same feature: put a diagram layer alongside the UI (prefer intentional manual composition with edge flow pulses and node status updates; use opt-in auto-layout trace() for dense graphs or sequences — see npx joplo skill diagram), then drive it in .system('Send mail', 'The mail job runs in the background', ...) and show the failure plus the error the user sees. Full examples: examples/invite, examples/agent-arch.

## 2. Plan the demo first (write it in your reply; ask only questions that change it, each with a default)
- Audience: who watches (product review, design review, a customer, engineers) and what they must decide afterward.
- One to three points: what viewers must believe after watching. Each point becomes a scenario or an A/B comparison, never a single step.
- Scenario list, one line per scenario: Given (who, where, starting state) → When (the user's actions) → Then (the visible result), plus how it opens and how it ends.
- Length: a scenario is usually 5–12 steps, about 20–60 s at 1×. check flags one over 90 s; npx joplo outline prints every estimate. An estimate is the sum of each step's time plan: the action demonstration (cursor travel, press, typing or a 0.9 s system pause) plus the longer of its stay and its estimated narration, the same plan autoplay runs.
- Minimal Decision Recipe (first reviewable draft in minutes): for a feature decision, do not build every screen, edge case, or voice track up front. Start with **1 thin happy path + 1 failure/recovery path + 1 contested boundary** on the smallest screen that proves the state change; add Option B only when a genuine trade-off needs comparing, and expand the remaining cases only after the reviewer checks the first round in the board.
- Visual role mapping before TSX (compose plugins, avoid raw-HTML decks): inspect .claude/skills/joplo-plugins/SKILL.md and npx joplo components first, then assign each chapter or scenario beat a concrete visual carrier (spatial camera world, system topology, request sequence, lifecycle, statistical chart, key metrics, side-by-side comparison, live source/terminal, or interactive UI). Combine multiple enabled plugins across beats — and install missing companion plugins when needed — rather than repeating plain text panels or hand-built raw HTML boxes. Ground abstract mechanics on one concrete running specimen (one real request, order, or sentence), introduce new structure progressively (one causal change per beat), contrast stillness against motion to show reuse, and keep one visual subject per camera shot.
- Unsure how to frame it? Offer two or three one-line framings and let the user pick.
- Recreating an existing video, GIF or screen recording: read it before planning. Extract frames into contact sheets (for example ffmpeg -i ref.gif -vf "fps=1,tile=3x3" sheet%02d.png, written outside the project) and list its chapters, the states each chapter passes through and every on-screen sentence; those become slices, steps and narration (shared cases only for feature review). Map the reference's own chrome to the player's instead of redrawing it: its chapter label → chapter title (case title in feature review) and the player's step title, its bottom progress → the player's chapter list, its key badge → the host key record after .press(), its spoken captions → narrate()/say(). Ask about anything the reference does not show (chapters cut off, unseen states) instead of inventing it; replace third-party logos with neutral shapes.

## 3. PM lens: from a need to roles, goal, cases, and scenarios
This PM method applies only to works attached to a feature. For a standalone work, plan audience, takeaway and chapters with work()/chapter(); do not invent cases, coverage or rules.
Joplo already has the parts of a user story; fill them in that spirit.
- roles: who it is for, specific ('Workspace admin', 'Invited teammate'), not 'User'. Use role('Name', { desc }) keys when layers or cards belong to a person; plain names are fine otherwise.
- goal (the I want + so that): one sentence, who can do what and why, independent of the solution so options A/B are two answers to it.
  Good: 'Workspace admins invite teammates by email so the team can start working the same day'. Bad: 'Invite button', 'A better invite experience'.
- cases are the acceptance criteria: the title is the Given (the situation), expected is the Then (what the viewer must see), priority is how much it matters.
  Write expected for every high-priority case; it is the line reviewers check the demo against. npx joplo outline lists cases without one.
- rules are the business constraints a Then depends on ('Only admins can invite'); link them to cases and elements, and to steps with uses().
- One scenario = one When and one Then. The steps are the When; the last steps show the Then (a visible state plus done('…')). Several Whens: split the scenario.
- Splitting, in this order: one thin end-to-end happy path (entry → result) first; then one scenario per business-rule variant, data variant, role, and failure.
  Do not split by step (fill in / review / publish): every scenario goes from its entry to a result. More than 5–6 high-priority cases, or two roles with different goals: split the feature.
- Edge cases: walk the eight dimensions (npx joplo skill cases), and ask what if the user does steps out of order, skips an optional step, or comes back later. Each adopted answer is a case with its own expected and a scenario.
- INVEST check per scenario: Independent (its own start state), Valuable (ends on a visible result), Small (fits the length above), Testable (expected says exactly what appears).
- Direction still open? Build only the main scenario of options A and B first; add every case after the user picks.

## 4. Openings, middles, endings
- Opening: the first step or an opening .card('…', { sub }) says who is trying to do what and why, in one sentence. No logo, no 'So you open the app'.
- Middle: each step proves one thing with a visible action and a visible change; the cause must be visible (a click, an incoming message, a time-jump card).
  A screen that changes with no trigger reads as a screensaver. Mock results come from steps: set(), toast(), go().
- Ending: pick one strategy, either stop on the result (done('…') with the result on screen) or a closing .card with points: at most 3–4 short points.
- Transitions: keep something on screen across a change (the same list, the same person); cards only for time jumps, role switches, opening, and ending.
- Where the viewer looks each moment (one focus per step, spotlight, highlight, callout, numbered, hold): npx joplo skill focus; layers and shots: npx joplo skill demo.

## 5. Captions and explain
- One idea per caption, about 24 units (CJK 1, other characters 0.5). Subject + verb, active voice, the visible action first: 'Ana sends the invite', 'The link expires after 7 days'.
- explain (about 48 units) says why it matters or what it means; never repeat the caption.
- System steps are narration of what happened ('The server rejects the address'), not labels ('System event').
- Same name for the same person or thing throughout; button and field names exactly as on screen; no internal ids or API names unless the audience is engineers.
- No filler ('Now let us…', 'a whole new experience'): every sentence does a job. Do not invent numbers or facts; record guesses as ai_assumption rules.
- Cover text: flow('Slice title', { description }) is the cover sentence, 30 units at most (DESCRIPTION_TOO_LONG). The cover falls back to the feature goal.
- Rhythm: every short step waits 3 s, so a run of trivial steps feels like a metronome. Merge trivial steps (type, then click) and give key results an explain.
- Titles, chapters and pacing targets:
  - Internal review work title: 10–18 CJK chars (25–45 Latin chars); put the subject and decision in the first 10–12 CJK chars. External title: 14–22 CJK (35–55 Latin); GitHub README badges truncate at 28 Unicode code points (first 27 + ellipsis), so never open with a series prefix.
  - Linear chapters (2–5 min shows): split into 3–6 chapters of ~25–60 s each (for YouTube chapters keep ≥ 3 chapters and ≥ 10 s each). Name chapters in 4–10 CJK chars (max 14) or 2–5 English words (max 32 chars) with the distinguishing noun first: Action-Outcome ('Retry hits original order') for feature reviews, Question-Hook ('Paid, yet timed out?') for explainers, or Stage-Milestone ('Ledger dedup') for architecture walkthroughs — never generic sets like 'Intro / Principles / Summary'.
  - Step caption vs narration: keep top-left step captions to 4–10 CJK chars (visible state), and spoken narrate() lines to 12–30 CJK chars / 6–18 English words (3–8 s; split above 10 s) explaining *why* without repeating the caption.
  - Six-beat framing grammar (shared across reviews and explainers): Establish wide context → Push in when detail needs magnification → Action → Reaction → Meaning → Silent observation window (reusable helper: const observe = (s = 2.2) => [narrate(false), hold(s)]) → Controlled A/B on identical inputs → Pull back to land the decision or open question.

## 6. Narration: narrate() is a presenter talking, not the caption read aloud
When the board or the published site reads a demo aloud, each step reads, in order of preference: narrate() in the narrator's voice; else say(), the character's own line in that role's voice; else the caption in the narrator's voice (cards read title and sub). Use narrate(false) on a deliberately silent step: it suppresses narration, say(), caption/card fallback and the spoken subtitle; the step title stays visible and voice-paced streams use their normal text speed. narrate('') remains an error, not a silence marker. Without narrate(false), the existing fallback is unchanged. A caption read aloud sounds like a screen reader, so give the steps that will be heard a narrate() line, written the way a person walks a colleague through a feature. It may later be recorded by a real voice, so write how people speak.
- Short first: one sentence, two at most, mostly 3–8 seconds. Cut every word the screen already shows; the viewer is watching.
- Each line does one job: orient (who, where, what we are about to see), point (what to look at now and why it matters), connect (carry the viewer from the last step: 'Now over to Ajie'), or conclude (what this proved).
- Say what the caption cannot: the intent, the reason, the consequence. Never repeat the caption word for word; name an on-screen label only when the viewer must find it.
- Spoken sentences: subject first, active voice, one idea each. Commas and periods are the breaths; no brackets, slashes, arrows, emoji, or markdown.
- Write numbers, money, times, and versions the way they are said in the demo's language ('four hundred sixty' rather than '¥460'; 'version two' rather than 'v2').
- Deliberate observation windows (know when to stop talking): when a step carries a complex visual transition — objects flying into new slots, a multi-hop trace, or coupled quantities shifting — point the viewer's eyes in the preceding beat, then run the visual step with narrate(false) and hold(1.8–3) so spoken words do not compete with visual working memory; resume narration on the next beat to land the takeaway.
- Transitions carry the story: role switches, time jumps, and closing cards need a line that tells the viewer why we moved.
- Plain and concrete, not flowery: no metaphors, slogans, or hype. Vivid means specific: real names, amounts, and times.
- Not every step needs its own line: a trivial step can keep its short caption, and a character's say() can carry a moment ('Count me in!').
- Once a piece will be heard, every step without narrate()/say() reads its caption aloud ('Hover the mic', 'Click Done'), which sounds like a screen reader. Listen for those: merge a hover or setup step into the step that explains it, give a short narrate() to the clicks that stay, or drop steps that only exist to show a tooltip.
- An on-screen headline and narration play together: narrate the point in spoken words (the why, the consequence) rather than reading the headline back, since the subtitle would show the same sentence twice.
- say() is first person, what the character would really say; narration about the characters goes in narrate().
- Who says it: a user action's say() uses the role of the layer it lands on. A system step has no acting person, so it reads in the narrator's voice unless you name the speaker: say('Book it for Friday', { role: 'me' }). Use that for a person talking to the product (voice input, a call, a voice assistant) while the screen reacts in system steps.
- These audio options require matching CLI, Kit and Core versions. An older Kit/Core can ignore unknown narrate/say options and use the normal provider path, so never promise zero provider calls for mixed old packages. Upgrade the toolchain together and run joplo voice --dry-run: supplied lines must show audio: provided and zero estimatedBillableChars before generation. Old strict Cloud readers also need the matching contract upgrade before accepting these new Step fields; build locally until that deployment gate is satisfied.
- Reuse prepared audio with narrate('Presenter words', { audio: asset('./presenter.wav') }) or say('Actor words', { role: 'actor', audio: localResource('voices', 'line', 'existing take') }). The text still drives subtitles and role labels; the selected clip uses the existing narration track and recording/ducking path. Read the resource plugin's skill to prepare its artifact first. A supplied clip never calls a TTS provider and contributes zero generation characters, even if it is missing or invalid; fix the resource diagnostic instead of retrying voice generation. Remote URL strings and file paths are not implicit downloads: use asset() or a localResource() reference. narrate wins over say; narrate(false) suppresses both. With an explicit clip, use one selected narrate/say effect per step; do not concatenate multiple lines around one clip. Audio is literal: translating subtitles does not translate a supplied recording; prepare the matching recording and script for each content language.
- Voice input / dictation: one system step per spoken phrase, say(phrase, { role }) plus stream($.ui.text, fullTextSoFar, { pace: 'voice' }), so the subtitle shows the phrase, the speaker's voice reads it and the transcript grows in step with the voice. Put the presenter's explanation in narrate() on separate steps (pauses, results); one step reads only one line, and narrate() wins over say().
- Open with the person and their goal; close with the one to three points, as speech, not a list read aloud. Write in the demo's language.
Wrong, it reads the interface: .click('share', 'Xiaoyu shares the itinerary', narrate('Click Share to share the itinerary.'))
Right, it says why: .click('share', 'Xiaoyu shares the itinerary', narrate('She sends it as a link, so Ajie needs no app.'))
A character speaking: .click('can_go', 'Ajie replies: I can go', say('Count me in!'))
Check: read every line aloud in order without looking at the screen. It should sound like one person telling one story, briskly.

## 7. Explainers and news-style demos (a topic, not a product)
When the demo explains a topic (an election, a policy, a market move) instead of a product, the rules above still hold: every claim becomes a graphic that changes on screen, never a slide of bullets. The full method (package, hook, a continuous world, morphing objects, work()/chapter() default continuation, review): the installed explainer plugin skill.
- Arc: a hook naming what happened and who it happened to → the rule in about 30 seconds → the reveal (numbers change on screen) → a twist or context (history, base rates) → why it matters to the viewer → a short closing card. Write one chapter() slice per question under work().scenarios; the published site plays continuing chapters back to back without a countdown, like one video.
- Chapter titles are what viewers read in the sidebar: write a question ('What is on the ballot?'), with expected describing what the viewer can now explain. The UI adds chapter numbers; standalone works need no option or cases.
- Graphics that carry the story: pick specialized primitives from your enabled plugins first (check .claude/skills/joplo-plugins/SKILL.md and npx joplo components for topology, sequence, lifecycle, chart, metric, comparison, code/terminal, and spatial camera capabilities); drop down to styled raw elements only for custom kinetic geometry (such as a seat chart filling up or tokens flying) that no enabled plugin covers, plus real licensed photos where evidence matters.
- Facts: keep every number in one data module with its source and as-of time, show a source line on each graphic, separate called or projected results from final ones, and leave out what you cannot verify rather than hedging on screen.
- Collect assets before drawing complex visuals: list the needed interface primitives, fonts, icons and sounds; prefer suitable reusable libraries or licensed assets over hand-built SVG or models. Keep redistributable files in assets/ and record each source URL, author, license and modifications in assets/SOURCES.md; retain license files and show attribution where required. A library license does not automatically establish the license of its bundled fonts, logos or samples. Scope third-party styles and embed required assets for offline playback.
- Photos: use public-domain or properly licensed images, credit them on stage when the license asks, keep a CREDITS file next to them, and strip EXIF / GPS metadata before embedding.
- Follow the audience's conventions and state them in a legend (Chinese stock viewers expect red up, green down).

## Asset-led multimodal stories
- Before TSX, inventory the actual assets: subject, source URL, creator, license, intended crop/tint, and whether the picture is evidence or an illustrative reconstruction. A historic painting of a forest is not a photograph of a specific location. Keep the inventory with the project, and put required attribution on stage.
- Separate a source's narrow claim from a popular retelling and your own interpretation. A wordplay, anecdote or resemblance is not proof of historical causation. If source checking changes the premise, correct narration and interactions together; do not preserve a pleasing but unsupported reveal.
- Choose one persistent visual subject and one question per chapter. Change its material, scale, surroundings and sound at the era boundary; keep reading text still. Write each beat as picture + action + spoken sentence + evidence.
- Start with one real asset and one fully playable chapter. Verify initial framing, a close-up, input, reset and a local build before commissioning a whole batch. Keep a spending ledger separate from estimates, and count the final bytes rather than prompt limits.
- Explicitly distinguish the main sequence from optional branches and return paths. A closing menu may return to earlier chapters without making those chapters optional; verify autoplay order in the published player.

## 8. Before handing over
- npx joplo outline: per entry, standalone slices and duration; for features, who it is for, the goal, each case with its expected result and coverage per work, and each scenario's steps, duration, opening and ending.
- npx joplo check: CAPTION_TOO_LONG, EXPLAIN_TOO_LONG, DESCRIPTION_TOO_LONG, CARD_TEXT_TOO_LONG, SCENARIO_TOO_LONG, HAPPY_PATH_ONLY, CASE_NOT_COVERED (names the expected result).
- Read only the captions from start to end: do they tell the story? Then look only at key frames (npx joplo render --step-id …): does the screen show it without captions?
- If the key frames look like slide thumbnails (mostly cards, bullet points, or a screen that never changes), rebuild those steps as actions and visible changes (section 1).
- Tell the user which cases have no expected result yet and which options do not cover a high-priority case.

Related topics: authoring, cases, demo, focus
<!-- joplo-skill 0.8.2 sha256:0eae25ab9f162fa395c69f7cb11d7a2b884afb673020bbb5bfe06eabb0823169 -->
