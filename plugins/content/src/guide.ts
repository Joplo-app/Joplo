export const skill = `# Joplo content production: content

For explainers, tutorials, science and news-explainer pieces that should feel like a good video, not a deck: the viewer watches a world change while a voice explains it.
Same machinery as demos: a feature is the episode, each case a chapter, each scenario plays one chapter (the published site plays them back to back), narrate() is the voice-over. Full example: examples/llm-explainer.

Install @joplo-app/plugin-content at the Joplo version; import content and add it to config.plugins. Import { Canvas, camera } from this package; keep flow, patch, narrate and hold from @joplo-app/kit. Use theme: 'content:studio' for the bundled CSS. No plugin is implicitly enabled.

## 1. Before TSX: package and plan within the agreed scope
- One thing the viewer should be able to repeat afterwards, in one sentence.
- Package first: the title asks the question; a thumbnail line of at most five words gives the surprising answer (complement the title, never repeat it); flow({ description }) is the cover sentence. The share preview is the first scenario's first frame, so design that frame as a thumbnail: one big line, one focal object, high contrast.
- If the framing is unresolved, offer two or three devices (one running example, misconception then correction, a number made tangible, before and after) with a recommendation. Reuse an already agreed design; do not repeat approval rounds the user has waived.
- Chapters: one question per chapter. Case titles are numbered questions ('01 What does it actually read?'); expected is what the viewer can now say. List every point from the source material and map each to a chapter or drop it on purpose.
- One running example through every chapter (the same prompt, person, or data set), so each chapter builds on what the viewer already saw.
- Write the script as one line per step: ears (narrate), eyes (what changes on stage), source. Adjacent steps should connect with 'but' or 'so'; a chain of 'and then' is flat.
- Budget: narration reads about 4.5 CJK characters (2.5 English words) per second; 45–90 s per chapter. About 400 CJK characters can already exceed 90 seconds. npx joplo outline counts narration in its estimates.

## Asset-first preparation
Before building a device, historical interface or illustrated object, make an asset list. Prefer a suitable licensed library, icon set or model; do not hand-write complex SVG or build a model merely because JSX can draw it. Verify the actual asset license, collect files in assets/, retain licenses and record author, URL and modifications in assets/SOURCES.md. Historical facts and historical appearance are separate evidence: label stylized reconstructions and invented messages, and avoid copied logos/system icons. Use original work only when a suitable reusable asset is unavailable, keeping it simple.

## 2. Hook (first chapter, 20–35 s)
- Beat 1: a familiar scene that pays off the thumbnail. Never a logo, an agenda, or a definition first.
- Beat 2: the twist, shown on stage (the answer splits into pieces with probabilities, a name changes on the second try).
- Beat 3: pull back and name the questions the episode answers. Pin each question where it will be answered, and close every loop later.

## 3. Not slides: one world, continuous objects, a moving camera (the core)
Failure mode, even with nice graphics: one board per chapter (big title, panels, footer), chapter title cards, cards of bullets, things fading in and out. Viewers read it as a deck. Instead:
- One layer holding one <Canvas w={2560} h={1600}> world (the default view is 1280×800, scaled to fit, never re-laid out; in a container without a height it sizes itself from the view ratio, and render warns 'Canvas has no size' if it still has none). Place a few containers absolutely in design pixels; lay out inside them with flex.
- Objects keep their identity: give each one motion="key". Write each arrangement as static JSX switched with when, reusing the same key; between steps Joplo flies the object from its old place and size to the new one, also across containers. Morph, never replace: the question's words split into tokens, flip into ids, then fly onto a tape; bars rearrange into a lottery strip.
- shot() draws the host focus ring and caps UI zoom at 1.25×; use camera() for traveling inside a Canvas without that ring.
- When another plugin effect also suggests host focus (for example a diagram trace inside a Canvas), use an explicit shot() for the whole director layer if the Canvas camera should own the framing. Otherwise host zoom and Canvas zoom can multiply and push nearby text out of view. Verify the actual visible bounds in playback, not only DOM text.
- Camera: camera('id', …) frames those elements (Joplo measures them, adds pad, caps zoom); camera() shows the whole canvas. Establish wide, push in on detail, pull back for the payoff. Object flights in the same step follow the camera's timing, so both land together.
- Chapters continue: flow({ from: 'previousKey' }) starts from the previous chapter's last frame (state, camera, director layer). patch($.ui, { … }) changes several values in one step.
- System-only chapters stay on the initial director layer unless camera(), shot(), a cue, or flow({ layer }) selects another layer. Continuing from a chapter inherits its final layer; do not copy its state by hand.
- screen children of the Canvas stay fixed on screen: chapter label, source line, poster, end card.
- Takeaways land on objects (a pinned question flips to '✓ answer'); the recap is a pull back to the whole world. Use .card() only when nothing on stage can carry the moment.
\`\`\`tsx
<Canvas w={2560} h={1600}>
  <div id="tape" style={{ position: 'absolute', left: 120, top: 960, display: 'flex', gap: 8 }}>
    {IDS.map((t, i) => <span when={eq($.ui.at, 'tape')} motion={\`tok_\${i}\`} style={{ background: COLORS[i] }}>{t}</span>)}
  </div>
  <div screen style={{ position: 'absolute', left: 20, top: 16 }}>{$.ui.chapter}</div>
</Canvas>
flow('What does it read?', { from: 'hook' })
  .system('Split', 'Nine characters, seven pieces', patch($.ui, { mode: 'split' }), camera('bubble', { pad: 160 }))
  .system('To the tape', 'It reads these numbers', patch($.ui, { at: 'tape' }), camera('tape', 'meter'))
\`\`\`
- Anti-deck test: three or more steps that only show or hide whole panels, or a frame that is mostly text, means rebuild those steps as objects that move or change.

## 3b. Transitions, drift and the safe area
- enter / exit on any element inside the Canvas (world or screen layer): fade, rise, zoom, shrink, wipe, iris. Timing: enterMs / enterDelay / exitMs / exitDelay (0–10000 ms literals; defaults 600 / 450). Each preset is an "away" pose: enter goes away → the element's own look, exit goes own look → away. So rise enters from below and exits sinking back; zoom lands from slightly larger and exits flying toward the camera; shrink grows from smaller and exits receding; wipe reveals left → right; iris opens from the centre. Set transform-origin in CSS to say where zoom/shrink grow from (a menu from its taskbar, a bubble from its tail).
- enter plays when an element first appears (a new DOM node) during playback; exit plays when when becomes false: a non-interactive ghost copy keeps the last look and animates out, then disappears. Put enter + exit on two exclusive siblings in the same step for a crossfade. A same-motion-key element that flies (FLIP) never also enters or leaves.
- Pick by meaning: fade for a whole-world swap under cover, rise for things that come from below (menus from a taskbar, keyboards, receipts), shrink for windows opening, zoom for something punching toward the viewer, wipe for typed/printed results, iris for a reveal from a point. Keep two or three per piece; do not give every element the same entrance.
- camera(…, { drift }) keeps the camera moving after it lands: a number = zoom factor reached over ms (default 8000), or { zoom, x, y, ms } with x/y in design px; false stops it. <Canvas drift={…}> sets the default for every step; without either, a subtle 4 % / 8 s push applies. Drift eases in and out and stops at its end point; it freezes on pause, records in video, and screenshots/deep links show the settled frame without drift. The next camera move starts from where the drifting camera actually is.
- <Canvas safe={[top, right, bottom, left]}> (design px) is the part of the view your screen-layer chrome covers. Targeted camera() frames fit inside the rest, and drift zooms around its centre; camera() with no ids still shows the whole world full-bleed.
- UI life inside one interface (a caret blink, a stepped menu drop) can be CSS @keyframes in the project theme: the engine clock samples them, pause freezes them, static frames show their end state.

## 4. Choose the information shape, then the picture
- A number landing; before and after; ranking (bars from zero, length proportional); part of a whole (a strip whose segment widths are the shares); a process (one object going around a loop); misconception then fact; a timeline; a place (tiles or a simple map).
- Similar sentences get different pictures. Labels sit on the thing they name; no legends when a direct label fits.
- Compute numbers in TS from one source (for example probabilities from one set of scores) so every number on screen agrees. Label illustrative numbers on screen ('illustrative'), separate from sourced facts.

## 5. Motion and layout numbers
- Camera moves 1–1.5 s, ease in-out. Object flights 0.9 s ease-out; stagger 60–120 ms (motionDelay); slow a landing pointer to 1.5–2 s (motionMs).
- One primary motion per step; text that is being read does not move.
- Entrances and exits: use enter / exit (section 3b); for effects the presets do not cover put @keyframes and classes in themes/<name>.css and use className (staggered with animationDelay). Screenshots, thumbnails, and jumps show the end state. For a typewriter reveal give each character a short linear fade (about 80 ms) with its own delay; a 1 ms steps(1) animation can stay stuck invisible in Chromium.
- One accent color with a fixed meaning; color means the same thing in every chapter.
- Size text for the frame you show: about 28 design px is the floor at 1× zoom; a wide shot at 0.5× needs 40 or more, or enlarge the labels for that shot (a bigger variant under the same motion key).
- Frame by content (camera ids), not by guessed coordinates. Lay the world out as shot-sized clusters of roughly 16:10 (a machine with its output bars and strip, a chat with its bubbles); a cluster much wider than that leaves half the frame empty however you aim.
- Same subject, same frame: keep one camera for consecutive steps about the same cluster; frame what stays on stage (not a container that has just emptied).

## 6. Narration, captions, numbers
- Caption: what the eye needs, ideally at most 16 CJK characters (24 is the hard limit). narrate(): what a presenter says, one or two sentences (rules: story section 6).
- One number per step, rounded and written as spoken; translate numbers ('one chance in 365'). Pointing words are fine ('look at the dashed line').
- When narration is on, keep on-stage text to labels; do not put the narrated sentence on screen too.

## 7. Facts and sources
- All facts in one data module with source and date; a source line (screen element) per chapter; name studies in narration ('OpenAI, in a 2025 paper, explains …').
- Say only what the source says. Bars start at zero. Separate illustrative values from facts on screen.
- Images: licensed or public domain, credited, CREDITS file next to them (story section 7).

## 8. Ending
- Pull back to the whole world: every pinned question now shows its answer. Then one concrete action the viewer can take right away, as a screen element. Stop once the value lands; no 'thanks for watching'.

## 9. Required: review before handing over
- npx joplo check until 0 errors. HAPPY_PATH_ONLY is expected for explainers whose chapters are all main-flow; do not invent failure scenarios to silence it.
- Storyboard every chapter: npx joplo render --scenario-id <id> --sheet --out board.png prints every step in one image with its caption and narration. Read it frame by frame and assume the first one has problems: half-empty frames, objects cut at the edge, labels overlapping, text too small in wide shots, the chapter label covering content. Fix, then storyboard again.
- Film-strip every chain of chapters: npx joplo render <dir> --scenario-id <first> --film --chain --out film.png. Fix every red CUT (one-frame full-screen change) unless it is your one deliberate cut, and every grey STILL (no visible change for ≥ 1.5 s). The storyboard cannot show either. Engine checklist: npx joplo skill demo, "Make it play like a film".
- Play each chapter in the board with Voice on: flights and camera land together, nothing leaves the frame mid-flight, narration finishes before the next step.
- Evidence, not belief: 'it plays' needs check 0 errors plus a run in the board; 'it looks right' needs the rendered frames; 'it is clear' needs captions-only and frames-only passes that both tell the story.
- Tell the user what you could not verify (a real voice on a phone, other window sizes).

## Diagnostics and recovery
- CAMERA_UNKNOWN: the id must exist in a current layer or stage; frame elements inside this Canvas. CAMERA_INVALID: pad 0–2000, zoom 0.1–10, ms 0–10000, drift false | 0.5–2 | { zoom 0.5–2, x/y −2000–2000, ms 500–60000 }, finite numbers only; <Canvas drift> takes the same values and <Canvas safe> is four numbers 0–2000.
- PLUGIN_PROPERTY_INVALID: motion is a nonempty string; motionDelay/motionMs/enterMs/enterDelay/exitMs/exitDelay are finite numbers 0–10000; screen is boolean; enter/exit are one of fade, rise, zoom, shrink, wipe, iris. These universal properties are literals, not state bindings. Use separate same-key elements with when for a flight between containers.
- Exit ghosts appear only during playback, never in screenshots, thumbnails, deep links, reduced motion or after a jump. They settle instantly (enter jumps to its end, ghosts vanish) on a jump, stop, scene change and the viewer's first input on the stage (a click, key or drag; the player's pause button keeps them frozen), so the input always acts on the final picture. The camera does not settle on input: it freezes where it is. Ghosts carry no id: camera, hints and Alt-click never target them.
- Known limits (0.3.0): put exit on the removed container itself — an exit only on a child of a removed, transformed (scaled) container loses that ancestor's transform for its first frame. An element removed while its enter is still running exits from its base look (a small jump): keep enter shorter than the step. Two elements sharing a motion key with the same layout get neither enter nor exit: use different keys, or change the layout so a flight happens.
- Give each visible object one motion key. Hidden previous locations remain available for a later same-key arrival. Avoid duplicate simultaneously visible keys. Independent translate/scale keeps the author's transform intact.
- Cross-container flights temporarily lift clipping ancestors inside the world and restore their overflow at finish/cancel. During playground edits the flight yields its visual transform to the final usable layout while preserving its animation/time anchor for resume. Do not globally remove device clipping or duplicate the animated control to make it clickable; test first input during a flight.
- Keep camera and FLIP duration together when both move; motionMs explicitly overrides duration, including 0. animate=false cancels an existing flight and renders the final layout.
- A Canvas with no parent height uses its view aspect ratio; with an explicit parent height it fills that parent. A zero-sized parent still needs a layout fix; render reports the measured surface.
- screen only separates direct Canvas children into the fixed overlay. Nested screen props remain ordinary descendants.
- One world per continuous chapter; use flow({ from }) to avoid manually copied end states. The initial frame and every step contain complete compiled drawing snapshots; deep links do not replay plugin logic.
- HAPPY_PATH_ONLY is expected for a main-flow explainer. Do not invent product failures solely to silence it. Review every storyboard and verify animation separately from static renders.
`;

