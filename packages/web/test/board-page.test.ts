/**
 * 看板 UI v1（D55）阶段 2：演示页结构的纯计算。
 * - 布局（不变量 1：一屏放下）：≥ 1440 全部展开（左栏 276、当前步 280）；< 1440 顶栏按钮只剩图标、左栏 240、当前步 200、缩放只剩 − +；
 *   1280×800 与 1440×900 下播放坞放得下“回到开头 / 上一步 / 播放 / 下一步 + 当前步 + 5 格 + 速度 + 缩放”；
 * - 时间线：当前步展开写说明，其余只有序号；悬停写“序号 · 说明”，系统步骤标“系统”；点一格 = clickStepChip(序号 − 1)；
 * - 层级标签（D55 取代 D46“导演跟随时不高亮”）：正在看的那层总是高亮；导演跟随时它带摄像机；
 * - 左栏：方案字母与名字、缺口统计、其他方案的小标（悬停写全称）、悬停卡片、缺口汇总命令、功能下拉。
 */
import { describe, expect, it } from 'vitest';
import type { Project } from '@joplo-app/core';
import { SPEEDS } from '../src/runtime/pace';
import { BOARD_WIDE, boardLayout, dockWidth, layerTabs, timelineChips } from '../src/player/layout';
import { caseCard, featureMenu, gapCommand, optionLabel, optionMeta, otherOptionTags } from '../src/board/nav-model';

describe('布局断点（34-窄屏收起规则 ①–④）', () => {
  it('≥ 1440 全部展开；< 1440 顶栏只剩图标、左栏 240、当前步 200、缩放只剩 − +', () => {
    expect(boardLayout(1440)).toEqual({ wide: true, navWidth: 276, topLabels: true, currentStepW: 280, zoomLabel: true, rail: false, compactTimeline: false, explainInTip: false });
    expect(boardLayout(1920).wide).toBe(true);
    expect(boardLayout(1439)).toEqual({ wide: false, navWidth: 240, topLabels: false, currentStepW: 200, zoomLabel: false, rail: false, compactTimeline: false, explainInTip: false });
    expect(boardLayout(1280).navWidth).toBe(240);
    expect(BOARD_WIDE).toBe(1440);
  });
  it('边界输入：0、负数、NaN 都按窄屏处理', () => {
    for (const w of [0, -1, Number.NaN]) expect(boardLayout(w).wide).toBe(false);
  });
  for (const [vw, vh] of [
    [1280, 800],
    [1440, 900],
  ] as const)
    it(`${vw}×${vh}：播放坞放得下当前步 + 5 格（不出现页面滚动）`, () => {
      const L = boardLayout(vw);
      // 中间列 = 视口 − 左栏 − 左右内边距 16×2
      const main = vw - L.navWidth - 32;
      for (const label of ['播放', '暂停', '继续', '重新播放']) expect(dockWidth(L, label, SPEEDS, 6), `${label}`).toBeLessThanOrEqual(main);
    });
});

