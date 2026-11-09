/**
 * @joplo-app/plugin-3d 入口（Node 端载入，只返回数据）：插件清单、JSX 标记、给 Agent 读的技能。
 * 画面由 ./runtime.ts（浏览器端，three.js）负责。
 */
import { skill, modelsGuide, generationGuide } from './guide.ts';
import { definePlugin, pluginComponent, localResource } from '@joplo-app/kit/plugin';

import info from './version.json' with {type:'json'};
import { normalize, type ModelOptions } from './request.ts';
export { type ModelOptions } from './request.ts';
/** Declarative model request; no network or credentials in author code. */
export const model = (options: ModelOptions | string) => localResource('scene3d','glb',JSON.stringify(normalize(typeof options==='string'?{prompt:options}:options)));

const SHAPES = 'box, cylinder, sphere, cone, floor, wall, lamp, door, window, sofa, table, bed, tv, plant, speaker, ac';

const plugin = definePlugin({
  id: 'scene3d',
  title: '3D scene',
  version: info.version,
  packageName: '@joplo-app/plugin-3d',
  description: 'Interactive 3D scenes (three.js): steps click objects, state drives lights, doors, windows, and the camera',
  runtime: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './runtime.ts' : './runtime.js', import.meta.url),
  local: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './local.ts' : './local.js', import.meta.url),
  keys: [{id:'tripo',title:'Tripo · 3D',description:'Optional model generation; existing GLB files work offline without a key.',url:'https://platform.tripo3d.ai/api-keys',env:'TRIPO_API_KEY'}],
  actions: { rotate: { caption: 'Rotate {label} to {data.azimuth}°', durationMs: 1000, targets: ['scene3d:Scene'], fields: { azimuth: {type:'number',min:-180,max:180,tolerance:6}, elevation: {type:'number',min:6,max:86,tolerance:6} } } },
  components: {
    Model: { parent: 'Scene', interactive: true, traits: { text: ['label'] }, doc: 'src: asset(GLB) or local resource; at, size (bounding fit, preserves aspect), rotate, color (optional tint), outline, label, showLabel (false hides the nameplate), lit; clickable model' },
    Scene: { traits: { text: ['label'] }, doc: 'height (px, default 420), focus (child id or null: the 3D camera frames it), view ("iso" | "front" | "top"), azimuth / elevation (degrees, bind to state for a scripted view), label; root of a 3D scene, viewers drag to orbit' },
    Object: { parent: 'Scene', traits: { text: ['label'] }, doc: `shape (${SHAPES}), at [x, y, z], size [w, h, d], rotate (degrees around the vertical axis), color, lit, open, label, showLabel; decorative or state-driven object` },
    Target: { parent: 'Scene', interactive: true, traits: { text: ['label'] }, doc: 'same props as Object; an object viewers click (steps: .click(id)); always shows its label' },
  },
  skill,
  skillTopics: {generation:{description:'Optional Tripo generation, cost confirmation, persisted models and task recovery',body:generationGuide},models:{description:'GLB assets, loading readiness, material tint, anchors and offline checks',body:modelsGuide}},
});

export default plugin;

/** JSX 标记：<Scene3D>、<Scene3D.Object>、<Scene3D.Target>。 */
export const Scene3D = Object.assign(pluginComponent(plugin, 'Scene'), {
  Object: pluginComponent(plugin, 'Object'),
  Target: pluginComponent(plugin, 'Target'),
  Model: pluginComponent(plugin, 'Model'),
});

export const Model = Scene3D.Model;
