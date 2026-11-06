/** D69 测试用的小项目：三组、四个节点，D 逐段出现，有一条连到分组的连线。 */
import { expect } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { $, config, feature, flow, layer, option, page, set, shot, trace } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { elkLayout } from '@joplo-app/core/node';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = ui.Diagram;

export function project(): Project {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const arch = h(
    D,
    { id: 'arch', direction: 'right', h: 520 },
    h(D.Group, { id: 'g_edge', label: '入口', icon: 'gateway' }, h(D.Node, { id: 'a', label: 'A 网关' })),
    h(D.Group, { id: 'g_run', label: '运行时', icon: 'service' }, h(D.Node, { id: 'b', label: 'B 服务' }), h(D.Node, { id: 'c', label: 'C 服务' })),
    h(D.Group, { id: 'g_data', label: '存储', icon: 'database' }, h(D.Node, { id: 'd', label: 'D 数据库', kind: 'database', when: $.ui.showD })),
    h(D.Edge, { id: 'ab', from: 'a', to: 'b', label: '调用' }),
    h(D.Edge, { id: 'ac', from: 'a', to: 'c' }),
    h(D.Edge, { id: 'cd', from: 'c', to: 'd', when: $.ui.showD }),
    h(D.Edge, { id: 'b_data', from: 'b', to: 'g_data', label: '写入' }),
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
        .system('A → C', trace('a', 'c'))
        .system('D 出现', set($.ui.showD, true), trace('c', 'd'))
        .system('多节点镜头', shot('a', 'b', 'c', 'd'))
        .system('写入存储分组', trace('b', 'g_data'))
        .system('整层', shot()),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev', { layout: elkLayout });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}


/** 状态机夹具：value 绑定 data.order.status，第 1 步支付、第 2 步不变、第 3 步发货。 */
export function machineProject(): Project {
  const SM = ui.StateMachine;
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const sm = h(
    SM,
    { id: 'order_sm', value: $.data.order.status },
    h(SM.State, { id: 'created', label: '已创建', initial: true }),
    h(SM.State, { id: 'paid', label: '已支付' }),
    h(SM.State, { id: 'shipped', label: '已发货', final: true }),
    h(SM.Transition, { id: 't_pay', from: 'created', to: 'paid', label: '支付' }),
    h(SM.Transition, { id: 't_ship', from: 'paid', to: 'shipped', label: '发货' }),
  );
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { data: { order: { status: 'created' } } },
    layers: { life: layer('订单状态', sm as never) },
    scenarios: {
      s: flow('一次', { start: '/' })
        .system('支付', set($.data.order.status, 'paid'), shot('order_sm'))
        .system('等待', shot('order_sm'))
        .system('发货', set($.data.order.status, 'shipped')),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev', { layout: elkLayout });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}