export const patterns = `# content recipes and pitfalls

## Museum-film composition
- Collect licensed artwork and a real subject asset first. Let an archival image supply the historical texture and the subject supply the action; use CSS only for framing, gradients and typography. Label illustrative artwork when it is not evidence of the place or event.
- Put the Canvas inside a wrapper with an explicit height (for a board-filling root, height:100%). An auto-height wrapper can remain 800px tall while the board is shorter: exports look correct but lower controls are clipped. Test the actual board at a short height as well as render.
- Keep chapter/source labels as direct screen children when the world camera travels. Nested screen does not escape its parent. Frame a stable hero cluster with a modest pad; an oversized pad may zoom out and expose empty margins instead of producing a close-up.
- For a subject entering a device, establish the device first or in the same step, then shrink and move the subject into its screen. Keep the ending actionable through real forks or controls. Reuse the stable subject identity described below.
- Match-cut the subject at a chapter boundary while changing its background and sound in that same scripted step. The input stays concrete: click the object, drag it to a visible destination, or choose an explicitly labeled branch. Avoid a slide of historical bullet points.

## Shot grammar for a playable short film
Give each chapter a visual arc: establish the whole interface/device, move in on the meaningful input or action, show its result, then pull back. Keep chapter numbers and explanations subordinate to the working surface. Judge text at its final painted size, including Canvas scale and camera zoom, rather than the font-size declaration alone.

Use camera ids for the object that matters. Framing a wide window rarely produces a button close-up; frame the button for anticipation and button plus receipt for the result. Keep those targets inside one visual cluster. A deliberate crop is useful; a required action cropped out of the current frame is a broken shot.

When a whole-stage camera would collide with navigation or titles, either put Canvas in a separately sized parent whose view matches the picture region (controls stay in the surrounding layout), or go full-bleed: put the title and timeline on the screen layer over the moving picture and give <Canvas safe={[top, right, bottom, left]}> the covered bands so targeted framings land in the clear part. Full-bleed lets a push-in fill the whole frame, which a boxed picture cannot.

## Match cut through the subject (chapter seam)
One sentence: push in until the recurring object fills the frame, swap the world behind it, pull back to reveal the new world.
- Use for: era/place/version changes where one object stays the subject (a button through four decades, a product through iterations). At most one signature seam style per piece; reuse it for every chapter seam.
- Duration and energy: push 1.6–1.9 s, cover held about 1 s (the next action can happen under it), pull-back 2.4–2.8 s; high energy at the swap, calm after.
- Set-up: put every version of the object with its centre on the same world point and add an invisible lens element there; give the versions one motion key so the new one morphs from the old size.
- Beat 1 (end of chapter N): camera('lens', { pad: 0, zoom: 8–9, ms: 1800 }); start the next chapter's music here with fadeMs 2000–2600 (J-cut).
- Beat 2 (first step of chapter N+1): switch the state that swaps the worlds (old interface exit="fade", new interface enter="fade", 800–1000 ms each) and in the same step camera('<new overview>', { ms: 2400–2800 }). The camera curve starts slowly, so the crossfade happens while the object still covers the frame, then the new world opens up. Put the chapter's timeline/scrubber movement and year label change in this same step.
- Keep (do not downgrade): the shared centre point (otherwise the camera whips across the world at 8× and the old ghost slides away), the slow-start pull-back, and exit/enter on whole interfaces rather than on each child.
- Known pitfalls: a fine 1-px checker or hairline pattern behind the object shimmers (moiré) at high zoom — use a low-contrast texture; a deep link or timeline jump to beat 2 lands on the settled overview, which is what a viewer jumping chapters wants; verify the seam in the film strip (no red CUT) and at full size with --frames.
- Reference: examples/button-40-years (features/forty/options/a.tsx, throughTheButton).

An older variant moves the object out of its interface into a central arrangement before the next chapter catches it (same motion key, exclusive when). It reads as a transfer beat rather than a cut; verify a mid-flight frame in playback because static sheets show only the declared endpoints.

## A continuous object inside playable chapter interfaces
Use one motion key for the recurring object and distinct element ids for its location in each mutually exclusive arrangement. Keep exactly one visible instance. Each interface should contain a real native input or declared local reaction: the same picture must make sense both during playback and after the viewer pauses.

A useful story holds the message or task constant while the surrounding interface changes. The motion gives continuity; the input, menu and result prove the interaction paradigm. Label canned results explicitly when the audience can type arbitrary requests. Do not imply a model or backend computed a result.

For the match-cut transition above, use from for continuity, and the engine's actionEntry: 'after' when a confirmed chapter drag should immediately show the new arrangement. Static storyboards prove layout; observe real playback to verify FLIP travel. If a flight does not appear, check for two visible same-key objects, a replaced Canvas/stage, or a manual jump with animate=false before changing the animation.

Keep credits and sources outside the animated object area. Render every chapter and inspect the target frame after seeking; then test real typing, first-input pause, hover/touch, reset, continue and cross-chapter confirmation. A menu temporarily covering content is expected while open; verify it closes before the next action needs that content.

## A news explainer as one map of clusters
For a topic explainer (an election, a policy, a market week), lay the whole episode out as one world of shot-sized clusters before writing steps.
- Grid in narrative order: put clusters that hand over to each other side by side, so the adjacency is the camera route (ballot next to the seat chart, the map above the market it is called back to). A long diagonal move reads as a whip pan; use it once at most.
- Reuse the same graphic across chapters instead of drawing a new board: a seat chart first lights up "up for election", then flips colour with the results, then gives up seats to a later chart. A map marks what is on the ballot, then the results, then is revisited for a later point (go back to one state).
- Pin each opening question on the cluster that will answer it. When a chapter is on that cluster the tag says "now"; at the chapter end it turns into a short answer. Overview shots show a larger variant of the same tags (same motion key), so keep answers to about ten CJK characters and leave room for the large variant beside its cluster.
- Make a number tangible by moving its marks: overlay the subset of marks that the number counts (for example the seats a party lost) with motion-keyed copies, light them up, then show the same keys arranged as a column in another cluster's chart while the camera moves there. The flight and the camera land together. Keep the original marks underneath so the source chart does not get holes, and size the dot grid so one dot equals one unit on the target chart's scale.
- Results that pile up become the recap: a stamp lands large on the document it judges (enter="zoom" with an enterDelay that waits for the document's flight), and on the next step the same motion key moves it into a row of small badges at the bottom. The chapter's summary step is a wide shot of that row, not a bullet card.
- Keep one document object flying between two sides and change its text instead of fading documents in and out; a hidden object that reappears flies from its last location.
- Chrome around the player's own overlays: the subtitle floats at the bottom centre and the step title pops at the top left, so put the chapter label at the top right with the source line under it, and give <Canvas safe> those bands. A closing call to action on the final overview goes at the top too, so it does not cover the answered question tags.
- Cause near, effect far: when the control the viewer acts on (a ballot row) and the thing it changes (a map two clusters away) cannot share one readable frame, split the beat into the action step framed on the control and a system step that moves the camera to the result. Zooming out until both fit (below about 0.6×) makes both unreadable.
- Count-in colour changes: when a chart recolours (seats flipping party), stagger each mark's transition-delay by its distance from the nearest end, so colour grows in from both sides like an election-night tally instead of switching at once.
- Native controls inside a large world (Radio, Checkbox, Select) keep their own small font size; scale the control group with CSS zoom (about 1.3–1.5) rather than restyling its internals, and check the label size in the storyboard.
- Source lines name only sources you actually have. For a rule, cite the rule itself (a constitutional article, a statute); never write "see reports by X" as a guess.

## Remaking a deck-like piece as a film
Symptoms in an existing piece: one board per chapter (label, big title, panels, footer), a title card opening each chapter, hard cuts between layers, an on-screen headline that repeats the caption and the narration, and opening questions that are never closed.
- Keep the data module, sources and licensed assets; rebuild only the stage and the script. Add the remake as a new option and pick it, so the board can compare it with the old one on the same cases.
- Before TSX, map each old board to a cluster of one world and each old title card to a camera move. Turn on-screen sentences into labels: the subtitle carries the sentence.
- Then follow the review loop: storyboard every chapter, film-strip the chain until CUT and STILL are gone, and play it in the board. If playback stutters, measure before changing the piece (npx joplo skill demo).

## Pitfalls that make a film feel like slides

## Pitfalls that make a film feel like slides
- Several steps under the same camera() go still once the drift reaches its end: the same target and drift do not restart it, and the film strip marks STILL. Let the camera follow the action (the side where the document lands, the panel that just opened, the end of the chart being discussed) or give the step a new drift.
- camera({ zoom }) is a cap, not a forced zoom. If a cluster's shape does not match the safe area, neighbouring clusters show at the edges. Shape the opening cluster to the frame for a clean thumbnail.
- <br> is not an element; write line breaks as '\n' with whiteSpace: 'pre-line'.
- Holds with a frozen camera: drift is on by default; do not turn it off for reading holds — a 1–8 % eased push is enough. If the film strip still marks STILL, the drift is too weak for that framing (flat UI shows little change); raise zoom or add x/y.
- Every element using the same entrance: vary by meaning (section 3b) and stagger with enterDelay; let new things start before old ones finish leaving.
- A whole interface replaced in one frame (when swap without exit/enter) is a hard cut. Give both sides a transition or cover the swap with the subject.
- Whole-screen white/colour flashes over a still picture look like a stalled player; keep the picture moving under any fade.

Common pitfall: For visual explainers, read npx joplo skill content: keep a continuous visual story, storyboard every chapter, film-strip the chain, and verify playback before claiming it works`;
