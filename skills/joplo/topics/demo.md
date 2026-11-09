# Joplo playback and interaction: demo

The engine renders scripted state at step k, plus disposable local exploration. It schedules plugin presenters on one clock; component drawing and input details belong to installed plugins.

## Playback and free exploration
- The first picture-changing input while playing pauses and applies the same input. Matching the next script action advances once and stays stopped, including before a following system step. It behaves like manual pause followed by that input.
- Declared option.free reactions remain available in build/share and review publications after scope filtering. Verify a non-scripted action in the actual published site, then reset; local effects must disappear without changing timeline state.
- Arbitration: exact next action → reachable other scenario on the same stage (confirm first) → declared free reaction/native local behavior → existing hint. Type, value, target and plugin payload all matter; a bare click cannot complete a typing action.
- Blank/noninteractive clicks only pause, with no local-change notice. Covers/transition cards remain inert. Hover never pauses; while paused it matches normally. Touch tap completing hover follows the click rule.
- Pointerdown pauses immediately and the same drag continues. A declared element drag owns its pointer before stage pan or plugin orbit. The first wheel event pauses and scrolls; keep the burst/inertia in its scroll container before stage zoom.
- Playback controls stay outside stage input. Editing keys stay with a focused editable control. Plugin actions enter the same arbiter; never independently advance the timeline.
- Play, jump, scenario change and reset discard local effects. Screenshots, video, deep links and __JOPLO_STATE__ always read the timeline. Frozen in-flight previews must not paint over accepted local edits; preserve their original anchor for reset/resume.
- Use native controls from installed plugins and read their skills for supported edits. Use option.free for declared secondary reactions; keep lasting results in scripted effects. Test actual inputs, not only autoplay.

## Actions and the shared clock
- Scripted scroll is a timeline projection: returning to an earlier step, resetting, or switching scenarios on the same stage restores the initial scroll baseline and applies only the selected prefix. Test 0 → scrolled step → 0 and a scenario without scrolling. Pausing an in-flight scroll keeps its intermediate position; ordinary render frames must not reset it.
- .drag(target, destination) accepts an element id or stage pixel point; .scroll(target, destination) accepts an element id or content offset. Declare the correct source and endpoint.
- .hover(target, ms) expresses a dwell; .act(name, target, data) uses the enabled plugin's data-only contract. Read its installed skill for field types, ranges, matching tolerance and presentation duration.
- Engine frames expose clock time, speed, running/paused state and gesture progress. Presenters sample it; independent timers must not drive the timeline. Pausing freezes cursor, gestures, media, text and plugin animation together.
- Inputs belonging to another scenario prompt before switching and enter immediately before the matching action. Cancel preserves current exploration; confirm discards it.

## Independent views and focus
- Each layer is an independent view tree, created with components from installed plugins. In an option with layers, the first declared layer is the default initial view; start chooses a route, not a layer. Use flow({ layer }) to choose another declared view, and keep unrelated demonstrations in separate features/options. Layers share state; one layer may show a different role or device. Do not put independent views inside a scaled composite screenshot.
- layer(title, tree, { role?, icon?, viewport? }) declares a layer; icons use the engine's documented layer icon keys. The director follows action targets and explicit shot/cue targets. A system-only scenario stays in its initial layer unless an effect selects another.
- shot(ids...) frames targets; shot() returns to the whole current director layer. Use focus for spotlight/highlight/callout/numbered/redact and hold(seconds) for time to read.
- Start wide, focus only what explains a change, and return wide for the result. A drawing plugin may expose its own framing effect; read its skill instead of using host focus as a substitute.

## Captions and pace
- Caption tells what happened; explain tells why; narrate is spoken presentation. Keep captions short enough to fit (24 CJK characters is the hard guidance limit). Name roles and use narration only where it adds meaning.
- A step's hold controls dwell; narration may extend waiting. The engine estimates spoken time and sequences chapters. Keep a long story in smaller scenarios with from, retaining the previous final state.
- Transition cards mark a real opening/ending/time shift. Most information should change on the view, not arrive as a text deck. Read story and the installed visual plugins' recipes.
- Media is provided by an explicitly configured plugin. A viewer gesture unlocks sound; pause/resume/speed share the clock and narration ducks background audio. Static frames stay silent. Read the plugin skill for resources and production limits.

## Frames, deep links and verification
- outline lists scenario and step ids. Use those ids in render/export; a deep link chooses where viewing starts and is not an access boundary.
- joplo render --scenario-id <id> --step-id <id> --out frame.png renders timeline state. --sheet --columns 3 renders every step with captions/narration; inspect transitions with actual playback as well.
- Fixed render dimensions are a capture size; viewport belongs to page/layer. In a browser wait for fonts and [data-jcamera][data-camera-settled="1"] plus two animation frames. Do not mistake DOM progress for painted pixels.
- Test first input, drag, wheel, hover, keyboard, confirmation cancel/confirm, reset and resumed playback. Compare restored frames and direct jumps with pristine script frames. Explain unverified devices or audio behavior.
- For layout, visual motion, shapes, charts and component APIs use the installed plugin skills. The engine has no built-in component vocabulary.

## Branches, annotations and appearance
- fork(label, scenarioKey) adds a labeled route to another scenario; it does not silently branch automatic playback. Autoplay stays on the main flow until the viewer chooses a fork.
- mark(id, text?, opts?) is an annotation anchored to a stable element. Empty labels are omitted; targets are still validated. Use --jp-annot for annotation color in a theme.
- .press('⌘K', ...effects) models a targetless keyboard step; keep editing keys inside editable elements. Keys and ids are not translated.
- Appearance changes host theme/font/stroke, not state. Follow director keeps framing in sync; a manually selected layer uses that layer until the viewer follows again.
- Custom themes live in themes/<name>.css and define --jp-* tokens; do not change authored data to recolor a view. For component-specific layout, motion and visual variables, read its installed plugin skill.

Related topics: authoring, plugins, focus, review, publish
<!-- joplo-skill 0.2.18 sha256:ab41e42a931fd06e63c760afd447dfa0e7e74ae4ff6abdd026c8a6b1abf3334e -->
