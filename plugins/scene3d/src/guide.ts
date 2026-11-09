export const skill = `## When to use
A spatial product: smart home, retail shelf, factory line, data center, venue map, a physical device. The 3D view shows where things are and what changed; the rest of the screen (app UI, captions) stays normal Joplo components. Prefer ordinary components when space does not matter.

## Minimal example
\`\`\`tsx
import { $ } from '@joplo-app/kit';
import { Scene3D } from 'joplo-plugin-scene3d';

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
- Object and Target must be direct children of Scene3D (PLUGIN_PARENT); other components inside Scene3D are ignored.
- Dragging orbits locally. A scripted orbit uses .act('scene3d:rotate', 'home', { azimuth: 90, elevation: 32 }, set($.ui.azimuth, 90), set($.ui.elevation, 32)); bind these state paths to Scene3D azimuth/elevation for deterministic replay and screenshots. Matching tolerates 6 degrees; the demonstrator samples the engine clock. Arrow keys orbit too (Shift = fine adjustment). Playing/resetting discards an audience orbit.
- Free device reactions use option({ free: { light: free.click('lamp', set($.data.lamp, false)) } }). A matching next action or another reachable scenario takes priority; the first stage input during playback pauses and applies immediately, including the same orbit drag or arrow key. Hover never pauses.
- Do not put text inside the scene to explain things; use captions, callout() on the object, or the surrounding UI.

For real GLB geometry read npx joplo skill scene3d/models.
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

asset paths are relative to the calling source file. A local-generation plugin's resource reference also works as src. Read that plugin's guide for generation, cost confirmation and recovery. Commit model files and their metadata; a missing model must never silently trigger paid generation during check/build/render.

size is a bounding fit preserving the original aspect ratio; at is bottom-center with Y up; rotate is degrees around Y. Keep the original textures by omitting color; color explicitly tints the material with a theme role or CSS color. outline defaults true; turn it off for smooth textured assets to avoid distracting triangle edges. lit, visibility, disabled state, label and showLabel work with state. Material tint and outlines follow theme changes.

Each model is interactive: use a click step, free reaction, disabledReason or unmodeled. It must be a direct child of Scene3D. focus, shot, spotlight and callout target its id. Drag/arrow keys orbit the scene; scripted rotation uses scene3d:rotate targeting the Scene3D id. A model drag reports the existing drag action; bind its at to state to show a deterministic position change. Free experience resets on play/jump/reset.

The loader supports embedded textures and meshopt geometry compression without external decoder URLs. It holds screenshot/export readiness until its first model frame is drawn; changing src or unmounting releases obsolete holds and disposes geometry/textures. Corrupt, missing, external-buffer GLB and unsupported formats show MODEL_LOAD_FAILED and a readable box; restore/re-export the GLB, then reload. Draco/KTX2 compressed assets are not enabled—re-export with embedded ordinary textures and meshopt or uncompressed geometry.

Keep web geometry around 10k–50k faces and GLB below 5 MB. Inspect actual GLB accessor/index counts and bytes; a generation parameter alone is not proof of the exported budget. Models above 5 MB warn, above 50 MB fail. Check the initial frame and a focused frame, then open the build via file:// with networking disabled. A GLB download succeeding alone does not prove texture, anchoring or camera fit.
`;
