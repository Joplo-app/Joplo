/**
 * 插件组件（D87 阶段 0）：config({ plugins }) 启用；类型名 `<插件 id>:<组件名>`；可操作、父组件声明；
 * 没启用的插件、不存在的组件、写错位置都报错；IR 的 plugins 只有组件声明，不含运行时路径；
 * 步骤可以点插件声明为可操作的元素，回放与 explainClick 认它；没有步骤时 UNBOUND_INTERACTIVE。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, option, page, set, Slot, $ } from '@joplo-app/kit';
import { definePlugin, pluginComponent } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, explainClick, replay, stateAt, validate, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

const plugin = definePlugin({
  id: 'scene3d',
  title: '3D',
  version: '0.1.0',
  runtime: '/abs/plugin/runtime.js',
  components: { Scene: { doc: 'root' }, Object: { doc: 'thing', parent: 'Scene' }, Target: { doc: 'clickable', parent: 'Scene', interactive: true } },
  skill: 'secret authoring notes',
});
const Scene = pluginComponent(plugin, 'Scene');
const Target = pluginComponent(plugin, 'Target');
const Obj = pluginComponent(plugin, 'Object');

function build(o: { plugins?: unknown[]; tree?: unknown; steps?: (f: ReturnType<typeof flow>) => ReturnType<typeof flow> } = {}) {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(Slot, { name: 'main' })));
  const tree = o.tree ?? h(Scene, { id: 'home' }, h(Obj, { id: 'sofa', shape: 'sofa' }), h(Target, { id: 'lamp', label: 'Lamp', lit: $.data.lamp }));
  const fl = (o.steps ?? ((f) => f.click('lamp', 'Turn the lamp off', set($.data.lamp, false))))(flow('Lamp', { start: '/' }));
  const opt = option({ name: 'A', idea: 'i', on: { '/': { main: tree as never } }, state: { data: { lamp: true } }, scenarios: { s: fl } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/', plugins: (o.plugins ?? [plugin]) as never }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish') };
}
const errors = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

describe('插件组件', () => {
  it('启用后编译通过；IR 只记组件声明，不含运行时路径与技能；发布模式保留', () => {
    const { dev, publish } = build();
    for (const r of [dev, publish]) {
      expect(errors(r)).toEqual([]);
      expect(r.project!.plugins).toEqual({ scene3d: { id: 'scene3d', title: '3D', version: '0.1.0', components: { Scene: {}, Object: { parent: 'Scene' }, Target: { parent: 'Scene', interactive: true } } } });
      const json = JSON.stringify(r.project);
      expect(json).not.toContain('/abs/plugin');
      expect(json).not.toContain('secret authoring notes');
    }
  });

  it('步骤点击插件的可操作元素：回放成功，explainClick 推进；状态驱动插件属性', () => {
    const { dev } = build();
    const p = dev.project!;
    const sid = 'f.a.s';
    expect(replay(p, sid).diagnostics).toEqual([]);
    expect(explainClick(p, stateAt(p, sid, 0), 'lamp').kind).toBe('advance');
    expect(explainClick(p, stateAt(p, sid, 0), 'sofa').kind).toBe('static');
    expect(stateAt(p, sid, 1).data.lamp).toBe(false);
  });

  it('可操作的插件元素没有步骤时 UNBOUND_INTERACTIVE', () => {
    const { dev } = build({ steps: (f) => f.system('Nothing') });
    const codes = validate(dev.project!).diagnostics.map((d) => d.code);
    expect(codes).toContain('UNBOUND_INTERACTIVE');
  });

  it('没启用插件、不存在的组件、写错位置、可操作元素缺 id、清单无效或重复都报错', () => {
    expect(errors(build({ plugins: [] }).dev)).toContain('UNKNOWN_PLUGIN');
    expect(errors(build({ tree: h(Scene, { id: 'home' }, h(Obj, { id: 'x' }), jsx('scene3d:Nope' as never, { id: 'n' })) }).dev)).toContain('UNKNOWN_COMPONENT');
    expect(errors(build({ tree: h(ui.Stack, null, h(Target, { id: 'lamp' })) }).dev)).toContain('PLUGIN_PARENT');
    expect(errors(build({ tree: h(Scene, { id: 'home' }, h(Target, { label: 'no id' })), steps: (f) => f.system('x') }).dev)).toContain('MISSING_ID');
    expect(errors(build({ plugins: [{ id: 'x' }] }).dev)).toContain('PLUGIN_INVALID');
    expect(errors(build({ plugins: [plugin, plugin] }).dev)).toContain('PLUGIN_DUPLICATE');
  });

  it('definePlugin 拒绝非法 id、组件名、父组件与接口版本；runtime 接受 file URL', () => {
    const base = { title: 't', runtime: '/r.js', components: { A: { doc: 'a' } } };
    expect(() => definePlugin({ ...base, id: 'Bad' })).toThrow();
    expect(() => definePlugin({ ...base, id: 'ok', components: { lower: { doc: 'x' } } })).toThrow();
    expect(() => definePlugin({ ...base, id: 'ok', components: { A: { doc: 'a', parent: 'Missing' } } })).toThrow();
    expect(() => definePlugin({ ...base, id: 'ok', apiVersion: 2 as never })).toThrow();
    expect(definePlugin({ ...base, id: 'ok', runtime: new URL('file:///tmp/x%20y/runtime.js') }).runtime).toBe('/tmp/x y/runtime.js');
  });
});
