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

## 4. Choose the information shape, then the picture
- A number landing; before and after; ranking (bars from zero, length proportional); part of a whole (a strip whose segment widths are the shares); a process (one object going around a loop); misconception then fact; a timeline; a place (tiles or a simple map).
- Similar sentences get different pictures. Labels sit on the thing they name; no legends when a direct label fits.
- Compute numbers in TS from one source (for example probabilities from one set of scores) so every number on screen agrees. Label illustrative numbers on screen ('illustrative'), separate from sourced facts.

## 5. Motion and layout numbers
- Camera moves 1–1.5 s, ease in-out. Object flights 0.9 s ease-out; stagger 60–120 ms (motionDelay); slow a landing pointer to 1.5–2 s (motionMs).
- One primary motion per step; text that is being read does not move.
- Entrances: put @keyframes and classes in themes/<name>.css and use className (staggered with animationDelay). Screenshots, thumbnails, and jumps show the end state. For a typewriter reveal give each character a short linear fade (about 80 ms) with its own delay; a 1 ms steps(1) animation can stay stuck invisible in Chromium.
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
- Play each chapter in the board with Voice on: flights and camera land together, nothing leaves the frame mid-flight, narration finishes before the next step.
- Evidence, not belief: 'it plays' needs check 0 errors plus a run in the board; 'it looks right' needs the rendered frames; 'it is clear' needs captions-only and frames-only passes that both tell the story.
- Tell the user what you could not verify (a real voice on a phone, other window sizes).

## Diagnostics and recovery
- CAMERA_UNKNOWN: the id must exist in a current layer or stage; frame elements inside this Canvas. CAMERA_INVALID: pad 0–2000, zoom 0.1–10, ms 0–10000, finite numbers only.
- PLUGIN_PROPERTY_INVALID: motion is a nonempty string; motionDelay/motionMs are finite numbers 0–10000; screen is boolean. These universal properties are literals, not state bindings. Use separate same-key elements with when for a flight between containers.
- Give each visible object one motion key. Hidden previous locations remain available for a later same-key arrival. Avoid duplicate simultaneously visible keys. Independent translate/scale keeps the author's transform intact.
- Keep camera and FLIP duration together when both move; motionMs explicitly overrides duration, including 0. animate=false cancels an existing flight and renders the final layout.
- A Canvas with no parent height uses its view aspect ratio; with an explicit parent height it fills that parent. A zero-sized parent still needs a layout fix; render reports the measured surface.
- screen only separates direct Canvas children into the fixed overlay. Nested screen props remain ordinary descendants.
- One world per continuous chapter; use flow({ from }) to avoid manually copied end states. The initial frame and every step contain complete compiled drawing snapshots; deep links do not replay plugin logic.
- HAPPY_PATH_ONLY is expected for a main-flow explainer. Do not invent product failures solely to silence it. Review every storyboard and verify animation separately from static renders.
`;

export const patterns = `# content recipes and pitfalls

Common pitfall: For visual explainers, read npx joplo skill content: keep a continuous visual story, storyboard every chapter, and verify playback before claiming it works`;