describe('时间线', () => {
  const steps = [
    { caption: '点击邀请', kind: 'user' as const },
    { caption: '填写邮箱', kind: 'user' as const },
    { caption: '服务端发送邮件', kind: 'system' as const },
  ];
  it('第 0 步：初始是当前，其余都是待做；点格子传 序号 − 1', () => {
    const c = timelineChips(steps, 0, null);
    expect(c.map((x) => x.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(c.map((x) => x.stepIndex)).toEqual([-1, 0, 1, 2]);
    expect(c[0]).toMatchObject({ index: 0, label: '初始', tip: '0 · 初始状态', system: false });
  });
  it('第 2 步：前面是已完成，当前步写说明；系统步骤的悬停提示带“系统”', () => {
    const c = timelineChips(steps, 2, null);
    expect(c.map((x) => x.state)).toEqual(['done', 'done', 'current', 'todo']);
    expect(c[2]).toMatchObject({ label: '填写邮箱', tip: '2 · 填写邮箱' });
    expect(c[3]).toMatchObject({ system: true, tip: '3 · 系统 · 服务端发送邮件' });
  });
  it('播放中：正在执行的一步算当前（activeStep 优先于 position）', () => {
    const c = timelineChips(steps, 1, 2);
    expect(c.map((x) => x.state)).toEqual(['done', 'done', 'done', 'current']);
    expect(c[3]!.playing).toBe(true);
  });
  it('边界输入：没有步骤、位置越界', () => {
    expect(timelineChips([], 0, null).map((x) => x.state)).toEqual(['current']);
    expect(timelineChips(steps, 99, null).at(-1)!.state).toBe('done');
  });
});

describe('层级标签（D55）', () => {
  const layers = [
    { id: 'client', title: '客户端视角' },
    { id: 'backend', title: '后端流转' },
  ];
  it('导演跟随：正在看的那层高亮并带摄像机；手动：高亮但没有摄像机', () => {
    expect(layerTabs(layers, 'backend', true)).toEqual([
      { id: 'client', title: '客户端视角', active: false, camera: false },
      { id: 'backend', title: '后端流转', active: true, camera: true },
    ]);
    expect(layerTabs(layers, 'client', false).map((t) => [t.active, t.camera])).toEqual([
      [true, false],
      [false, false],
    ]);
  });
});

// ---------- 左栏模型 ----------
const project = {
  features: { invite: { id: 'invite', name: '团队成员邀请', caseIds: ['invite.ok', 'invite.empty', 'invite.dup'], optionIds: ['invite.a', 'invite.b'], pick: 'invite.a' }, other: { id: 'other', name: '空间设置', caseIds: ['other.x'], optionIds: [], pick: null } },
  cases: { 'invite.ok': { title: '正常发出邀请' }, 'invite.empty': { title: '邮箱为空' }, 'invite.dup': { title: '已经是成员' }, 'other.x': { title: 'x' } },
  options: {
    'invite.a': { id: 'invite.a', featureId: 'invite', name: 'A · 单人邮件邀请弹窗', idea: '在成员页弹窗', tradeoffs: ['+ 快'], coverage: { 'invite.ok': { status: 'expressed', scenarioIds: ['invite.a.ok'] }, 'invite.empty': { status: 'missing', scenarioIds: [], reason: '还没有场景' }, 'invite.dup': { status: 'undecided', scenarioIds: [] } } },
    'invite.b': { id: 'invite.b', featureId: 'invite', name: '独立页面批量邀请', idea: '单独一页', tradeoffs: [], coverage: { 'invite.ok': { status: 'expressed', scenarioIds: ['invite.b.ok'] }, 'invite.empty': { status: 'expressed', scenarioIds: ['invite.b.empty'] } } },
  },
  scenarios: { 'invite.a.ok': { id: 'invite.a.ok', name: '发出邀请' }, 'invite.b.ok': { id: 'invite.b.ok', name: '批量发出' }, 'invite.b.empty': { id: 'invite.b.empty', name: '邮箱校验失败' } },
} as unknown as Project;

describe('左栏：方案行', () => {
  it('“A · 名字”拆成字母与名字；没有字母前缀时按顺序补 A / B / C', () => {
    expect(optionLabel(project.options['invite.a']!, 0)).toEqual({ letter: 'A', title: '单人邮件邀请弹窗' });
    expect(optionLabel(project.options['invite.b']!, 1)).toEqual({ letter: 'B', title: '独立页面批量邀请' });
    expect(optionLabel({ name: '很长很长的前缀 · 名字' } as never, 2)).toEqual({ letter: 'C', title: '很长很长的前缀 · 名字' });
  });
  it('元信息：是否选定、缺失与待决定的数量（没有覆盖记录算缺失）', () => {
    expect(optionMeta(project, 'invite.a')).toEqual({ picked: true, missing: 1, undecided: 1, text: '缺失 1 · 待决定 1' });
    expect(optionMeta(project, 'invite.b')).toEqual({ picked: false, missing: 1, undecided: 0, text: '缺失 1' });
    expect(optionMeta(project, 'nope')).toEqual({ picked: false, missing: 0, undecided: 0, text: '' });
  });
});

describe('左栏：情况行', () => {
  it('其他方案的小标：字母 + 状态，悬停写全称“B：缺失”', () => {
    expect(otherOptionTags(project, 'invite', 'invite.a', 'invite.dup')).toEqual([{ optionId: 'invite.b', letter: 'B', status: 'none', tip: 'B：缺失' }]);
    expect(otherOptionTags(project, 'invite', 'invite.a', 'invite.ok')[0]!.tip).toBe('B：已表达');
    expect(otherOptionTags(project, 'invite', null, 'invite.ok').map((t) => t.letter)).toEqual(['A', 'B']);
  });
  it('悬停卡片：每个方案的状态与原因（原因 > 场景名 > 缺省说明）', () => {
    expect(caseCard(project, 'invite', 'invite.empty')).toEqual([
      { optionId: 'invite.a', letter: 'A', title: '单人邮件邀请弹窗', status: 'missing', label: '缺失', detail: '还没有场景' },
      { optionId: 'invite.b', letter: 'B', title: '独立页面批量邀请', status: 'expressed', label: '已表达', detail: '场景：邮箱校验失败' },
    ]);
    expect(caseCard(project, 'invite', 'invite.dup')[1]).toMatchObject({ status: 'none', label: '缺失', detail: '还没有表达这个情况' });
    expect(caseCard(project, 'missing-feature', 'x')).toEqual([]);
  });
  it('缺口汇总的命令', () => {
    expect(gapCommand('invite.a')).toBe('npx joplo check --option invite.a');
  });
});

describe('顶栏：功能下拉', () => {
  it('列出本项目的功能和缺口数；当前功能打勾', () => {
    expect(featureMenu(project, 'invite')).toEqual([
      { id: 'invite', name: '团队成员邀请', hint: '已选 A · 缺失 1 · 待决定 1', current: true },
      { id: 'other', name: '空间设置', hint: '未选定', current: false },
    ]);
  });
});
