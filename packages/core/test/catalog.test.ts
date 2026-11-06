/**
 * 组件目录（D35 Mantine）：目录是唯一来源；Modal/Drawer 门控、响应式与断点、AppShell 收起、
 * select 动作接受 value 或 label、自动字幕读 label —— 都由 core 计算，渲染器与回放共用。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, layout, option, page, set, $, Outlet, Slot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { COMPONENT } from '@joplo-app/kit/node';
import {
  COMPONENT_DOCS,
  COMPONENT_TYPES,
  GATED_CONTAINERS,
  INTERACTIVE_TYPES,
  VALUE_TYPES,
  atWidth,
  compile,
  explainClick,
  hiddenAtWidth,
  initialState,
  isNodeVisible,
  nodeLabel,
  findNode,
  replay,
  stateAt,
  type AuthoringProject,
  type Project,
} from '../src/index.ts';

const HTML = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code', 'a']);

/** `AppShell.Header` → ui.AppShell.Header */
const kitExport = (name: string): unknown => name.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), ui);

describe('目录是唯一来源', () => {
  it('COMPONENT_TYPES 与 @joplo-app/kit/ui 的导出一一对应（复合组件用点语法）', () => {
    for (const t of COMPONENT_TYPES) {
      if (t === '#text' || HTML.has(t)) continue;
      const fn = kitExport(t) as Record<symbol, unknown> | undefined;
      expect(fn, `kit 缺少 ${t}`).toBeTypeOf('function');
      expect(fn![COMPONENT], `kit 的 ${t} 标记名不一致`).toBe(t);
    }
    // 反向：kit 的每个组件（含子组件）都在目录里
    const names: string[] = [];
    const walk = (o: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v !== 'function') continue;
        const marker = (v as unknown as Record<symbol, unknown>)[COMPONENT];
        if (typeof marker === 'string') names.push(marker);
        walk(v as unknown as Record<string, unknown>, `${prefix}${k}.`);
      }
    };
    walk(ui as unknown as Record<string, unknown>, '');
    for (const n of names) expect(COMPONENT_TYPES as readonly string[], `kit 导出了目录外的 ${n}`).toContain(n);
  });

  it('COMPONENT_DOCS 覆盖每个组件且只覆盖目录内的组件；交互、值类型、门控集合都在目录内', () => {
    expect(Object.keys(COMPONENT_DOCS).sort()).toEqual([...COMPONENT_TYPES].sort());
    for (const v of Object.values(COMPONENT_DOCS)) expect(v.trim().length).toBeGreaterThan(0);
    for (const s of [INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS]) for (const t of s) expect(COMPONENT_TYPES as readonly string[]).toContain(t);
    expect([...GATED_CONTAINERS].sort()).toEqual(['Drawer', 'Menu.Dropdown', 'Modal']); // D68：Menu 的 opened 由编译器抄给 Menu.Dropdown
    expect(new Set(COMPONENT_TYPES).size).toBe(COMPONENT_TYPES.length);
  });
});

describe('响应式取值（Mantine 默认断点 36/48/62/75/88em）', () => {
  it('atWidth 取不超过宽度的最大断点；缺 base 时窄屏为 undefined；非响应式值原样返回', () => {
    const cols = { base: 1, sm: 2, lg: 4 };
    expect(atWidth(cols, 390)).toBe(1);
    expect(atWidth(cols, 768)).toBe(2);
    expect(atWidth(cols, 1199)).toBe(2);
    expect(atWidth(cols, 1280)).toBe(4);
    expect(atWidth({ md: 3 }, 390)).toBeUndefined();
    expect(atWidth(3, 390)).toBe(3);
    expect(atWidth({ value: 1 }, 390)).toEqual({ value: 1 });
  });
  it('visibleFrom / hiddenFrom', () => {
    expect(hiddenAtWidth({ hiddenFrom: 'sm' }, 390)).toBe(false);
    expect(hiddenAtWidth({ hiddenFrom: 'sm' }, 1280)).toBe(true);
    expect(hiddenAtWidth({ visibleFrom: 'md' }, 390)).toBe(true);
    expect(hiddenAtWidth({ visibleFrom: 'md' }, 1280)).toBe(false);
    expect(hiddenAtWidth({}, 1280)).toBe(false);
  });
});

