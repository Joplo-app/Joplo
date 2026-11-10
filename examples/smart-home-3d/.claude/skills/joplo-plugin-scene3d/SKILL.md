---
name: joplo-plugin-scene3d
description: "Use the 3D scene plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin scene3d: 3D scene 0.5.0
Interactive 3D scenes (three.js): steps click objects, state drives lights, doors, windows, and the camera
Author package: @joplo-app/plugin-3d
## When to use
A spatial product: smart home, retail shelf, factory line, data center, venue map, a physical device. The 3D view shows where things are and what changed; the rest of the screen (app UI, captions) stays normal Joplo components. Prefer ordinary components when space does not matter.

## Enable
Install @joplo-app/plugin-3d, import its default manifest into joplo.config.ts and add it once to config.plugins. Run npx joplo skill install. The package uses plugin id scene3d for components, actions, skill topics and local resources; the starter intentionally omits it. The /local entry is Node-only; three.js stays in the runtime.

## Minimal example
```tsx
import { $ } from '@joplo-app/kit';
import { Scene3D } from '@joplo-app/plugin-3d';

<Scene3D id="home" height={440} focus={$.ui.focus} label="Living room">
  <Scene3D.Object shape="floor" size={[8, 0.1, 6]} />
  <Scene3D.Object shape="wall" at={[0, 1.5, -3]} size={[8, 3, 0.1]} />
  <Scene3D.Object shape="sofa" at={[-1.5, 0, -1.8]} />
  <Scene3D.Target id="lamp" shape="lamp" at={[2.6, 0, -2.2]} lit={$.data.lampOn} label="Floor lamp" />
  <Scene3D.Target id="window" shape="window" at={[-1, 1.6, -2.95]} open={$.data.windowOpen} label="Window" />
</Scene3D>
```
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
- Free device reactions use work({ free: { light: free.click('lamp', set($.data.lamp, false)) } }). A matching next action or another reachable scenario takes priority; the first stage input during playback pauses and applies immediately, including the same orbit drag or arrow key. Hover never pauses.
- Do not put text inside the scene to explain things; use captions, callout() on the object, or the surrounding UI.

For real GLB geometry read npx joplo skill scene3d/models. For optional model() generation, cost approval and task recovery read npx joplo skill scene3d/generation. Existing GLB rendering needs no key.

- npx joplo skill scene3d/generation: Optional Tripo generation, cost confirmation, persisted models and task recovery
- npx joplo skill scene3d/models: GLB assets, loading readiness, material tint, anchors and offline checks

General engine contracts: npx joplo skill plugins


## Installed references
- [generation](./topics/generation.md): Optional Tripo generation, cost confirmation, persisted models and task recovery
- [models](./topics/models.md): GLB assets, loading readiness, material tint, anchors and offline checks

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.5.0 sha256:d33c5a3e45fbbfd95fbff530d31d1a9f9c38d3299a04f147609079be4e427df5 -->
