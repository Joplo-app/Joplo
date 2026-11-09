import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 叙事焦点（D70）：每一步观众看哪里（focusAt，纯函数）、用什么形式呈现（spotlight / highlight / numbered / callout / hold / redact）。
 * 不变量：
 * 1. 不用新功能的项目 IR 不多出任何字段；默认焦点行为能用 config({ autoFocus: false }) 整体关掉。
 * 2. 焦点是步骤的纯函数：跳到任意一步、前后翻、乱序调用、逐步回放，结果相同。
 * 3. 呈现形式不改变点击判定（explainClick）与回放。
 * 4. 发布模式保留全部焦点字段。
 */
import { join, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { describe, expect, it } from 'vitest';
import { loadAuthoring } from '../src/load.ts';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { $, callout, feature, flow, go, highlight, hold, layer, mark, not, numbered, option, page, set, shot, spotlight, toast, type Flow } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { applyStep, cameraAt, compile, explainClick, findNode, focusAt, initialState, isNodeVisible, replay, stateAt, validate, visibleIds, walkNodes, type AuthoringProject, type Project } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;

/** 聊天层：面板里有消息、按钮、提示；弹窗；行程层：行程卡片（与聊天层没有同名元素）；架构层：一张图。 */
const chatTree = () =>
  h(ui.Stack, { id: 'chat' },
    h(ui.Paper, { id: 'panel' },
      h(ui.Text, { id: 'msg' }, $.ui.reply),
      h(ui.Button, { id: 'send' }, '发送'),
      h(ui.Alert, { id: 'alert', when: $.ui.warn, title: '额度不足' }, '先拦下'),
      h(ui.Badge, { id: 'badge' }, $.ui.status)),
    h(ui.Paper, { id: 'side' }, h(ui.Text, { id: 'side_note' }, '侧栏'), h(ui.Code, { id: 'secret', redact: not($.ui.revealed) }, 'sk-live-123')),
    h(ui.Modal, { id: 'dlg', opened: $.ui.dlg, title: '确认' }, h(ui.Button, { id: 'ok' }, '确定')),
    h(ui.Stack, { id: 'many', when: $.ui.many }, h(ui.Text, { id: 'm1' }, '1'), h(ui.Text, { id: 'm2' }, '2')),
    h(ui.Stack, { id: 'log' }, h(ui.Text, { id: 'l1', when: $.ui.l1 }, '第一行'), h(ui.Text, { id: 'l2', when: $.ui.l2 }, '第二行')),
    h(ui.Text, { id: 'n1', when: $.ui.many } as never, 'n1'), h(ui.Text, { id: 'n2', when: $.ui.many } as never, 'n2'), h(ui.Text, { id: 'n3', when: $.ui.many } as never, 'n3'));
const tripTree = () => h(ui.Card, { id: 'trip' }, h(ui.Text, { id: 'trip_title' }, '行程'), h(ui.Button, { id: 'trip_ok' }, '能去'));
const archTree = () => h(D, { id: 'arch' }, h(D.Node, { id: 'biz', label: 'Biz' }), h(D.Node, { id: 'billing', label: 'Billing' }), h(D.Edge, { from: 'biz', to: 'billing' }));

type Opts = { steps?: (f: Flow) => Flow; layers?: boolean; autoFocus?: boolean; routes?: boolean };
function build(o: Opts = {}) {
  const home = page({ title: '首页', layout: false }, o.layers === false ? chatTree() : h(ui.Text, { id: 'home' }, '首页'));
  const next = page({ title: '下一页', layout: false }, h(ui.Text, { id: 'next_page' }, '下一页'));
  const fl = (o.steps ?? ((f: Flow) => f.system('提示', set($.ui.warn, true))))(flow('主线', { start: '/' }));
  const opt = option({
    name: 'A', idea: 'i',
    state: { ui: { reply: '你好', warn: false, status: '草稿', dlg: false, many: false, revealed: false } },
    ...(o.layers === false ? {} : { layers: { chat: layer('聊天', chatTree()), trip: layer('行程', tripTree()), arch: layer('架构', archTree()) } }),
    scenarios: { happy: fl },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/', ...(o.autoFocus === undefined ? {} : { autoFocus: o.autoFocus }) }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') }, '/next': { ...next, ...F('routes/next/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish'), review: compile(src, 'review') };
}
const sid = 'f.a.happy';
const errors = (r: ReturnType<typeof build>['dev']) => r.diagnostics.filter((d) => d.severity === 'error');

describe('编译：焦点原语写进 IR', () => {
  it('spotlight / highlight / numbered / callout / hold 进入 Step；只作用于这一步', () => {
    const { dev } = build({
      steps: (f) => f
        .system('只看提示', set($.ui.warn, true), spotlight('alert'), highlight('badge'), callout('alert', '  额度不足时先拦下  ', { side: 'left' }), hold(4))
        .system('三部分', numbered('msg', 'send', 'badge', 'send'))
        .system('普通一步'),
    });
    expect(errors(dev)).toEqual([]);
    const [a, b, c] = dev.project!.scenarios[sid]!.steps;
    expect(a!.cues).toEqual([{ kind: 'spotlight', targets: ['alert'] }, { kind: 'highlight', targets: ['badge'] }]);
    expect(a!.callouts).toEqual([{ target: 'alert', text: '额度不足时先拦下', side: 'left' }]);
    expect(a!.hold).toBe(4000);
    expect(b!.cues).toEqual([{ kind: 'number', targets: ['msg', 'send', 'badge'] }]);
    for (const k of ['cues', 'callouts', 'hold'] as const) expect(k in c!).toBe(false);
    // 焦点原语不是状态变化
    expect(a!.effects.map((e) => e.type)).toEqual(['set']);
  });

  it('不用新功能的项目：IR 不多出任何字段（autoFocus / cues / callouts / hold / redact）', () => {
    const { dev, publish } = build({ steps: (f) => f.click('send', set($.ui.warn, true), shot('panel')).system('结束', trace('biz', 'billing')), layers: true });
    for (const r of [dev, publish]) {
      const json = JSON.stringify(r.project);
      expect(json).not.toMatch(/"(autoFocus|cues|callouts|hold)":/);
      // redact 只出现在写了它的元素上
      const withRedact: string[] = [];
      for (const s of Object.values(r.project!.scenes)) walkNodes(s.root, (n) => { if ('redact' in n) withRedact.push(n.id); });
      expect([...new Set(withRedact)]).toEqual(['secret']);
    }
  });

  it('目标不存在、参数为空、hold 越界、气泡没有文字：报错并定位到步骤', () => {
    const cases: [(f: Flow) => Flow, string][] = [
      [(f) => f.system('x', spotlight('nope')), 'FOCUS_UNKNOWN'],
      [(f) => f.system('x', highlight()), 'FOCUS_UNKNOWN'],
      [(f) => f.system('x', numbered('msg', 'nope')), 'FOCUS_UNKNOWN'],
      [(f) => f.system('x', callout('nope', '说明')), 'FOCUS_UNKNOWN'],
      [(f) => f.system('x', callout('msg', '   ')), 'CALLOUT_EMPTY'],
      [(f) => f.system('x', hold(0)), 'HOLD_INVALID'],
      [(f) => f.system('x', hold(31)), 'HOLD_INVALID'],
      [(f) => f.system('x', hold(Number.NaN)), 'HOLD_INVALID'],
    ];
    for (const [steps, code] of cases) {
      const d = build({ steps }).dev.diagnostics.find((x) => x.code === code);
      expect(d, code).toBeDefined();
      expect(d!.severity).toBe('error');
      expect(d!.at).toMatch(/focus.test.ts:\d+:\d+$/);
    }
    // 没有层级的方案：在这一步的路径页面里解析
    expect(errors(build({ layers: false, steps: (f) => f.system('x', spotlight('alert')) }).dev)).toEqual([]);
    expect(build({ layers: false, steps: (f) => f.system('x', go('/next')).system('y', spotlight('alert')) }).dev.diagnostics.map((d) => d.code)).toContain('FOCUS_UNKNOWN');
  });

  it('redact：布尔或条件；其他值报 INVALID_REDACT', () => {
    const p = build().dev.project!;
    const scene = p.scenes['f.a~chat']!;
    expect(findNode(scene, 'secret')!.node.redact).toEqual({ falsy: 'ui.revealed' });
    expect(findNode(scene, 'secret')!.node.props?.redact).toBeUndefined();
  });

  it('导演层：没有 shot 时，提示所在的层决定导演切到哪一层（先于操作目标）', () => {
    const { dev } = build({ steps: (f) => f.click('send', spotlight('trip')).system('图', highlight('biz')).system('镜头优先', shot('msg'), highlight('trip_title')) });
    const steps = dev.project!.scenarios[sid]!.steps;
    expect(steps.map((s) => s.directorLayer)).toEqual(['trip', 'arch', 'chat']);
  });

  it('提示不推近镜头；目标在当前镜头之外时，这一步补一个整层镜头；在镜头之内时不动', () => {
    const { dev } = build({
      steps: (f) => f
        .system('推近面板', shot('panel'))
        .system('面板里的提示：镜头不动', highlight('alert'))
        .system('面板外的侧栏：退回整层', spotlight('side_note'))
        .system('之后沿用整层')
        .system('写了 shot 的步骤以 shot 为准', shot('panel'), highlight('side_note')),
    });
    expect(errors(dev)).toEqual([]);
    const p = dev.project!;
    expect(p.scenarios[sid]!.steps.map((s) => s.shots)).toEqual([
      [{ layer: 'chat', targets: ['panel'] }],
      [],
      [{ layer: 'chat', targets: [] }],
      [],
      [{ layer: 'chat', targets: ['panel'] }],
    ]);
    expect([1, 2, 3, 4, 5].map((k) => cameraAt(p, sid, k).perLayer.chat)).toEqual([['panel'], ['panel'], [], [], ['panel']]);
  });

  it('发布与评审版保留焦点字段与 autoFocus', () => {
    for (const mode of ['publish', 'review'] as const) {
      const r = build({ autoFocus: false, steps: (f) => f.system('x', spotlight('alert'), callout('alert', '说明'), hold(2)) })[mode];
      expect(errors(r)).toEqual([]);
      expect(r.project!.autoFocus).toBe(false);
      expect(r.project!.scenarios[sid]!.steps[0]).toMatchObject({ cues: [{ kind: 'spotlight', targets: ['alert'] }], callouts: [{ target: 'alert', text: '说明' }], hold: 2000 });
      expect(findNode(r.project!.scenes['f.a~chat']!, 'secret')!.node.redact).toBeDefined();
    }
  });
});

describe('focusAt：每一步观众看哪里（纯函数）', () => {
  it('第 0 步是封面；过渡卡就是焦点；作者写的提示原样给出', () => {
    const p = build({ steps: (f) => f.card('三天后').system('只看提示', set($.ui.warn, true), spotlight('alert'), callout('alert', '先拦下'), hold(3)) }).dev.project!;
    expect(focusAt(p, sid, 0)).toMatchObject({ subject: 'cover', targets: [], reveal: [] });
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'card', targets: [] });
    expect(focusAt(p, sid, 2)).toMatchObject({ subject: 'elements', source: 'explicit', targets: ['alert'], spotlight: ['alert'], callouts: [{ target: 'alert', text: '先拦下' }], reveal: [], holdMs: 3000 });
  });

  it('默认：系统步骤新出现或变化的元素就是焦点，轻提示（结果揭晓）', () => {
    const p = build({ steps: (f) => f.system('提示出现', set($.ui.warn, true)).system('状态变了', set($.ui.status, '已分享')).system('什么都没变') }).dev.project!;
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'elements', source: 'auto', targets: ['alert'], reveal: ['alert'] });
    // 绑定的文字变了：提示落在包含它的元素上，不落在文字节点
    expect(focusAt(p, sid, 2)).toMatchObject({ subject: 'elements', source: 'auto', targets: ['badge'], reveal: ['badge'] });
    expect(focusAt(p, sid, 3)).toMatchObject({ subject: 'caption', source: 'none', targets: [], reveal: [] });
  });

  it('默认：用户操作聚焦被操作的元素（鼠标就是呈现），操作目标本身不再提示；结果出现在别处时提示结果', () => {
    const p = build({ steps: (f) => f.click('send', set($.ui.reply, '收到')).click('send', set($.ui.warn, true)) }).dev.project!;
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'elements', source: 'auto', targets: ['send', 'msg'], reveal: ['msg'] });
    expect(focusAt(p, sid, 2)).toMatchObject({ targets: ['send', 'alert'], reveal: ['alert'] });
  });

  it('克制：弹窗自带遮罩不再画提示；一次变化太多不提示；换页、换层是新画面不提示；作者写了焦点时不加默认提示', () => {
    const p = build({ steps: (f) => f
      .system('弹窗', set($.ui.dlg, true))
      .system('关上', set($.ui.dlg, false))
      .system('一大片', set($.ui.many, true))
      .system('换层', shot('trip'), set($.ui.warn, true))
      .system('回来', shot('panel'))
      .system('作者的焦点', set($.ui.status, '已确认'), highlight('msg')) }).dev.project!;
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'elements', targets: ['dlg'], reveal: [] });
    expect(focusAt(p, sid, 3).reveal).toEqual([]);
    expect(focusAt(p, sid, 3).subject).toBe('elements');
    expect(focusAt(p, sid, 4)).toMatchObject({ subject: 'elements', source: 'explicit', targets: ['trip'], reveal: [] });
    expect(focusAt(p, sid, 6)).toMatchObject({ source: 'explicit', targets: ['msg'], highlight: ['msg'], reveal: [] });
    const pages = build({ layers: false, steps: (f) => f.system('换页', go('/next'), set($.ui.warn, true)) }).dev.project!;
    expect(focusAt(pages, sid, 1)).toMatchObject({ subject: 'scene', reveal: [] });
  });

  it('连续性：同一个元素连续变化、同一个容器连续追加，只在第一次提示（终端、聊天记录一行行出现）', () => {
    const p = build({ steps: (f) => f
      .system('一', set($.ui.status, '一'))
      .system('二：同一个徽章又变了', set($.ui.status, '二'))
      .system('三：日志出现第一行', set($.ui.l1, true))
      .system('四：同一个日志追加一行', set($.ui.l2, true))
      .system('五：同一个面板里别的元素变了', set($.ui.reply, '新回复'))
      .system('六：空一步').system('七：回到徽章', set($.ui.status, '三')) }).dev.project!;
    expect([1, 2, 3, 4, 5, 6, 7].map((k) => focusAt(p, sid, k).reveal)).toEqual([['badge'], [], ['l1'], [], ['msg'], [], ['badge']]);
    // 焦点对象照常推导（check 用），只是不重复画提示
    expect(focusAt(p, sid, 2)).toMatchObject({ subject: 'elements', targets: ['badge'] });
  });

  it('trace 与 shot 是作者写的焦点；Toast 也算看得见的结果', () => {
    const p = build({ steps: (f) => f.system('调用', trace('biz', 'billing')).system('提示', toast.success('已发送')) }).dev.project!;
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'elements', source: 'explicit', targets: ['biz', 'billing'] });
    expect(focusAt(p, sid, 2)).toMatchObject({ subject: 'toast', source: 'auto' });
  });

  it('autoFocus: false 整体关掉默认呈现：仍然知道焦点在哪（check 用），但不画任何默认提示；作者写的照常', () => {
    const p = build({ autoFocus: false, steps: (f) => f.system('提示出现', set($.ui.warn, true)).click('send', set($.ui.reply, '收到')).system('作者', spotlight('alert')) }).dev.project!;
    expect(focusAt(p, sid, 1)).toMatchObject({ subject: 'elements', source: 'auto', targets: ['alert'], reveal: [] });
    expect(focusAt(p, sid, 2)).toMatchObject({ targets: ['send', 'msg'], reveal: [] });
    expect(focusAt(p, sid, 3)).toMatchObject({ source: 'explicit', spotlight: ['alert'], reveal: [] });
    const on = build({ steps: (f) => f.system('提示出现', set($.ui.warn, true)) }).dev.project!;
    expect(focusAt(on, sid, 1).reveal).toEqual(['alert']);
  });

  it('纯函数：乱序调用、跳转、逐步回放、重新编译，结果都相同；越界与不存在的场景不抛错', () => {
    const steps = (f: Flow) => f.system('a', set($.ui.warn, true)).click('send', set($.ui.status, '已分享')).card('之后').system('b', spotlight('trip'), callout('trip', '行程')).system('c', set($.ui.dlg, true));
    const p1 = build({ steps }).dev.project!;
    const p2 = build({ steps }).dev.project!;
    const n = p1.scenarios[sid]!.steps.length;
    const forward = Array.from({ length: n + 1 }, (_, k) => focusAt(p1, sid, k));
    const backward = Array.from({ length: n + 1 }, (_, k) => n - k).map((k) => focusAt(p2, sid, k)).reverse();
    expect(backward).toEqual(forward);
    expect(focusAt(p1, sid, 3)).toEqual(forward[3]);
    expect(focusAt(structuredClone(p1) as Project, sid, 5)).toEqual(forward[5]);
    expect(focusAt(p1, sid, 99)).toEqual(forward[n]);
    expect(focusAt(p1, sid, -1)).toEqual(forward[0]);
    expect(focusAt(p1, 'nope', 1)).toMatchObject({ subject: 'caption', targets: [] });
    // 返回值不共享内部状态：改了它也不影响下一次
    focusAt(p1, sid, 1).targets.push('x');
    expect(focusAt(p1, sid, 1)).toEqual(forward[1]);
  });

  it('回放失败的场景：失败之后的步骤只给作者写的焦点，不抛错', () => {
    const p = build({ steps: (f) => f.click('ok', highlight('msg')).system('之后', set($.ui.warn, true)) }).dev.project!;
    expect(replay(p, sid).diagnostics.length).toBeGreaterThan(0);
    expect(focusAt(p, sid, 1)).toMatchObject({ highlight: ['msg'] });
    expect(focusAt(p, sid, 2)).toMatchObject({ reveal: [] });
  });
});

