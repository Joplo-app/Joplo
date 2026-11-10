import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 字幕（D97）：浮在画面底部正中，只放正在说的话；标题与说明在左上角的步骤标题条里。显示哪一步只依赖位置。
 * check 的 CAPTION_TOO_LONG / EXPLAIN_TOO_LONG 只提示、不改写作者的文字。界面由用户检查。
 */
import { describe, expect, it } from 'vitest';
import { CAPTION_MAX, EXPLAIN_MAX, captionLength, compile, validate, type AuthoringProject, type Scenario } from '@joplo-app/core';
import * as ui from '@joplo-app/plugin-ui';
import { explain, feature, flow, work, page, Slot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { SUBTITLE_PX, TITLE_CAPTION_PX, TITLE_EXPLAIN_PX, spokenSubtitleFor, stepTitleFor } from '../src/player/subtitle-content';

const sc = {
  id: 'f.a.s',
  description: '演示一次完整的调用',
  steps: [
    { id: 's1', kind: 'user', caption: '点击发送', explain: undefined, action: { type: 'click', target: 'send' } },
    { id: 's2', kind: 'system', caption: '额度预检', explain: '额度不足时在这里就拦下', action: { type: 'event', name: '额度预检' } },
  ],
} as unknown as Scenario;

describe('字幕与步骤标题条显示哪一步', () => {
  it('第 0 步没有字幕也没有标题条；之后是刚执行完的一步；播放中是正在播放的一步；超出时夹到最后一步', () => {
    expect(spokenSubtitleFor(sc, 0, null, zh)).toBeNull();
    expect(stepTitleFor(sc, 0, null, null, zh)).toBeNull();
    expect(spokenSubtitleFor(sc, 1, null, zh)).toMatchObject({ index: 1, text: '点击发送' });
    expect(spokenSubtitleFor(sc, 1, 1, zh)).toMatchObject({ index: 2, text: '额度预检' });
    expect(stepTitleFor(sc, 1, 1, null, zh)).toMatchObject({ index: 2, caption: '额度预检', explain: '额度不足时在这里就拦下' });
    expect(spokenSubtitleFor(sc, 99, null, zh)!.index).toBe(2);
    expect(spokenSubtitleFor(null, 0, null, zh)).toBeNull();
  });
  it('explain 只在标题条里，不进字幕', () => {
    expect(spokenSubtitleFor(sc, 2, null, zh)!.text).toBe('额度预检');
    expect(stepTitleFor(sc, 1, null, null, zh)!.explain).toBeNull();
  });
  it('字号：字幕 17px，比标题条的标题大；说明比标题小一号', () => {
    expect(SUBTITLE_PX).toBe(17);
    expect(TITLE_CAPTION_PX).toBeLessThan(SUBTITLE_PX);
    expect(TITLE_EXPLAIN_PX).toBeLessThan(TITLE_CAPTION_PX);
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
    const opt = work({ title: 'A', summary: 'i', on: {}, state: { ui: {} }, scenarios: { s: flow('一次', { start: '/' }).click('go', longCap, explain(longExp)).system('短', '额度预检', explain('够用')) } });
    const src: AuthoringProject = {
      root: '/p',
      config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
      layouts: {},
      routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
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
      expect(d.message).toContain("layer('Design rationale'");
    }
  });
});
