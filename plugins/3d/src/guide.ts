export const skill = `## When to use
A spatial product: smart home, retail shelf, factory line, data center, venue map, a physical device. The 3D view shows where things are and what changed; the rest of the screen (app UI, captions) stays normal Joplo components. Prefer ordinary components when space does not matter.

## Enable
Install @joplo-app/plugin-3d, import its default manifest into joplo.config.ts and add it once to config.plugins. Run npx joplo skill install. The package uses plugin id scene3d for components, actions, skill topics and local resources; the starter intentionally omits it. The /local entry is Node-only; three.js stays in the runtime.

## Minimal example
\`\`\`tsx
import { $ } from '@joplo-app/kit';
import { Scene3D } from '@joplo-app/plugin-3d';

<Scene3D id="home" height={440} focus={$.ui.focus} label="Living room">
  <Scene3D.Object shape="floor" size={[8, 0.1, 6]} />
  <Scene3D.Object shape="wall" at={[0, 1.5, -3]} size={[8, 3, 0.1]} />
  <Scene3D.Object shape="sofa" at={[-1.5, 0, -1.8]} />
  <Scene3D.Target id="lamp" shape="lamp" at={[2.6, 0, -2.2]} lit={$.data.lampOn} label="Floor lamp" />
  <Scene3D.Target id="window" shape="window" at={[-1, 1.6, -2.95]} open={$.data.windowOpen} label="Window" />
</Scene3D>
\`\`\`
Then in the option's flow: .click('lamp', 'Turn the lamp on', set($.data.lampOn, true), set($.ui.focus, 'lamp')).

## Coordinates and sizes
- Units are meters; y is up; the floor is y = 0. at is the bottom center of the object (for wall and window: the center). Keep scenes within about 10 × 8 m.
- size overrides the preset size. Presets: floor 6×0.1×6, wall 6×3×0.1, lamp 0.5×1.7×0.5, door 0.9×2.1×0.08, window 1.4×1.1×0.08, sofa 2×0.8×0.9, table 1.2×0.75×0.8, bed 1.6×0.6×2.1, tv 1.4×0.85×0.08 (wall mounted, at is its center), plant 0.5×1×0.5, speaker 0.3×0.5×0.3, ac 0.9×0.3×0.25 (wall mounted, at is its center).
- color: a theme color name (surface, subtle, line, ink, muted, accent, info, ok, warn, danger) or a CSS color; the default follows the theme, so the scene matches every theme.

## State and steps
- lit (lamp glows, tv and ac screens light up, other shapes glow), open (door and window swing open), color, label, and when may all bind state; set() in a step changes the scene. Disabled targets are drawn faded and show their disabledReason when clicked.
- focus={$.ui.focus}: set($.ui.focus, 'lamp') moves the 3D camera to that object over about 0.7s; set($.ui.focus, null) shows the whole scene again. Use it once per step with the step's subject.
- The Joplo camera, spotlight(), mark(), callout(), and shot() also work on Target and Object ids: they use the object's position on screen.

## Pitfalls
- Every Target needs a step, disabled + disabledReason, or unmodeled (UNBOUND_INTERACTIVE). Decorative items are Object, not Target.
- Scene3D is the JSX export; the catalog name is scene3d:Scene. Use joplo components scene3d:Scene scene3d:Model when looking up props.
- Object and Target must be direct children of Scene3D (PLUGIN_PARENT); other components inside Scene3D are ignored.
- Dragging orbits locally. A scripted orbit uses .act('scene3d:rotate', 'home', { azimuth: 90, elevation: 32 }, set($.ui.azimuth, 90), set($.ui.elevation, 32)); bind these state paths to Scene3D azimuth/elevation for deterministic replay and screenshots. Matching tolerates 6 degrees; the demonstrator samples the engine clock. Arrow keys orbit too (Shift = fine adjustment). Playing/resetting discards an audience orbit.
- Free device reactions use option({ free: { light: free.click('lamp', set($.data.lamp, false)) } }). A matching next action or another reachable scenario takes priority; the first stage input during playback pauses and applies immediately, including the same orbit drag or arrow key. Hover never pauses.
- Do not put text inside the scene to explain things; use captions, callout() on the object, or the surrounding UI.

For real GLB geometry read npx joplo skill scene3d/models. For optional model() generation, cost approval and task recovery read npx joplo skill scene3d/generation. Existing GLB rendering needs no key.
`;
export const modelsGuide = `# Real GLB models

Use Scene3D.Model (also exported as Model) for one self-contained binary GLB. First find suitable CC0 models or public-domain images; use a generation plugin for gaps in an original style. Do not hand-write complicated geometry or SVG to replace real assets.

Enable scene3d in config.plugins, import { asset } from '@joplo-app/kit', then write:

\`\`\`tsx
<Scene3D id="scene" focus={$.ui.focus}>
  <Scene3D.Model id="fruit" src={asset('./assets/models/fruit.glb')}
    size={[1, 1, 1]} at={[0, 0, 0]} label="Fruit" outline={false} />
</Scene3D>
\`\`\`

asset paths are relative to the calling source file. The same package exports model() for a declarative generated src. Read npx joplo skill scene3d/generation for cost confirmation and recovery. Commit model files and their metadata; a missing model must never silently trigger paid generation during check/build/render.

size is a bounding fit preserving the original aspect ratio; at is bottom-center with Y up; rotate is degrees around Y. Keep the original textures by omitting color; color explicitly tints the material with a theme role or CSS color. outline defaults true; turn it off for smooth textured assets to avoid distracting triangle edges. lit, visibility, disabled state, label and showLabel work with state. Material tint and outlines follow theme changes. Changing only color reuses the loaded model and textures, without a loading placeholder; removing color restores the original material color. showLabel={false} hides the visible nameplate even for an interactive model, while its labeled anchor remains available for input and accessibility.

Each model is interactive: use a click step, free reaction, disabledReason or unmodeled. It must be a direct child of Scene3D. focus, shot, spotlight and callout target its id. Drag/arrow keys orbit the scene; scripted rotation uses scene3d:rotate targeting the Scene3D id. A paused raycast hover honors the author-declared .hover/free.hover dwell; moving away cancels it. Hover during playback never pauses or fires. Provide a click button for touch/keyboard audiences. A model drag reports the existing drag action, and may land on a named ordinary DOM target outside the 3D canvas; bind its at to state to show a deterministic position change. Free experience resets on play/jump/reset.

The loader supports embedded textures and meshopt geometry compression without external decoder URLs. It holds screenshot/export readiness until its first model frame is drawn; changing src or unmounting releases obsolete holds and disposes geometry/textures. Corrupt, missing, external-buffer GLB and unsupported formats show MODEL_LOAD_FAILED and a readable box; restore/re-export the GLB, then reload. Draco/KTX2 compressed assets are not enabled—re-export with embedded ordinary textures and meshopt or uncompressed geometry.

## A model over archival artwork
- Scene3D clears to transparent. Put the licensed Image and a legibility gradient behind it as siblings; never put a 2D background or labels inside Scene3D. Its children must be declared scene objects/models.
- Keep one model centered at the same screen position across an era change, and swap the visible model while changing the background and score. This is a model replacement, not geometric morphing. Use one visible subject and sparse surrounding text.
- For a film close-up, use the enclosing content Canvas camera. Scene3D focus gives a contextual view of an object and is not a fixed zoom multiplier; with only one object it can be wider than the whole-scene framing. Inspect both frames instead of guessing from the focus id.
- For a whole-object flight or drop, animate a stable wrapper with the content plugin's motion property. Changing a model's structural at/size/src rebuilds it; do not expect vertex morphs or physical gravity. Keep a static frame target so screenshots and direct jumps still match.
- Check mouse rotation, keyboard arrows, a declared object drag, hover, and a click independently. A declared model drag takes priority over orbit; drag empty canvas to rotate that scene. Reset/play discard local orbit, but snapshots always read scripted angles.

Keep web geometry around 10k–50k faces and GLB below 5 MB. Inspect actual GLB accessor/index counts and bytes; a generation parameter alone is not proof of the exported budget. Models above 5 MB warn, above 50 MB fail. Check the initial frame and a focused frame, then open the build with npx joplo preview and no other network. A GLB download succeeding alone does not prove texture, anchoring or camera fit.
`;

