# content recipes and pitfalls

## Museum-film composition
- Collect licensed artwork and a real subject asset first. Let an archival image supply the historical texture and the subject supply the action; use CSS only for framing, gradients and typography. Label illustrative artwork when it is not evidence of the place or event.
- Put the Canvas inside a wrapper with an explicit height (for a board-filling root, height:100%). An auto-height wrapper can remain 800px tall while the board is shorter: exports look correct but lower controls are clipped. Test the actual board at a short height as well as render.
- Keep chapter/source labels as direct screen children when the world camera travels. Nested screen does not escape its parent. Frame a stable hero cluster with a modest pad; an oversized pad may zoom out and expose empty margins instead of producing a close-up.
- Reuse a motion key for the same subject's wrapper across arrangements. For a subject entering a device, establish the device first or in the same step, then shrink and move the subject into its screen. Keep the ending actionable through real forks or controls.
- Match-cut the subject at a chapter boundary while changing its background and sound in that same scripted step. The input stays concrete: click the object, drag it to a visible destination, or choose an explicitly labeled branch. Avoid a slide of historical bullet points.

## Shot grammar for a playable short film
Give each chapter a visual arc: establish the whole interface/device, move in on the meaningful input or action, show its result, then pull back. Keep chapter numbers and explanations subordinate to the working surface. Judge text at its final painted size, including Canvas scale and camera zoom, rather than the font-size declaration alone.

Use camera ids for the object that matters. Framing a wide window rarely produces a button close-up; frame the button for anticipation and button plus receipt for the result. Keep those targets inside one visual cluster. A deliberate crop is useful; a required action cropped out of the current frame is a broken shot.

When a whole-stage camera would collide with navigation or titles, put Canvas in a separately sized parent and choose its view to match that picture region. Leave controls in the surrounding layout. screen is appropriate for overlays within the same Canvas view, but cannot reserve space outside that view or change the camera's framing budget.

A recurring object can leave its interface and land in a brief central arrangement before the next chapter catches it. Reuse the same motion key with exclusive when conditions, keep the transfer above device children with explicit stacking, and return the camera wide at the transfer. This creates a visible storyboard beat as well as a real flight; extra title cards do not. Verify a mid-flight frame in playback because static sheets show only the declared endpoints.

## A continuous object inside playable chapter interfaces
Use one motion key for the recurring object and distinct element ids for its location in each mutually exclusive arrangement. Keep exactly one visible instance. Each interface should contain a real native input or declared local reaction: the same picture must make sense both during playback and after the viewer pauses.

A useful story holds the message or task constant while the surrounding interface changes. The motion gives continuity; the input, menu and result prove the interaction paradigm. Label canned results explicitly when the audience can type arbitrary requests. Do not imply a model or backend computed a result.

A chapter transition should own both its state change and its track change. Use from for continuity, and the engine's actionEntry: 'after' when a confirmed chapter drag should immediately show the new arrangement. Static storyboards prove layout; observe real playback to verify FLIP travel. If a flight does not appear, check for two visible same-key objects, a replaced Canvas/stage, or a manual jump with animate=false before changing the animation.

Keep credits and sources outside the animated object area. Render every chapter and inspect the target frame after seeking; then test real typing, first-input pause, hover/touch, reset, continue and cross-chapter confirmation. A menu temporarily covering content is expected while open; verify it closes before the next action needs that content.

Common pitfall: For visual explainers, read npx joplo skill content: keep a continuous visual story, storyboard every chapter, and verify playback before claiming it works
<!-- joplo-skill 0.3.0 sha256:de8ed45d61422d9c1e68e675c69766306cc837278c09006a13fbae3171384430 -->
