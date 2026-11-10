# content recipes and pitfalls

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
- Reference: examples/button-40-years (works/forty.tsx, throughTheButton).

An older variant moves the object out of its interface into a central arrangement before the next chapter catches it (same motion key, exclusive when). It reads as a transfer beat rather than a cut; verify a mid-flight frame in playback because static sheets show only the declared endpoints.

## A continuous object inside playable chapter interfaces
Use one motion key for the recurring object and distinct element ids for its location in each mutually exclusive arrangement. Keep exactly one visible instance. Each interface should contain a real native input or declared local reaction: the same picture must make sense both during playback and after the viewer pauses.

A useful story holds the message or task constant while the surrounding interface changes. The motion gives continuity; the input, menu and result prove the interaction paradigm. Label canned results explicitly when the audience can type arbitrary requests. Do not imply a model or backend computed a result.

For the match-cut transition above, use chapter() default continuation, and the engine's actionEntry: 'after' when a confirmed chapter drag should immediately show the new arrangement. Static storyboards prove layout; observe real playback to verify FLIP travel. If a flight does not appear, check for two visible same-key objects, a replaced Canvas/stage, or a manual jump with animate=false before changing the animation.

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
- Keep the data module, sources and licensed assets; rebuild only the stage and the script. Create the remake as another work in works/<new-key>.tsx and mark the old work draft: true. Both remain accessible locally; only the ready work is published. Use build/share --work <key> to publish just one piece; selecting a draft is an error.
- Before TSX, map each old board to a cluster of one world and each old title card to a camera move. Turn on-screen sentences into labels: the subtitle carries the sentence.
- Then follow the review loop: storyboard every chapter, film-strip the chain until CUT and STILL are gone, and play it in the board. If playback stutters, measure before changing the piece (npx joplo skill demo).

## Pitfalls that make a film feel like slides

## Pitfalls that make a film feel like slides
- Several steps under the same camera() go still once the drift reaches its end: the same target and drift do not restart it, and the film strip marks STILL. Let the camera follow the action (the side where the document lands, the panel that just opened, the end of the chart being discussed) or give the step a new drift.
- camera({ zoom }) is a cap, not a forced zoom. If a cluster's shape does not match the safe area, neighbouring clusters show at the edges. Shape the opening cluster to the frame for a clean thumbnail.
- <br> is not an element; write line breaks as '
' with whiteSpace: 'pre-line'.
- Holds with a frozen camera: drift is on by default; do not turn it off for reading holds — a 1–8 % eased push is enough. If the film strip still marks STILL, the drift is too weak for that framing (flat UI shows little change); raise zoom or add x/y.
- Every element using the same entrance: vary by meaning (section 3b) and stagger with enterDelay; let new things start before old ones finish leaving.
- A whole interface replaced in one frame (when swap without exit/enter) is a hard cut. Give both sides a transition or cover the swap with the subject.
- Whole-screen white/colour flashes over a still picture look like a stalled player; keep the picture moving under any fade.

Common pitfall: For visual explainers, read npx joplo skill content: keep a continuous visual story, storyboard every chapter, film-strip the chain, and verify playback before claiming it works
<!-- joplo-skill 0.6.0 sha256:5338570d78a4e000ae9506ce9faca39da4f4f7919472d09bf0997c6d5d986661 -->
