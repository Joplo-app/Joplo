import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * T-director3 中保留下来的纯函数：镜头时序（cameraPosition）与导演层的选取（协调者报告的 agent-arch 第 10 步）。
 * 解说卡已改为画面下方的字幕区（见 subtitle.test.ts）。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { feature, flow, layer, option, page, set, shot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { cameraAt, compile, type AuthoringProject } from '@joplo-app/core';
import { cameraFor, cameraPosition } from '../src/player/cameraFor';


// ---------- 导演层与镜头时序（协调者报告：第 10 步 shot('tc_sheet') 在前，导演层应是客户端） ----------
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function arch() {
  const home = page({ title: 'A', layout: false }, h(ui.Text, { id: 'note' }, '路径页面'));
  const client = h(ui.Stack, null, h(ui.ToolCall, { id: 'tc_sheet', title: 'make_sheet' }, '生成'), h(ui.Button, { id: 'send' }, '发送'));
  const backend = h(uiDiagram.Diagram, { id: 'arch' }, h(uiDiagram.Diagram.Node, { id: 'biz', label: 'Biz' }), h(uiDiagram.Diagram.Node, { id: 'sandbox', label: '沙箱' }), h(uiDiagram.Diagram.Edge, { id: 'e', from: 'biz', to: 'sandbox' }));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { t: 'idle' } },
    layers: { client: layer('客户端视角', client as never), backend: layer('后端流转', backend as never) },
    scenarios: {
      s: flow('一次', { start: '/' })
        .click('send', '发出')
        .system('工具调用 make_sheet', shot('biz', 'sandbox'), shot('tc_sheet'))
        .system('沙箱执行完成', shot('tc_sheet'), shot('sandbox'), set($.ui.t, 'done')),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

describe('导演层的选取与镜头时序', () => {
  const p = arch();
  const sc = p.scenarios['f.a.s']!;
  it('“沙箱执行完成”第一个 shot 是只在客户端层的 tc_sheet：导演层是客户端；cameraAt 在这一步之后对准客户端的 tc_sheet，后端层对准 sandbox', () => {
    expect(sc.steps[2]!.directorLayer).toBe('client');
    expect(sc.steps[1]!.directorLayer).toBe('backend');
    const cam = cameraAt(p, sc.id, 3);
    expect(cam.directorLayer).toBe('client');
    expect(cam.perLayer).toMatchObject({ client: ['tc_sheet'], backend: ['sandbox'] });
    expect(cameraFor(p, sc.id, 3, null)).toMatchObject({ viewLayer: 'client', spec: { targets: ['tc_sheet'] } });
  });
  it('系统步骤一开始播放就用这一步的镜头（此前停在上一步的 biz + sandbox）；用户操作在提交之后才切', () => {
    // 第 3 步（下标 2）正在播放、尚未提交：position = 2
    expect(cameraPosition(sc, 2, 2)).toBe(3);
    expect(cameraFor(p, sc.id, cameraPosition(sc, 2, 2), null)).toMatchObject({ viewLayer: 'client', spec: { targets: ['tc_sheet'] } });
    expect(cameraPosition(sc, 0, 0)).toBe(0); // 用户点击：先在当前画面里点到目标
    expect(cameraPosition(sc, 2, null)).toBe(2);
    expect(cameraPosition(null, 2, 2)).toBe(2);
  });
});