// ---------- 用 kit 搭一个最小项目，走真实的 compile → 播放器 ----------

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}` });

function build(viewport: 'desktop' | 'mobile' = 'desktop'): Project {
  const shell = layout(
    h(ui.AppShell, { header: { height: 56 }, navbar: { width: 220, breakpoint: 'sm', collapsed: { mobile: $.ui.navClosed } } },
      h(ui.AppShell.Header, null, h(ui.Burger, { id: 'burger', hiddenFrom: 'sm', unmodeled: true }), h(ui.Title, { order: 4 }, '空间')),
      h(ui.AppShell.Navbar, null, h(ui.NavLink, { id: 'nav_a', label: '成员', href: '/', unmodeled: true })),
      h(ui.AppShell.Main, null, h(Outlet, {})),
      h(Slot, { name: 'overlay' }),
    ),
  );
  const home = page({ title: '首页', viewport }, h(ui.Stack, null, h(ui.Button, { id: 'open' }, '打开'), h(ui.Text, { id: 'wide_only', visibleFrom: 'md' }, '宽屏才显示'), h(Slot, { name: 'x' })));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {
      '/': {
        overlay: h(ui.Modal, { id: 'dlg', opened: $.ui.open, title: '新建' },
          h(ui.TextInput, { id: 'name', label: '名称' }),
          h(ui.Select, { id: 'role', label: '权限', data: [{ value: 'editor', label: '编辑者' }, { value: 'viewer', label: '查看者' }] }),
          h(ui.MultiSelect, { id: 'tags', label: '标签', data: ['甲', '乙'] }),
          h(ui.SegmentedControl, { id: 'seg', data: ['日', '周'] }),
          h(ui.Checkbox, { id: 'agree', label: '同意条款' }),
          h(ui.Radio.Group, { id: 'plan', label: '套餐' }, h(ui.Radio, { value: 'free', label: '免费' }), h(ui.Radio, { value: 'pro', label: '专业' })),
          h(ui.Button, { id: 'save' }, '保存'),
        ),
        x: h(ui.Drawer, { id: 'legacy', open: $.ui.legacy }, h(ui.Text, null, '旧写法 open')),
      },
    },
    state: { ui: { open: false, legacy: false, navClosed: true } },
    scenarios: {
      main: flow('主流程', { start: '/' })
        .click('open', set($.ui.open, true))
        .type('name', '设计组')
        .select('role', '编辑者')
        .select('tags', '甲')
        .select('tags', '乙')
        .select('tags', '甲')
        .select('seg', '周')
        .toggle('agree', true)
        .select('plan', '专业')
        .click('save'),
      nav: flow('点导航', { start: '/' }).click('nav_a'),
      bad: flow('选了不存在的项', { start: '/' }).click('open', set($.ui.open, true)).select('role', '超级管理员'),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', layout: 'shell', home: '/' }), ...F('joplo.config.ts') },
    layouts: { shell: { ...shell, ...F('layouts/shell.tsx') } },
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

describe('Mantine 语义（编译 + 播放器）', () => {
  it('复合组件编译出点语法的节点类型', () => {
    const p = build();
    const root = p.scenes['f.a@/']!.root;
    expect(root.type).toBe('AppShell');
    expect(root.children!.map((c) => c.type)).toEqual(['AppShell.Header', 'AppShell.Navbar', 'AppShell.Main', 'Modal']);
    expect(root.children![3]!.children!.find((c) => c.id === 'plan')!.type).toBe('Radio.Group');
  });

  it('Modal 用 opened 门控；Drawer 兼容旧写法 open', () => {
    const p = build();
    const scene = p.scenes['f.a@/']!;
    const s0 = initialState(p, 'f.a.main');
    expect(isNodeVisible(scene, 'name', s0)).toBe(false);
    expect(isNodeVisible(scene, 'legacy', s0)).toBe(false);
    const s1 = stateAt(p, 'f.a.main', 1);
    expect(isNodeVisible(scene, 'name', s1)).toBe(true);
    expect(isNodeVisible(scene, 'legacy', { ...s0, ui: { ...s0.ui, legacy: true } })).toBe(true);
  });

  it('值类型：select 接受 label 并存 value；MultiSelect 逐项切换；SegmentedControl、Radio.Group、Checkbox 写入 inputs', () => {
    const p = build();
    expect(replay(p, 'f.a.main').diagnostics).toEqual([]);
    const end = stateAt(p, 'f.a.main', p.scenarios['f.a.main']!.steps.length);
    expect(end.inputs).toEqual({ name: '设计组', role: 'editor', tags: ['乙'], seg: '周', agree: true, plan: 'pro' });
  });

  it('select 的值既不是 value 也不是 label 时回放报 UNKNOWN_CHOICE，并列出可选项', () => {
    const d = replay(build(), 'f.a.bad').diagnostics;
    expect(d.map((x) => x.code)).toEqual(['UNKNOWN_CHOICE']);
    expect(d[0]!.message).toContain('编辑者/editor');
    expect(d[0]!.at).toMatch(/^features\/f\/options\/a\.tsx|catalog\.test\.ts/);
  });

  it('自动字幕读 Mantine 的 label；select 显示选项的 label；Checkbox 用“勾选”', () => {
    const steps = build().scenarios['f.a.main']!.steps;
    expect(steps[1]!.caption).toBe('Type “设计组” in “名称”');
    expect(steps[2]!.caption).toBe('Select “编辑者” in “权限”');
    expect(steps[7]!.caption).toBe('Check “同意条款”');
    expect(steps[8]!.caption).toBe('Select “专业” in “套餐”');
  });

  it('按画面宽度判断可见：visibleFrom / hiddenFrom；AppShell 窄于断点时收起导航（回放据此报 TARGET_HIDDEN）', () => {
    const desk = build('desktop');
    const mob = build('mobile');
    const s = initialState(desk, 'f.a.nav');
    expect(isNodeVisible(desk.scenes['f.a@/']!, 'wide_only', s)).toBe(true);
    expect(isNodeVisible(mob.scenes['f.a@/']!, 'wide_only', s)).toBe(false);
    expect(isNodeVisible(desk.scenes['f.a@/']!, 'burger', s)).toBe(false);
    expect(isNodeVisible(mob.scenes['f.a@/']!, 'burger', s)).toBe(true);
    // 桌面：导航可见，可以点；手机：collapsed.mobile 绑定为真 → 收起
    expect(replay(desk, 'f.a.nav').diagnostics).toEqual([]);
    expect(replay(mob, 'f.a.nav').diagnostics.map((d) => d.code)).toEqual(['TARGET_HIDDEN']);
    // 绑定为假 → 手机上展开
    const opened = { ...initialState(mob, 'f.a.nav') };
    opened.ui = { ...opened.ui, navClosed: false };
    expect(isNodeVisible(mob.scenes['f.a@/']!, 'nav_a', opened)).toBe(true);
    // 显式宽度参数优先于画面的 viewport
    expect(isNodeVisible(desk.scenes['f.a@/']!, 'nav_a', s, 390)).toBe(false);
    expect(explainClick(desk, s, 'nav_a').kind).toBe('advance');
  });

  it('属性是元素时编译报 ELEMENT_PROP（Mantine 常见的 leftSection={<Icon/>}）', () => {
    const p = page({ title: 'x' }, h(ui.Button, { id: 'b', leftSection: h(ui.Text, null, '+'), unmodeled: true }, '新建'));
    const src: AuthoringProject = {
      root: '/p',
      config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
      layouts: {},
      routes: { '/': { ...p, ...F('routes/page.tsx') } },
      features: {},
    };
    expect(compile(src, 'dev').diagnostics.map((d) => d.code)).toContain('ELEMENT_PROP');
  });
});

describe('设备外框：Terminal 与 Phone', () => {
  /** 桌面页面里放一部 Phone（内部有 AppShell）和一个 Terminal（带输入行）。 */
  function buildDevices(): Project {
    const home = page(
      { title: '外框' },
      h(ui.Group, null,
        h(ui.Text, { id: 'outside_wide', visibleFrom: 'md' }, '桌面才显示'),
        h(ui.Phone, { id: 'phone', h: 600 },
          h(ui.AppShell, { header: { height: 48 }, navbar: { width: 200, breakpoint: 'sm' } },
            h(ui.AppShell.Header, null, h(ui.Burger, { id: 'p_burger', hiddenFrom: 'sm', unmodeled: true })),
            h(ui.AppShell.Navbar, null, h(ui.NavLink, { id: 'p_nav', label: '导航', unmodeled: true })),
            h(ui.AppShell.Main, null, h(ui.Text, { id: 'p_wide', visibleFrom: 'md' }, '手机里不显示'), h(ui.Text, { id: 'p_narrow', hiddenFrom: 'sm' }, '手机里显示')),
          ),
        ),
        h(ui.Terminal, { id: 'term', title: '~/work' },
          h(ui.Terminal.Command, { id: 'cmd' }, 'npx joplo skill'),
          h(ui.Terminal.Output, { id: 'out', tone: 'ok', when: $.ui.ran }, '完成'),
          h(ui.Terminal.Input, { id: 'cmd_in', placeholder: '输入命令' }),
        ),
      ),
    );
    const opt = option({
      name: 'A',
      idea: 'i',
      on: {},
      state: { ui: { ran: false } },
      scenarios: { run: flow('运行命令', { start: '/' }).type('cmd_in', 'npx joplo skill').system('回车', set($.ui.ran, true)) },
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

  it('复合组件编译为 Terminal.Command / Terminal.Output / Terminal.Input；Terminal.Input 是可操作的值类型', () => {
    expect(INTERACTIVE_TYPES.has('Terminal.Input')).toBe(true);
    expect(VALUE_TYPES.has('Terminal.Input')).toBe(true);
    expect(INTERACTIVE_TYPES.has('Phone') || INTERACTIVE_TYPES.has('Terminal')).toBe(false);
    const p = buildDevices();
    const term = p.scenes['f.a@/']!.root.children!.find((c) => c.id === 'term')!;
    expect(term.children!.map((c) => c.type)).toEqual(['Terminal.Command', 'Terminal.Output', 'Terminal.Input']);
  });

  it('type 动作写入 Terminal.Input；自动字幕读 placeholder', () => {
    const p = buildDevices();
    expect(replay(p, 'f.a.run').diagnostics).toEqual([]);
    expect(p.scenarios['f.a.run']!.steps[0]!.caption).toBe('Type “npx joplo skill” in “输入命令”');
    expect(stateAt(p, 'f.a.run', 2).inputs).toEqual({ cmd_in: 'npx joplo skill' });
  });

  it('Phone 内部按手机宽度计算断点：visibleFrom / hiddenFrom 与 AppShell 收起；外部仍按页面宽度', () => {
    const p = buildDevices();
    const scene = p.scenes['f.a@/']!;
    const s = initialState(p, 'f.a.run');
    expect(isNodeVisible(scene, 'outside_wide', s)).toBe(true);
    expect(isNodeVisible(scene, 'p_wide', s)).toBe(false);
    expect(isNodeVisible(scene, 'p_narrow', s)).toBe(true);
    expect(isNodeVisible(scene, 'p_burger', s)).toBe(true);
    expect(isNodeVisible(scene, 'p_nav', s)).toBe(false);
    // 页面本身是手机宽度时，Phone 内外都按 390
    expect(isNodeVisible(scene, 'outside_wide', s, 390)).toBe(false);
    expect(isNodeVisible(scene, 'p_narrow', s, 390)).toBe(true);
  });
});

describe('架构图：Diagram / Diagram.Group / Diagram.Node / Diagram.Edge（D41）', () => {
  const D = ui.Diagram;
  function buildDiagram(edges: unknown[], extraNodes: unknown[] = []): ReturnType<typeof compile> {
    const home = page(
      { title: '架构' },
      h(D, { id: 'arch', direction: 'right', h: 480 },
        h(D.Group, { id: 'aws', label: 'AWS' },
          h(D.Node, { id: 'brain', label: 'Agent 大脑', description: '推理循环', kind: 'service', state: $.ui.n_brain }),
          h(D.Node, { id: 'llm', label: 'Bedrock', kind: 'model' }),
        ),
        h(D.Node, { id: 'client', label: '客户端', kind: 'client' }),
        h(D.Node, { id: 'billing', label: 'Billing', kind: 'database' }),
        ...extraNodes,
        ...edges,
      ),
    );
    const opt = option({
      name: 'A',
      idea: 'i',
      on: {},
      state: { ui: { n_brain: 'idle', e1: 'idle' } },
      scenarios: { call: flow('一次调用', { start: '/' }).system('客户端发出消息', set($.ui.e1, 'active'), set($.ui.n_brain, 'active')).system('大脑回复', set($.ui.e1, 'ok'), set($.ui.n_brain, 'ok')) },
    });
    const src: AuthoringProject = {
      root: '/p',
      config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
      layouts: {},
      routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
    };
    return compile(src, 'dev');
  }
  const edge = (props: Record<string, unknown>) => ({ ...h(ui.Diagram.Edge, props), source: '/p/routes/page.tsx:9:7' });

  it('四个组件都在目录里且不是可操作元素（不需要 flow）', () => {
    for (const t of ['Diagram', 'Diagram.Group', 'Diagram.Node', 'Diagram.Edge']) {
      expect(COMPONENT_TYPES as readonly string[]).toContain(t);
      expect(INTERACTIVE_TYPES.has(t)).toBe(false);
    }
  });

  it('连线 id 缺省为 from->to，可以显式写 id；状态由 flow 的 set() 驱动', () => {
    const r = buildDiagram([edge({ from: 'client', to: 'brain', label: '发送消息', state: $.ui.e1 }), edge({ id: 'usage', from: 'brain', to: 'billing', label: '用量事件', async: true })]);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = r.project!;
    const scene = p.scenes['f.a@/']!;
    const arch = findNode(scene, 'arch')!.node;
    expect(arch.children!.map((c) => c.id)).toEqual(['aws', 'client', 'billing', 'client->brain', 'usage']);
    expect(replay(p, 'f.a.call').diagnostics).toEqual([]);
    expect(stateAt(p, 'f.a.call', 1).ui).toMatchObject({ e1: 'active', n_brain: 'active' });
    expect(stateAt(p, 'f.a.call', 2).ui).toMatchObject({ e1: 'ok', n_brain: 'ok' });
    // 检查元素的名字：有 label 用 label，没有时是「from → to」
    expect(nodeLabel(arch.children![3]!)).toBe('发送消息');
    expect(nodeLabel({ type: 'Diagram.Edge', props: { from: 'a', to: 'b' } })).toBe('a → b');
    // Node / Edge 单击是静态的，不影响演示
    expect(explainClick(p, initialState(p, 'f.a.call'), 'brain').kind).toBe('static');
    expect(explainClick(p, initialState(p, 'f.a.call'), 'client->brain').kind).toBe('static');
  });

  it('from / to 不是同一个 Diagram 里的节点：报 UNKNOWN_DIAGRAM_NODE（带 at）', () => {
    const r = buildDiagram([edge({ from: 'client', to: 'nope' }), edge({ from: 'ghost', to: 'brain' })]);
    const d = r.diagnostics.filter((x) => x.code === 'UNKNOWN_DIAGRAM_NODE');
    expect(d.length).toBeGreaterThanOrEqual(2);
    expect(d.every((x) => x.severity === 'error' && x.at === 'routes/page.tsx:9:7')).toBe(true);
    expect(d.map((x) => x.message).join('\n')).toContain('to "nope" is not a node or group id in this Diagram');
    expect(d.map((x) => x.message).join('\n')).toContain('from "ghost" is not a node or group id in this Diagram');
  });

  it('节点 id 在同一画面唯一（DUPLICATE_ID）；节点必须有 id', () => {
    const dup = buildDiagram([], [h(ui.Diagram.Node, { id: 'client', label: '又一个客户端' })]);
    expect(dup.diagnostics.map((d) => d.code)).toContain('DUPLICATE_ID');
    const noId = buildDiagram([], [h(ui.Diagram.Node, { label: '无名' })]);
    expect(noId.diagnostics.find((d) => d.code === 'MISSING_ID')?.message).toContain('Diagram.Node');
  });
});
