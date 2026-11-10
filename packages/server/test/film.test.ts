/** `joplo render --film` 的判读规则：硬切、静止与章节衔接的客观数字（纯函数，不开浏览器）。 */
import { describe, expect, it } from 'vitest';
import { findCuts, findStills, stepBoundaries, CUT_CHANGED } from '../src/film.ts';

const frames = (changed: number[], opts: { every?: number; positions?: number[]; scenarios?: string[] } = {}) =>
  changed.map((c, i) => ({ t: i * (opts.every ?? 50), changed: c, diff: c / 4, still: 0, scenarioId: opts.scenarios?.[i] ?? 's', position: opts.positions?.[i] ?? 0 }));

describe('findCuts', () => {
  it('一帧之内整屏突变、前后都平静：硬切', () => {
    const cuts = findCuts(frames([0, 0.01, 0.6, 0.01, 0]));
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ atMs: 100, changed: 0.6 });
  });
  it('持续的快速运镜（每帧都变很多）不算硬切；交叉淡化（变化摊在多帧）也不算', () => {
    expect(findCuts(frames([0, 0.5, 0.55, 0.5, 0.45, 0]))).toEqual([]);
    expect(findCuts(frames([0, 0.1, 0.2, 0.25, 0.2, 0.1, 0]))).toEqual([]);
  });
  it('低于门槛的变化永远不算', () => {
    expect(findCuts(frames([0, CUT_CHANGED - 0.01, 0]))).toEqual([]);
  });
});

describe('findStills', () => {
  it('把同一个静止起点的连续帧合成一段，只报告够长的', () => {
    const s = [0, 50, 100, 150, 200, 0, 50].map((still, i) => ({ t: 1000 + i * 50, still, scenarioId: 's', position: 1 }));
    expect(findStills(s, 150)).toEqual([{ fromMs: 1000, toMs: 1200, scenarioId: 's', position: 1 }]);
    expect(findStills(s, 500)).toEqual([]);
  });
});

describe('stepBoundaries', () => {
  it('每次提交一步都给出窗口内的最大相邻帧差，并标出换章', () => {
    const b = stepBoundaries(frames([0, 0.02, 0.3, 0.02, 0, 0.1, 0], { positions: [0, 0, 1, 1, 1, 0, 0], scenarios: ['a', 'a', 'a', 'a', 'a', 'b', 'b'] }), 0, 100);
    expect(b.map(x => [x.atMs, x.position, x.chapter, x.maxChanged])).toEqual([[100, 1, false, 0.3], [250, 0, true, 0.1]]);
  });
});

describe('renderVideo 的纯函数（#59）', () => {
  it('videoCues：页面时间对到视频时间，空字幕结束上一条，结尾截到视频末尾', async () => {
    const { videoCues, srt } = await import('../src/export.ts');
    const cues = videoCues([{ at: 1500, text: '第一句' }, { at: 3500, text: null }, { at: 4000, text: 'Second\nline' }], 1000, 6);
    expect(cues).toEqual([{ start: 0.5, end: 2.5, text: '第一句' }, { start: 3, end: 6, text: 'Second\nline' }]);
    expect(srt(cues)).toBe('1\n00:00:00,500 --> 00:00:02,500\n第一句\n\n2\n00:00:03,000 --> 00:00:06,000\nSecond\nline\n');
    // 开播前（origin 之前）的字幕从 0 开始；太短的丢掉
    expect(videoCues([{ at: 900, text: 'a' }, { at: 1020, text: 'b' }, { at: 1040, text: null }], 1000, 5)).toEqual([]);
  });
});
