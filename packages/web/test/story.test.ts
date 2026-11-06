/** D56：流式输出的节奏与过渡卡的时间线格子（纯函数）。 */
import { describe, expect, it } from 'vitest';
import { MIN_DWELL, STREAM_MAX, STREAM_MIN, STREAM_MS_PER_CHAR, stepDwell, streamMs } from '../src/runtime/pace';
import { timelineChips } from '../src/player/layout';

describe('streamMs / stepDwell 的流式输出', () => {
  it('按字数计时，有上下限，随速度缩放；空文字为 0', () => {
    expect(streamMs('')).toBe(0);
    expect(streamMs('短')).toBe(STREAM_MIN);
    expect(streamMs('字'.repeat(40))).toBe(40 * STREAM_MS_PER_CHAR);
    expect(streamMs('字'.repeat(40), 2)).toBe((40 * STREAM_MS_PER_CHAR) / 2);
    expect(streamMs('字'.repeat(10000))).toBe(STREAM_MAX);
  });
  it('有流式输出的一步：等最长的一段出完再留阅读时间，不会比没有时短', () => {
    const text = '字'.repeat(80);
    const base = stepDwell({ texts: ['助手回复'] });
    const withStream = stepDwell({ texts: ['助手回复'], streams: ['短', text] });
    expect(base).toBe(MIN_DWELL);
    expect(withStream).toBeGreaterThanOrEqual(streamMs(text) + MIN_DWELL);
    expect(stepDwell({ texts: ['助手回复'], streams: [] })).toBe(base);
  });
});

describe('时间线：过渡卡的格子', () => {
  it('标成 card，悬停写“过渡 · 标题”；普通步骤没有 card 字段', () => {
    const chips = timelineChips([{ caption: '3 天后', kind: 'card' }, { caption: '点击发送', kind: 'user' }], 0, null);
    expect(chips[1]).toMatchObject({ card: true, system: false, tip: '1 · 过渡 · 3 天后' });
    expect('card' in chips[2]!).toBe(false);
  });
});
