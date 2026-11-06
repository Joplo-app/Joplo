import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 看板 UI v1（D55）阶段 4：状态与细节（design/png/41-细节与状态.png、34-窄屏收起规则.png）。
 * - 播放中的停留进度：控制器在每一步停留时公布 dwell，时间线的当前步据此从左往右填深黄，暂停时停住；
 * - 点错位置的三种提示（沿用 notice.kind）；场景完成后的“下一个情况”；缺口横幅；编译出错横幅；
 * - 导出视频的进度与取消；快捷键面板；标签页标题与 favicon 状态点；窄屏收起 ⑤–⑦。
 */
import { describe, expect, it, vi } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { boardLayout, timelineChips } from '../src/player/layout';
import { SHORTCUTS, faviconHref, noticeView, tabTitle } from '../src/player/states';
import { diagnosticsSummary, exportProgress, gapBanner, nextCase } from '../src/board/states-model';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function twoStep(): Project {
  const home = page({ title: '首页', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, '去'), h(ui.Button, { id: 'more' }, '再去')));
  const opt = option({ name: 'A', idea: 'i', on: {}, state: { ui: {} }, scenarios: { s: flow('一次', { start: '/' }).click('go').click('more') } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return compile(src, 'dev').project!;
}

describe('播放中的停留进度', () => {
  it('自动播放：每一步停留时公布 dwell（停在第几步、总时长、已过去多少）；结束或停止后清空', async () => {
    const c = new DemoController(null);
    c.reducedMotion = true;
    c.setProject(twoStep(), 1, null);
    c.setScenario('f.a.s', 0, { quiet: true });
    const seen: { position: number; ms: number; elapsed: number }[] = [];
    const off = c.subscribe(() => {
      const d = c.getSnapshot().dwell;
      if (d && !seen.some((x) => x.position === d.position)) seen.push(d);
    });
    await c.play();
    off();
    expect(seen.map((d) => d.position)).toEqual([1, 2]);
    for (const d of seen) {
      expect(d.ms).toBeGreaterThan(0);
      expect(d.elapsed).toBeGreaterThanOrEqual(0);
    }
    expect(c.getSnapshot().dwell).toBeNull();
  });
  it('时间线：只有停留中的当前步带进度；暂停时标记 paused', () => {
    const steps = [
      { caption: 'a', kind: 'user' as const },
      { caption: 'b', kind: 'user' as const },
    ];
    const chips = timelineChips(steps, 1, null, { position: 1, ms: 3000, elapsed: 500 }, false, zh);
    expect(chips[1]!.dwell).toEqual({ ms: 3000, elapsed: 500, paused: false });
    expect(chips.filter((c) => c.dwell).length).toBe(1);
    expect(timelineChips(steps, 1, null, { position: 1, ms: 3000, elapsed: 0 }, true, zh)[1]!.dwell!.paused).toBe(true);
    // dwell 属于别的位置（例如刚跳了步）：不显示
    expect(timelineChips(steps, 2, null, { position: 1, ms: 3000, elapsed: 0 }, false, zh).some((c) => c.dwell)).toBe(false);
    expect(timelineChips(steps, 1, null, null, false, zh).some((c) => c.dwell)).toBe(false);
  });
});

describe('点错位置：就地说明，不打断（三种写法）', () => {
  it('控制器：点了不是下一步的元素 → out_of_order 提示，3 秒后自动消失；状态不变', async () => {
    vi.useFakeTimers();
    try {
      const c = new DemoController(null);
      c.reducedMotion = true;
      c.setProject(twoStep(), 1, null);
      c.setScenario('f.a.s', 0, { quiet: true });
      await c.clickNode('more', { x: 0, y: 0 });
      expect(c.getSnapshot().notice).toMatchObject({ kind: 'out_of_order', nodeId: 'more' });
      expect(c.getSnapshot().state!.position).toBe(0);
      vi.advanceTimersByTime(2900);
      expect(c.getSnapshot().notice).not.toBeNull();
      vi.advanceTimersByTime(200);
      expect(c.getSnapshot().notice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('下一步不是它 / 没有覆盖 / 现在不可用，各有图标；“回到演示”只在顺序不对时出现', () => {
    expect(noticeView({ kind: 'out_of_order', nodeId: 'x', text: '按当前场景，下一步是：点击「邀请成员」' }, zh)).toEqual({ icon: 'next', text: '按当前场景，下一步是：点击「邀请成员」', back: true, flashTarget: true });
    expect(noticeView({ kind: 'uncovered', nodeId: 'x', text: '当前演示未覆盖此操作：「空间设置」' }, zh)).toMatchObject({ icon: 'uncovered', back: false, flashTarget: true });
    expect(noticeView({ kind: 'disabled', nodeId: 'x', text: '邮箱格式不对' }, zh)).toMatchObject({ icon: 'disabled', back: false, flashTarget: true });
    expect(noticeView({ kind: 'info', text: '提示' }, zh)).toMatchObject({ icon: 'info', flashTarget: false });
    expect(noticeView({ kind: 'error', text: '坏了' }, zh)).toMatchObject({ icon: 'error' });
    expect(noticeView(null, zh)).toBeNull();
  });
});

// ---------- 创作侧 ----------
const project = {
  features: { invite: { id: 'invite', name: '邀请', caseIds: ['c1', 'c2', 'c3', 'c4'], optionIds: ['o.a', 'o.b', 'o.c'], pick: 'o.a' } },
  cases: { c1: { title: '正常' }, c2: { title: '邮箱为空' }, c3: { title: '已经是成员' }, c4: { title: '发送失败' } },
  options: {
    'o.a': { id: 'o.a', featureId: 'invite', name: 'A · 弹窗', coverage: { c1: { status: 'expressed', scenarioIds: [] }, c2: { status: 'missing', scenarioIds: [] }, c3: { status: 'undecided', scenarioIds: [] }, c4: { status: 'expressed', scenarioIds: [] } } },
    'o.b': { id: 'o.b', featureId: 'invite', name: 'B · 独立页', coverage: { c2: { status: 'missing', scenarioIds: [] } } },
    'o.c': { id: 'o.c', featureId: 'invite', name: 'C · 批量', coverage: { c2: { status: 'expressed', scenarioIds: [] } } },
  },
  scenarios: {},
} as unknown as Project;

describe('场景完成后的“下一个情况”', () => {
  it('左栏顺序里，当前方案已表达的下一个情况（跳过缺失、待决定）；没有就不显示；不从头绕回', () => {
    expect(nextCase(project, 'invite', 'o.a', 'c1')).toEqual({ caseId: 'c4', title: '发送失败' });
    expect(nextCase(project, 'invite', 'o.a', 'c4')).toBeNull();
    expect(nextCase(project, 'invite', 'o.b', 'c1')).toBeNull();
  });
  it('边界输入：没有方案、没有情况、情况不在这个功能里', () => {
    expect(nextCase(project, 'invite', null, 'c1')).toBeNull();
    expect(nextCase(project, 'invite', 'o.a', null)).toEqual({ caseId: 'c1', title: '正常' });
    expect(nextCase(project, 'invite', 'o.a', 'zzz')).toBeNull();
    expect(nextCase(project, 'nope', 'o.a', 'c1')).toBeNull();
  });
});

describe('缺口横幅', () => {
  it('给 Agent 的话；“看方案 X 怎么处理”取第一个已表达这个情况的其他方案，没有就不显示', () => {
    expect(gapBanner(project, 'invite', 'o.a', 'c2', zh)).toEqual({
      letter: 'A',
      caseTitle: '邮箱为空',
      agentText: '给方案 A 补上「邮箱为空」的场景（npx joplo check --option o.a）',
      alt: { optionId: 'o.c', letter: 'C' },
    });
    // C 缺“已经是成员”：A 是待决定、B 没有记录，都不算已表达 → 不显示“看方案 X”
    expect(gapBanner(project, 'invite', 'o.c', 'c3', zh)!.alt).toBeNull();
  });
  it('边界输入：没有方案或情况时返回 null', () => {
    expect(gapBanner(project, 'invite', null, 'c2', zh)).toBeNull();
    expect(gapBanner(project, 'invite', 'o.a', null, zh)).toBeNull();
  });
});

describe('编译出错横幅', () => {
  it('错误数 + 第一条 文件:行；只算 error；没有错误时返回 null', () => {
    const list = [
      { severity: 'warning', message: 'w', at: 'a.tsx:1' },
      { severity: 'error', message: '未知组件 Buton，是不是 Button?', at: 'options/a-modal.tsx:42' },
      { severity: 'error', message: '另一个', at: null },
    ] as never;
    expect(diagnosticsSummary(list)).toEqual({ count: 2, first: { at: 'options/a-modal.tsx:42', message: '未知组件 Buton，是不是 Button?' } });
    expect(diagnosticsSummary([{ severity: 'warning', message: 'w', at: null }] as never)).toBeNull();
    expect(diagnosticsSummary([])).toBeNull();
  });
});

describe('导出视频的进度', () => {
  const job = (patch: Record<string, unknown>) => ({ id: 'j', projectId: 'p', scenarioId: 's', status: 'running', phase: 'recording', step: 3, total: 5, percent: 56, file: null, error: null, ...patch }) as never;
  it('录制中写“第 3 / 5 步”；启动、保存、完成、失败、取消各有说明；没有任务时为 null', () => {
    expect(exportProgress(job({}), '管理员成功发出邀请', zh)).toEqual({ running: true, percent: 56, text: '正在录制「管理员成功发出邀请」', step: '第 3 / 5 步', done: false, error: null });
    expect(exportProgress(job({ phase: 'starting', step: 0, percent: 2 }), 'x', zh)).toMatchObject({ running: true, step: '正在启动浏览器…' });
    expect(exportProgress(job({ status: 'done', phase: 'done', percent: 100, file: 'exports/a.webm' }), 'x', zh)).toMatchObject({ running: false, done: true, text: '已导出 exports/a.webm' });
    expect(exportProgress(job({ status: 'error', phase: 'error', error: '已取消' }), 'x', zh)).toMatchObject({ running: false, error: '已取消' });
    expect(exportProgress(null, 'x', zh)).toBeNull();
  });
});

describe('快捷键面板（?）', () => {
  it('列出全部快捷键，按播放 / 画面 / 其他分组', () => {
    expect(SHORTCUTS(zh).map((g) => g.group)).toEqual(['播放', '画面', '其他']);
    const keys = SHORTCUTS(zh).flatMap((g) => g.items.map((i) => i.keys));
    for (const k of ['空格', '← →', 'Home', 'F', '按住 ⌥', 'T', '?', '[']) expect(keys).toContain(k);
  });
});

describe('标签页标题与 favicon 状态点', () => {
  it('标题“功能 · 项目”；出错加 ✕；导出中写进度', () => {
    expect(tabTitle({ feature: '团队成员邀请', project: '团队邀请功能' }, zh)).toBe('团队成员邀请 · 团队邀请功能');
    expect(tabTitle({ feature: '团队成员邀请', project: '团队邀请功能', error: true }, zh)).toBe('✕ 团队成员邀请 · 团队邀请功能');
    expect(tabTitle({ feature: '团队成员邀请', project: '团队邀请功能', exporting: '3/5' }, zh)).toBe('团队成员邀请 · 导出中 3/5');
    expect(tabTitle({ feature: null, project: null }, zh)).toBe('Joplo · 看板');
  });
  it('favicon：标志；出错右下角红点，导出中黄点', () => {
    const plain = decodeURIComponent(faviconHref(null));
    expect(plain.startsWith('data:image/svg+xml,')).toBe(true);
    expect(plain).not.toContain('data-dot');
    expect(decodeURIComponent(faviconHref('error'))).toContain('data-dot="error"');
    expect(decodeURIComponent(faviconHref('busy'))).toContain('data-dot="busy"');
  });
});

describe('窄屏收起（34 ⑤–⑦）', () => {
  it('< 1100 左栏收成 56px 竖条；< 900 时间线只剩当前步和总数、字幕 explain 收进悬停', () => {
    expect(boardLayout(1280, zh)).toMatchObject({ rail: false, compactTimeline: false, explainInTip: false });
    expect(boardLayout(1099, zh)).toMatchObject({ rail: true, navWidth: 56, compactTimeline: false });
    expect(boardLayout(899, zh)).toMatchObject({ rail: true, compactTimeline: true, explainInTip: true });
  });
});
