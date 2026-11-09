# content recipes and pitfalls

## Museum-film composition
- Collect licensed artwork and a real subject asset first. Let an archival image supply the historical texture and the subject supply the action; use CSS only for framing, gradients and typography. Label illustrative artwork when it is not evidence of the place or event.
- Put the Canvas inside a wrapper with an explicit height (for a board-filling root, height:100%). An auto-height wrapper can remain 800px tall while the board is shorter: exports look correct but lower controls are clipped. Test the actual board at a short height as well as render.
- Keep chapter/source labels as direct screen children when the world camera travels. Nested screen does not escape its parent. Frame a stable hero cluster with a modest pad; an oversized pad may zoom out and expose empty margins instead of producing a close-up.
- Reuse a motion key for the same subject's wrapper across arrangements. For a subject entering a device, establish the device first or in the same step, then shrink and move the subject into its screen. Keep the ending actionable through real forks or controls.
- Match-cut the subject at a chapter boundary while changing its background and sound in that same scripted step. The input stays concrete: click the object, drag it to a visible destination, or choose an explicitly labeled branch. Avoid a slide of historical bullet points.

Common pitfall: For visual explainers, read npx joplo skill content: keep a continuous visual story, storyboard every chapter, and verify playback before claiming it works
<!-- joplo-skill 0.3.0 sha256:106583323fb164239fb8c96e7d77854d0fc7d4b9307035f940a0a95c6b43851b -->
