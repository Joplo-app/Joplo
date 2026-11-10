import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * D100：语音输入一类的演示。
 * - stream() 接着往后写：新值以原值开头时只有新加的字逐字出现（streamPlan.keep）；
 * - stream(…, { pace: 'voice' })：新加的字在这一步朗读的估算时长里出完（与 voiceMs 同一套估算）；
 * - say(…, { role })：系统步骤也能用角色的声音读，字幕显示这个人。
 */
import { describe, expect, it } from 'vitest';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import * as ui from '@joplo-app/plugin-ui';
import { $, Slot, feature, flow, layer, work, page, role, say, stream, type EffectDef } from '@joplo-app/kit';
import { compile, speakerRoleAt, stateAt, streamMs, streamPlan, voicePacedMs, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const sid = 'f.a.happy';

function build(steps: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>) {
  const home = page({ title: '首页', layout: false }, h(ui.Stack, null, h(Slot, { name: 'main' })));
  const opt = work({
    title: 'A', summary: 'i', on: {},
    state: { ui: { spoken: '', note: '' } },
    layers: { box: layer('输入框', h(ui.Stack, null, h(ui.Button, { id: 'mic' }, '麦克风'), h(ui.Text, { id: 'spoken' }, $.ui.spoken))) },
    scenarios: { happy: steps(flow('说', { start: '/' })) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, roles: { me: role('我'), bot: role('助手') }, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}
const errors = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.severity === 'error');
const speak = (spoken: string, line: string, ...more: EffectDef[]) => [stream($.ui.spoken, spoken, { pace: 'voice' }), say(line, { role: 'me' }), ...more];

describe('stream() 接着往后写', () => {
  it('新值以原值开头：原有的字保留，只有新加的字逐字出现，时长按新加的字算', () => {
    const r = build((f) => f.click('mic', stream($.ui.spoken, '帮我写一封')).system('接着说', stream($.ui.spoken, '帮我写一封邮件给王总。')));
    expect(errors(r)).toEqual([]);
    const p = r.project!;
    const [first, second] = p.scenarios[sid]!.steps;
    expect(streamPlan(first, stateAt(p, sid, 0))).toEqual([{ path: 'ui.spoken', value: '帮我写一封', keep: 0, ms: streamMs('帮我写一封') }]);
    expect(streamPlan(second, stateAt(p, sid, 1))).toEqual([{ path: 'ui.spoken', value: '帮我写一封邮件给王总。', keep: 5, ms: streamMs('邮件给王总。') }]);
    // 不知道之前的状态（估算）时整段重出；新值不是接着写的（改写、清空后重写）也整段重出
    expect(streamPlan(second, null)[0]!.keep).toBe(0);
    expect(streamPlan(second, { ui: { spoken: '另一句' }, data: {}, inputs: {} })[0]!.keep).toBe(0);
    // 值没有变：没有要出的字
    expect(streamPlan(second, stateAt(p, sid, 2))).toEqual([{ path: 'ui.spoken', value: '帮我写一封邮件给王总。', keep: 11, ms: 0 }]);
  });
});

describe("stream(…, { pace: 'voice' }) 跟着朗读出字", () => {
  it('编译进 IR；新加的字在这一步台词的估算朗读时长里出完，没有台词时退回按字数', () => {
    const r = build((f) => f
      .click('mic', ...speak('帮我写一封', '帮我写一封'))
      .system('接着说', ...speak('帮我写一封邮件给王总。', '邮件给王总。'))
      .system('没有台词', stream($.ui.note, '记下了', { pace: 'voice' })));
    expect(errors(r)).toEqual([]);
    const p = r.project!;
    const steps = p.scenarios[sid]!.steps;
    expect(steps[1]!.effects).toEqual([{ type: 'stream', path: 'ui.spoken', value: '帮我写一封邮件给王总。', pace: 'voice' }]);
    const plan = streamPlan(steps[1], stateAt(p, sid, 1))[0]!;
    expect(plan.keep).toBe(5);
    expect(plan.ms).toBe(voicePacedMs('邮件给王总。'));
    // 6 个字（标点不读）约 5 × 220ms，比模型输出的速度慢得多：字跟着声音走
    expect(plan.ms).toBeGreaterThan(streamMs('邮件给王总。'));
    expect(streamPlan(steps[2], stateAt(p, sid, 2))[0]!.ms).toBe(streamMs('记下了'));
  });

  it('pace 只接受 voice', () => {
    const bad = { kind: 'effect', type: 'stream', path: 'ui.spoken', value: 'x', pace: 'fast' } as unknown as EffectDef;
    const r = build((f) => f.click('mic', bad));
    expect(errors(r).map((d) => d.code)).toContain('STREAM_PACE_INVALID');
  });
});

describe('say(…, { role })', () => {
  it('系统步骤用写明的角色读；没写角色的系统步骤仍是旁白的声音', () => {
    const r = build((f) => f.click('mic', say('开始')).system('说', say('帮我写一封', { role: 'me' })).system('回', say('好的')));
    expect(errors(r)).toEqual([]);
    const p = r.project!;
    expect(p.scenarios[sid]!.steps[1]!.sayRole).toBe('me');
    expect(speakerRoleAt(p, sid, 2)).toBe('me');
    expect(speakerRoleAt(p, sid, 3)).toBeNull();
  });

  it('未知角色报 ROLE_UNKNOWN；同一步两个角色报 SAY_ROLE_CONFLICT', () => {
    expect(errors(build((f) => f.system('说', say('你好', { role: 'nobody' })))).map((d) => d.code)).toContain('ROLE_UNKNOWN');
    expect(errors(build((f) => f.system('说', say('你好', { role: 'me' }), say('好的', { role: 'bot' })))).map((d) => d.code)).toContain('SAY_ROLE_CONFLICT');
  });
});