export const generationGuide = `## When to use
First look for suitable CC0 models and public-domain reference images; use Tripo to fill gaps in your own style. Do not hand-write complex geometry or SVG to imitate a model. Do not copy protected character designs or trademarks.

## Start
Install @joplo-app/plugin-3d and enable its default plugin in config.plugins for both rendering and optional generation. Import { model } from '@joplo-app/plugin-3d'; set a model component's src to model('A single red apple, short brown stem, matte skin, original low-poly style, no ground'). Or model({ prompt: 'Description', image: asset('./reference.png') }) for image-to-model. References upload through /v3/files only after confirmation; use PNG/JPEG (asset() limits images to 2 MB; the upload API allows up to 20 MB), with one clearly separated subject.

Run npx joplo resources --dry-run to inspect each estimate. Then npx joplo resources asks before each generation in a terminal; unattended runs require --allow-spend. Check/build/render never generate, even with a key. Missing output stays a readable placeholder with a diagnostic. Never add credentials to model() or project config.

## A small, reviewable production batch
- Write assets/SOURCES.md before generating: public-domain/CC0 artwork, the original model prompts that fill the gaps, author/license URLs, intended modifications and a total credit ceiling. A reference painting sets the period; it need not be uploaded when a clear text prompt is sufficient.
- Generate one model first and inspect it in the intended renderer. Check silhouette, orientation, textures, actual bytes and triangles before repeating the settings. Describe a single isolated subject without ground, text or a pedestal when it must sit over a painting. Explicitly avoid protected character or trademark shapes when creating an original interpretation.
- Re-run resources --dry-run before each batch. Sum credits_consumed from successful metadata separately from the estimates and any queued jobs; a timeout with a task_id is a poll/resume, not a new generation request. Keep keys out of command output and the asset ledger.
- face_limit is a generation target, not a byte limit or proof of final triangle count. Textures can dominate even a small mesh. If a model is over the delivery budget, try local texture resizing before paying for a different model: for example glTF Transform resize input.glb output.glb --width 1024 --height 1024. Preserve self-contained ordinary PNG/JPEG textures (or meshopt geometry supported by the renderer); do not choose Draco/KTX2 unless the renderer explicitly supports their decoders.
- Keep the generation JSON with its GLB, record postprocessing in SOURCES.md, and inspect the optimized file again. Do not change the prompt merely to describe that local optimization: that creates a new paid resource identity. Rebuild and test file:// after replacing bytes.

## Geometry and cost
Describe one subject, shape, material and style. Web models usually need 10k–50k faces; default smart_low_poly:true uses 10k and accepts 500–20k. To use 50k, disable smart_low_poly. Model is pinned to v3.1-20260211. Text generation estimates 10 credits untextured / 20 textured; image generation 20 / 30; smart_low_poly adds 10; detailed texture adds 10. pbr requires texture. Inspect the downloaded GLB triangle count and bytes instead of assuming face_limit proves the exported size; any paid decimation is a separate approved operation. Every generation displays the estimate; actual credits_consumed comes from Tripo. Failed/cancelled tasks refund frozen credits according to Tripo; verify the account rather than assuming a local timeout is a refund.

## Persistence and recovery
Commit assets/models/<description-and-parameters-hash>.glb AND its .json metadata. Builds on other machines read that output without a key or network. Changing description, parameters, reference bytes or model version creates a different path. Plugin code updates do not regenerate existing models. Do not store temporary model URLs.

Save a key in the board → Voice → Manage keys → Tripo, or use TRIPO_API_KEY. Saved keys stay in ~/.joplo/plugins/scene3d/keys/tripo.json (0600), never IR or published files. JOPLO_HOME may override the local directory.

A network failure after task_id is saved: rerun resources to poll the same task. A creating/unknown journal: inspect Tripo task history, recover task_id into the matching JSON and set status to queued; never delete the journal and blindly create again. For invalid keys, update the local key. For insufficient credits (2010), stop and tell the user; do not purchase. For moderation (2008), revise the content. For damaged GLB, restore from Git or resume the saved successful task after removing only the damaged GLB. Large models warn at 5 MB and fail at 50 MB; reduce geometry/texture before sharing. Verify the model in the board, screenshot and file:// build before delivery.
`;
