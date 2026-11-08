/**
 * joplo-plugin-scene3d 入口（Node 端载入，只返回数据）：插件清单、JSX 标记、给 Agent 读的技能。
 * 画面由 ./runtime.ts（浏览器端，three.js）负责。
 */
import { definePlugin, pluginComponent } from '@joplo-app/kit/plugin';

const SHAPES = 'box, cylinder, sphere, cone, floor, wall, lamp, door, window, sofa, table, bed, tv, plant, speaker, ac';

const plugin = definePlugin({
  id: 'scene3d',
  title: '3D scene',
  version: '0.1.0',
  description: 'Interactive 3D scenes (three.js): steps click objects, state drives lights, doors, windows, and the camera',
  runtime: new URL('./runtime.ts', import.meta.url),
  components: {
    Scene: { doc: 'height (px, default 420), focus (child id or null: the 3D camera frames it), view ("iso" | "front" | "top"), label; root of a 3D scene, viewers drag to orbit' },
    Object: { parent: 'Scene', doc: `shape (${SHAPES}), at [x, y, z], size [w, h, d], rotate (degrees around the vertical axis), color, lit, open, label, showLabel; decorative or state-driven object` },
    Target: { parent: 'Scene', interactive: true, doc: 'same props as Object; an object viewers click (steps: .click(id)); always shows its label' },
  },
  skill: `## When to use
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
- Dragging orbits the view for that viewer only; it is not a step. Do not write steps that expect a particular viewing angle; use focus instead.
- Do not put text inside the scene to explain things; use captions, callout() on the object, or the surrounding UI.`,
});

export default plugin;

/** JSX 标记：<Scene3D>、<Scene3D.Object>、<Scene3D.Target>。 */
export const Scene3D = Object.assign(pluginComponent(plugin, 'Scene'), {
  Object: pluginComponent(plugin, 'Object'),
  Target: pluginComponent(plugin, 'Target'),
});