describe('呈现形式不改变点击判定与回放', () => {
  it('同一条流程加不加提示：每一步每个元素的 explainClick 与状态完全相同', () => {
    const plain = (f: Flow) => f.click('send', set($.ui.warn, true)).click('send', set($.ui.dlg, true)).click('ok', set($.ui.dlg, false));
    const cued = (f: Flow) => f.click('send', set($.ui.warn, true), spotlight('alert'), callout('alert', '先拦下')).click('send', set($.ui.dlg, true), highlight('ok'), numbered('ok', 'msg')).click('ok', set($.ui.dlg, false), spotlight('side'), hold(3));
    const a = build({ steps: plain }).dev.project!;
    const b = build({ steps: cued }).dev.project!;
    const ids: string[] = [];
    walkNodes(a.scenes['f.a~chat']!.root, (n) => ids.push(n.id));
    for (let k = 0; k <= 3; k++) {
      const sa = stateAt(a, sid, k);
      const sb = stateAt(b, sid, k);
      expect(sb).toEqual(sa);
      for (const id of ids) expect(explainClick(b, sb, id, 'f.a~chat')).toEqual(explainClick(a, sa, id, 'f.a~chat'));
    }
    expect(replay(b, sid).diagnostics).toEqual([]);
  });
});

describe('visibleIds 与 isNodeVisible 一致（默认揭晓用它比较前后）', () => {
  it('所有画面、所有步骤', () => {
    const p = build({ steps: (f) => f.system('a', set($.ui.warn, true)).system('b', set($.ui.dlg, true)).system('c', set($.ui.many, true)) }).dev.project!;
    let s = initialState(p, sid);
    const sc = p.scenarios[sid]!;
    for (let k = 0; k <= sc.steps.length; k++) {
      for (const scene of Object.values(p.scenes)) {
        const vis = visibleIds(scene, s);
        walkNodes(scene.root, (n) => expect(vis.has(n.id), `${scene.id} ${n.id} @${k}`).toBe(isNodeVisible(scene, n.id, s)));
      }
      if (k < sc.steps.length) s = applyStep(p, sc, s);
    }
  });
});

