/**
 * joplo-plugin-scene3d 入口（Node 端载入，只返回数据）：插件清单、JSX 标记、给 Agent 读的技能。
 * 画面由 ./runtime.ts（浏览器端，three.js）负责。
 */
import { skill, modelsGuide } from './guide.ts';
import { definePlugin, pluginComponent } from '@joplo-app/kit/plugin';

const SHAPES = 'box, cylinder, sphere, cone, floor, wall, lamp, door, window, sofa, table, bed, tv, plant, speaker, ac';

const plugin = definePlugin({
  id: 'scene3d',
  title: '3D scene',
  version: '0.1.0',
  description: 'Interactive 3D scenes (three.js): steps click objects, state drives lights, doors, windows, and the camera',
  runtime: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './runtime.ts' : './runtime.js', import.meta.url),
  actions: { rotate: { caption: 'Rotate {label} to {data.azimuth}°', durationMs: 1000, targets: ['scene3d:Scene'], fields: { azimuth: {type:'number',min:-180,max:180,tolerance:6}, elevation: {type:'number',min:6,max:86,tolerance:6} } } },
  components: {
    Model: { parent: 'Scene', interactive: true, traits: { text: ['label'] }, doc: 'src: asset(GLB) or local resource; at, size (bounding fit, preserves aspect), rotate, color (optional tint), outline, label, showLabel, lit; clickable model' },
    Scene: { traits: { text: ['label'] }, doc: 'height (px, default 420), focus (child id or null: the 3D camera frames it), view ("iso" | "front" | "top"), azimuth / elevation (degrees, bind to state for a scripted view), label; root of a 3D scene, viewers drag to orbit' },
    Object: { parent: 'Scene', traits: { text: ['label'] }, doc: `shape (${SHAPES}), at [x, y, z], size [w, h, d], rotate (degrees around the vertical axis), color, lit, open, label, showLabel; decorative or state-driven object` },
    Target: { parent: 'Scene', interactive: true, traits: { text: ['label'] }, doc: 'same props as Object; an object viewers click (steps: .click(id)); always shows its label' },
  },
  skill,
  skillTopics: {models:{description:'GLB assets, loading readiness, material tint, anchors and offline checks',body:modelsGuide}},
});

export default plugin;

/** JSX 标记：<Scene3D>、<Scene3D.Object>、<Scene3D.Target>。 */
export const Scene3D = Object.assign(pluginComponent(plugin, 'Scene'), {
  Object: pluginComponent(plugin, 'Object'),
  Target: pluginComponent(plugin, 'Target'),
  Model: pluginComponent(plugin, 'Model'),
});

export const Model = Scene3D.Model;
