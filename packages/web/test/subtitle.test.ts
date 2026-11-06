import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 字幕区（画面下方、播放控制上方）：显示哪一步、最多两行（一行说明、一行 explain）、悬停全文；
 * check 的 CAPTION_TOO_LONG / EXPLAIN_TOO_LONG 只提示、不改写作者的文字。界面由用户检查。
 */
import { describe, expect, it } from 'vitest';
import { CAPTION_MAX, EXPLAIN_MAX, SUBTITLE_HEIGHT, captionLength, compile, validate, type AuthoringProject, type Scenario } from '@joplo-app/core';
import * as ui from '@joplo-app/kit/ui';
import { config, explain, feature, flow, option, page, Slot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { SUBTITLE_CAPTION_PX, SUBTITLE_EXPLAIN_PX, subtitleFor } from '../src/player/subtitle-content';

const sc = {
  id: 'f.a.s',
  description: '演示一次完整的调用',
  steps: [
    { id: 's1', kind: 'user', caption: '点击发送', explain: undefined },
    { id: 's2', kind: 'system', caption: '额度预检', explain: '额度不足时在这里就拦下' },
  ],
} as unknown as Scenario;

describe('subtitleFor（字幕区显示的内容）', () => {
  it('第 0 步：初始状态 + 场景描述；之后是刚执行完的一步；播放中是正在播放的一步', () => {
    expect(subtitleFor(sc, 0, null, undefined, zh)).toMatchObject({ index: 0, kind: 'initial', caption: '初始状态', explain: '演示一次完整的调用' });
    expect(subtitleFor(sc, 1, null, undefined, zh)).toMatchObject({ index: 1, kind: 'user', caption: '点击发送', explain: null });
    expect(subtitleFor(sc, 1, 1, undefined, zh)).toMatchObject({ index: 2, kind: 'system', caption: '额度预检', explain: '额度不足时在这里就拦下' });
    expect(subtitleFor(sc, 99, null, undefined, zh)!.index).toBe(2);
    expect(subtitleFor(null, 0, null, undefined, zh)).toBeNull();
  });
  it('最多两行：说明一行、explain 一行；没有 explain 时只有一行；悬停显示全文（不截断原文）', () => {
    const a = subtitleFor(sc, 2, null, undefined, zh)!;
    expect([a.captionLines, a.explainLines]).toEqual([1, 1]);
    expect(a.title).toBe('额度预检\n额度不足时在这里就拦下');
    const b = subtitleFor(sc, 1, null, undefined, zh)!;
    expect([b.captionLines, b.explainLines]).toEqual([1, 0]);
    expect(b.title).toBe('点击发送');
  });
  it('字号：说明 ≥ 20px，explain 小一号；固定高度放得下两行', () => {
    expect(SUBTITLE_CAPTION_PX).toBeGreaterThanOrEqual(20);
    expect(SUBTITLE_EXPLAIN_PX).toBeLessThan(SUBTITLE_CAPTION_PX);
    expect(SUBTITLE_HEIGHT).toBeGreaterThanOrEqual(SUBTITLE_CAPTION_PX * 1.35 + SUBTITLE_EXPLAIN_PX * 1.5 + 4 + 16);
  });
});

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

describe('check：说明与 explain 过长时只给 warning（带 at），不改写文字', () => {
  it('captionLength：中文一个算 1，英文按 0.5，空白不算', () => {
    expect(captionLength('额度预检')).toBe(4);
    expect(captionLength('Biz Server')).toBe(4.5);
    expect(captionLength('调用 read_files@1')).toBe(2 + 6);
  });
  it('超过 24 / 48 报 CAPTION_TOO_LONG / EXPLAIN_TOO_LONG，提示移到单独的说明层；不超过的不报', () => {
    const longCap = '客户端上报它实现了两个工具，Biz Server 从 Registry 取这两个定义，再加上云端工具';
    const longExp = '这就是定义与实现分离：Registry 只存定义。Biz Server 按客户端实际实现的版本挑出能用的工具，大脑永远不会拿到一个没有实现的工具。';
    expect(captionLength(longCap)).toBeGreaterThan(CAPTION_MAX);
    expect(captionLength(longExp)).toBeGreaterThan(EXPLAIN_MAX);
    const home = page({ title: 'P', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'go' }, '去'), h(Slot, { name: 'main' })));
    const opt = option({ name: 'A', idea: 'i', on: {}, state: { ui: {} }, scenarios: { s: flow('一次', { start: '/' }).click('go', longCap, explain(longExp)).system('短', '额度预检', explain('够用')) } });
    const src: AuthoringProject = {
      root: '/p',
      config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
      layouts: {},
      routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
    };
    const p = compile(src, 'dev').project!;
    expect(p.scenarios['f.a.s']!.steps[0]!.caption).toBe(longCap); // 原文不变
    const ds = validate(p, { mode: 'structure' }).diagnostics;
    const cap = ds.filter((d) => d.code === 'CAPTION_TOO_LONG');
    const exp = ds.filter((d) => d.code === 'EXPLAIN_TOO_LONG');
    expect(cap).toHaveLength(1);
    expect(exp).toHaveLength(1);
    for (const d of [...cap, ...exp]) {
      expect(d.severity).toBe('warning');
      expect(d.at).toBeTruthy();
      expect(d.message).toContain("layer('设计理由'");
    }
  });
});
