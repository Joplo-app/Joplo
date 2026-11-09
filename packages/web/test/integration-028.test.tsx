import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 集成 0.2.8：焦点提示（D70）不破坏关系类图表的布局稳定（D69 不变量 1）。
 * 同一场景里穿插 trace、spotlight / highlight / numbered / callout（指向节点和分组）、节点逐段出现、多节点镜头、
 * 回到整层：每一步渲染出的每个节点位置都相同；提示层只画在镜头容器里，不接收指针，也不改图表的 DOM 位置。
 * 真实浏览器里的聚光洞口（带上父分组标题）见 server/test/publish-playback.test.ts。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { $, callout, feature, flow, highlight, layer, numbered, option, page, set, shot, spotlight } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, focusAt, stateAt, type AuthoringProject, type Project } from '@joplo-app/core';
import { elkLayout } from '../../../plugins/diagram/src/elk.ts';
import { cameraFor } from '../src/player/cameraFor';
import { Stage } from '../src/renderer/Stage';
import { I18nProvider } from '../src/i18n/context';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;
const SID = 'f.a.s';

function project(autoFocus?: boolean): Project {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const arch = h(
    D,
    { id: 'arch', direction: 'right', h: 520 },
    h(D.Group, { id: 'g_edge', label: '入口', icon: 'gateway' }, h(D.Node, { id: 'a', label: 'A 网关' })),
    h(D.Group, { id: 'g_run', label: '运行时', icon: 'service' }, h(D.Node, { id: 'b', label: 'B 服务' }), h(D.Node, { id: 'c', label: 'C 服务' })),
    h(D.Group, { id: 'g_data', label: '存储', icon: 'database' }, h(D.Node, { id: 'd', label: 'D 数据库', kind: 'database', when: $.ui.showD })),
    h(D.Edge, { id: 'ab', from: 'a', to: 'b' }),
    h(D.Edge, { id: 'ac', from: 'a', to: 'c' }),
    h(D.Edge, { id: 'cd', from: 'c', to: 'd', when: $.ui.showD }),
  );
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { showD: false } },
    layers: { backend: layer('后端', arch as never) },
    scenarios: {
      s: flow('一次', { start: '/' })
        .system('A → B', trace('a', 'b'))
        .system('聚光 B', spotlight('b'))
        .system('强调运行时分组', highlight('g_run'))
        .system('C 的说明', callout('c', '另一条路'))
        .system('编号', numbered('a', 'b', 'c'))
        .system('D 出现', set($.ui.showD, true), trace('c', 'd'), callout('g_data', '写入存储'))
        .system('多节点镜头 + 聚光分组', shot('a', 'b', 'c', 'd'), spotlight('g_run'))
        .system('整层', shot()),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/', ...(autoFocus === undefined ? {} : { autoFocus }) }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev', { pluginOptions: { diagram: { layout: elkLayout } } });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

const render = (p: Project, pos: number) => {
  const plan = cameraFor(p, SID, pos, null);
  return renderToStaticMarkup(createElement(I18nProvider, { explicit: 'zh-CN', children: createElement(Stage, { project: p, state: stateAt(p, SID, pos), theme: 'sketch', mode: 'render', animate: false, sceneId: plan.sceneId, camera: plan.spec }) }));
};

/** 每个图表节点 / 分组渲染出来的位置（left / top / width / height）。 */
function boxes(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<div[^>]*data-jid="([^"]+)"[^>]*data-jtype="diagram:Diagram\.(?:Node|Group)"[^>]*>/g;
  for (const m of html.matchAll(re)) {
    const style = /style="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const pick = (k: string) => new RegExp(`(?:^|;)${k}:([^;]+)`).exec(style)?.[1] ?? '?';
    out[m[1]!] = ['left', 'top', 'width', 'height'].map(pick).join(',');
  }
  return out;
}

describe('焦点提示 × 图表布局稳定', () => {
  for (const autoFocus of [undefined, false]) {
    it(`每一步、每个节点和分组的位置都相同（autoFocus ${autoFocus === false ? '关闭' : '默认'}）`, () => {
      const p = project(autoFocus);
      const n = p.scenarios[SID]!.steps.length;
      // 场景确实用到了各种提示
      const kinds = new Set(Array.from({ length: n + 1 }, (_, k) => focusAt(p, SID, k)).flatMap((f) => [f.spotlight.length ? 'spotlight' : '', f.highlight.length ? 'highlight' : '', f.numbered.length ? 'numbered' : '', f.callouts.length ? 'callout' : ''].filter(Boolean)));
      expect([...kinds].sort()).toEqual(['callout', 'highlight', 'numbered', 'spotlight']);
      const all: Record<string, string>[] = [];
      for (let pos = 0; pos <= n; pos++) all.push(boxes(render(p, pos)));
      const ref: Record<string, string> = Object.assign({}, ...all);
      expect(Object.keys(ref).sort()).toEqual(['a', 'b', 'c', 'd', 'g_data', 'g_edge', 'g_run']);
      all.forEach((b, pos) => {
        for (const [id, box] of Object.entries(b)) expect(box, `step ${pos} ${id}`).toBe(ref[id]);
      });
    });
  }

  it('提示层不接收指针，画在图表之外（舞台的镜头容器里），不插进图表的 DOM', () => {
    const p = project();
    for (const pos of [2, 3, 4, 5, 7]) {
      const html = render(p, pos);
      const cues = /<div[^>]*data-jlayer="cues"[^>]*>/.exec(html)?.[0] ?? '';
      expect(cues, `step ${pos}`).toContain('pointer-events-none');
      const diagramStart = html.indexOf('data-jtype="diagram:Diagram"');
      const dialog = html.indexOf('data-jlayer="dialog"');
      expect(diagramStart).toBeGreaterThan(-1);
      expect(html.indexOf('data-jlayer="cues"')).toBeGreaterThan(dialog);
      expect(html.slice(diagramStart, dialog)).not.toContain('data-jcue');
    }
  });
});
