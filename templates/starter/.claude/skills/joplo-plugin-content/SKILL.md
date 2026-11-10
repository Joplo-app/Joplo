---
name: joplo-plugin-content
description: "Use the Visual explainers plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin content: Visual explainers 0.6.0

Author package: @joplo-app/plugin-content
# Joplo content production: content

For explainers, tutorials, science and news-explainer pieces that should feel like a good video, not a deck: the viewer watches a world change while a voice explains it.
Author one standalone work in works/<key>.tsx with work(); put chapter() slices under scenarios and narrate() in their steps. Chapters continue in declaration order by default. Works have covers and enter the project home page; no feature, review cases or pick is needed. Full example: examples/llm-explainer.

Install @joplo-app/plugin-content at the Joplo version; import content and add it to config.plugins. Import { Canvas, camera } from this package; keep work, chapter, patch, narrate and hold from @joplo-app/kit. Use theme: 'content:studio' for the bundled CSS. No plugin is implicitly enabled.

## Minimal work
In a project with content enabled in config.plugins (and the starter's type: module / JSX tsconfig):
```tsx
// works/explainer.tsx
import { work, chapter, narrate } from '@joplo-app/kit';
import { Canvas } from '@joplo-app/plugin-content';
export default work({ title: 'A request in motion', summary: 'Follow one request',
  stage: <Canvas w={1280} h={800} />,
  scenarios: {
    arrival: chapter('A request arrives', { expected: 'Understand where it starts' })
      .system('Arrive', narrate('A request arrives.')),
    response: chapter('The worker responds').system('Respond', narrate('The worker replies.')),
  },
});
```
This is the authoring skeleton; add a visible subject and real changing state before reviewing the film. stage/layers needs no routes/ directory. Use on/routes explicitly when reusing product pages. WORK_INVALID means repair the required fields or slice builders; WORK_SLICES_MIXED means use chapter() consistently; FROM_UNKNOWN lists valid keys; WORK_EMPTY means add your first slice. Keep render/deep-link ids from outline --format json (standalone: explainer.arrival; feature-attached: queue.a.waiting), while --work takes the public entry key.

## 1. Before TSX: package and plan within the agreed scope
- One thing the viewer should be able to repeat afterwards, in one sentence.
- Package first: the title asks the question; a thumbnail line of at most five words gives the surprising answer (complement the title, never repeat it); chapter('Slice title', { description }) is the cover sentence. The share preview is the first scenario's first frame, so design that frame as a thumbnail: one big line, one focal object, high contrast.
- If the framing is unresolved, offer two or three devices (one running example, misconception then correction, a number made tangible, before and after) with a recommendation. Reuse an already agreed design; do not repeat approval rounds the user has waived.
- Chapters: one question per chapter. Chapter titles are questions ('What does it actually read?'); the UI adds their numbers automatically. chapter('Slice title', { expected }) is what the viewer can now say. List every point from the source material and map each to a chapter or drop it on purpose.
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
- Chapters continue: chapter() starts from the previous chapter's last frame (state, camera, director layer) by default. Only use from: null to restart, or from: 'sliceKey' for another predecessor; keep all slices chapter() within this work. patch($.ui, { … }) changes several values in one step.
- System-only chapters stay on the initial director layer unless camera(), shot(), a cue, or chapter('Slice title', { layer }) selects another layer. Continuing from a chapter inherits its final layer; do not copy its state by hand.
- screen children of the Canvas stay fixed on screen: chapter label, source line, poster, end card.
- Takeaways land on objects (a pinned question flips to '✓ answer'); the recap is a pull back to the whole world. Use .card() only when nothing on stage can carry the moment.
```tsx
<Canvas w={2560} h={1600}>
  <div id="tape" style={{ position: 'absolute', left: 120, top: 960, display: 'flex', gap: 8 }}>
    {IDS.map((t, i) => <span when={eq($.ui.at, 'tape')} motion={`tok_${i}`} style={{ background: COLORS[i] }}>{t}</span>)}
  </div>
  <div screen style={{ position: 'absolute', left: 20, top: 16 }}>{$.ui.chapter}</div>
</Canvas>
chapter('What does it read?')
  .system('Split', 'Nine characters, seven pieces', patch($.ui, { mode: 'split' }), camera('bubble', { pad: 160 }))
  .system('To the tape', 'It reads these numbers', patch($.ui, { at: 'tape' }), camera('tape', 'meter'))
```
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
- npx joplo check until 0 errors, then npx joplo outline --work <key>: verify the chapter order, step counts and estimated duration. Standalone works do not run feature coverage or HAPPY_PATH_ONLY checks.
- Storyboard every chapter: npx joplo render --scenario-id <id> --sheet --out board.png prints every step in one image with its caption and narration. Read it frame by frame and assume the first one has problems: half-empty frames, objects cut at the edge, labels overlapping, text too small in wide shots, the chapter label covering content. Fix, then storyboard again.
- Film-strip every chain of chapters: npx joplo render <dir> --scenario-id <first> --film --chain --out film.png. Fix every red CUT (one-frame full-screen change) unless it is your one deliberate cut, and every grey STILL (no visible change for ≥ 1.5 s). The storyboard cannot show either. Engine checklist: npx joplo skill demo, "Make it play like a film".
- Play each chapter in the board with Voice on: flights and camera land together, nothing leaves the frame mid-flight, narration finishes before the next step.
- Evidence, not belief: 'it plays' needs check 0 errors plus a run in the board; 'it looks right' needs the rendered frames; 'it is clear' needs captions-only and frames-only passes that both tell the story.
- Tell the user what you could not verify (a real voice on a phone, other window sizes).

## Migrating an existing script safely
- Freeze the previous dev IR before moving files. Compare all steps, plugin drawing/media snapshots and every stateAt position after migration; a flow-to-chapter rename does not prove the same continuous state, motion or sound.
- A chapter that previously began independently needs from: null. Default continuation carries the previous ui/data/inputs and running music; use it only when the next chapter should inherit that ending.
- Put audience descriptions from feature.roles into audience. Preserve real role() speakers, the role keys used by say(), and config.voice.roles together; verify the chosen voices in playback.
- If the project already has a helper named chapter, rename that helper before importing chapter from the kit.
- Remove manual numbering from the chapter title itself, not every identical string. A transition card or caption may still use the old source text; let i18n missing/stale/unused diagnostics determine which translation keys need changing.
- Inspect a path page before deleting it. A Slot-only/empty wrapper can be removed for stage/layers; reuse actual picture content through explicit on or the work's routes.
- To prove a draft did not publish, search all build artifacts for one complete sentence unique to the old work and absent as a substring of current copy. Keep the old work locally with draft: true; do not rely on the published menu alone.

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
- One world per continuous chapter; use chapter() default continuation to avoid manually copied end states. The initial frame and every step contain complete compiled drawing snapshots; deep links do not replay plugin logic.
- HAPPY_PATH_ONLY belongs to feature review. If an explainer receives it, move the piece to works/<key>.tsx with work()/chapter() and remove its artificial cases; do not invent product failures. Review every storyboard and verify animation separately from static renders.

- npx joplo skill content/patterns: Recipes and individual pitfalls

General engine contracts: npx joplo skill plugins


## Installed references
- [patterns](./topics/patterns.md): Recipes and individual pitfalls

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.6.0 sha256:53b2c8a4ef5642ff1039ff7eaae7ba4fef9c7a4c231a218655c4439678ab3e74 -->