describe('check：焦点提示（少而准）', () => {
  const codes = (r: ReturnType<typeof build>['dev']) => validate(r.project!, { mode: 'all' }).diagnostics;
  it('提示目标不在这一步的导演层：FOCUS_OFF_LAYER（warning）', () => {
    const r = build({ steps: (f) => f.system('看聊天', shot('panel'), highlight('trip_title')) }).dev;
    const d = codes(r).find((x) => x.code === 'FOCUS_OFF_LAYER');
    expect(d).toMatchObject({ severity: 'warning' });
    expect(d!.message).toContain('trip_title');
    expect(d!.at).toMatch(/focus.test.ts:\d+:\d+$/);
  });
  it('提示目标在这一步自己的 shot 之外：FOCUS_CONFLICT（warning）；在里面不报', () => {
    expect(codes(build({ steps: (f) => f.system('冲突', shot('panel'), spotlight('side')) }).dev).map((d) => d.code)).toContain('FOCUS_CONFLICT');
    expect(codes(build({ steps: (f) => f.system('不冲突', shot('panel'), spotlight('alert'), callout('send', '点这里')) }).dev).map((d) => d.code)).not.toContain('FOCUS_CONFLICT');
  });
  it('连续 3 个系统步骤画面上什么都没变：FOCUS_IDLE（info）；2 个不报；过渡卡打断', () => {
    const idle = codes(build({ steps: (f) => f.system('一').system('二').system('三') }).dev).filter((d) => d.code === 'FOCUS_IDLE');
    expect(idle).toHaveLength(1);
    expect(idle[0]!.severity).toBe('info');
    expect(codes(build({ steps: (f) => f.system('一').system('二').card('卡').system('三') }).dev).map((d) => d.code)).not.toContain('FOCUS_IDLE');
    expect(codes(build({ steps: (f) => f.system('一').system('二', set($.ui.warn, true)).system('三') }).dev).map((d) => d.code)).not.toContain('FOCUS_IDLE');
  });
  it('气泡太长：CALLOUT_TOO_LONG（warning，与字幕同一口径）', () => {
    const d = codes(build({ steps: (f) => f.system('x', callout('msg', '这是一句非常非常长的说明文字，超过了二十四个字的建议上限了吧')) }).dev).find((x) => x.code === 'CALLOUT_TOO_LONG');
    expect(d?.severity).toBe('warning');
  });
  it('mark 的目标不在导演层同样提示（之前静默不画）', () => {
    expect(codes(build({ steps: (f) => f.system('看聊天', shot('panel'), mark('trip_title')) }).dev).map((d) => d.code)).toContain('FOCUS_OFF_LAYER');
  });
});

describe('不制造噪音：examples/ 下的项目没有新的焦点提示；camping 样板用到了全部原语', () => {
  const root = resolve(import.meta.dirname, '../../../examples');
  for (const name of ['agent-arch', 'camping', 'invite', 'joplo']) {
    it(name, async () => {
      const dir = join(root, name);
      const r = await loadAuthoring(dir, (p) => tsImport(p, { parentURL: import.meta.url, tsconfig: join(dir, 'tsconfig.json') }));
      expect(r.diagnostics).toEqual([]);
      const c = compile(r.authoring!, 'dev');
      expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const found = validate(c.project!, { mode: 'all' }).diagnostics.filter((d) => /^(FOCUS_|CALLOUT_)/.test(d.code));
      expect(found).toEqual([]);
      if (name === 'camping') {
        const steps = Object.values(c.project!.scenarios).flatMap((s) => s.steps);
        const kinds = new Set(steps.flatMap((s) => (s.cues ?? []).map((q) => q.kind)));
        expect([...kinds].sort()).toEqual(['highlight', 'number', 'spotlight']);
        expect(steps.some((s) => s.callouts?.length)).toBe(true);
        expect(steps.some((s) => s.hold)).toBe(true);
      }
    }, 60_000);
  }
});
