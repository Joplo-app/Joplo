/**
 * D74 朗读：say() 进 IR、config({ voice }) 只进 dev IR、读什么（narrationText）、音频片段的键（clipKey）、SAY_TOO_LONG。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, narrate, option, page, say, set, $, type ConfigDef, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { clipKey, compile, joinSpoken, narrationText, spokenLine, validate, voiceFingerprint, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function src(o: { scenarios?: Record<string, Flow>; voice?: unknown } = {}): AuthoringProject {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'go' }, 'Go')));
  const opt = option({
    name: 'A',
    idea: 'i',
    state: { ui: { done: false } },
    scenarios: o.scenarios ?? {
      happy: flow('Send', { start: '/', cases: ['happy'] })
        .card('Ana needs Leo today', { sub: 'She is the admin' })
        .click('go', 'Ana sends it', say('Ana sends the invite; Leo gets a mail'), set($.ui.done, true))
        .system('Mail sent', set($.ui.done, true)),
    },
  });
  const cfg = { ...config({ name: 'T', home: '/' }), ...(o.voice !== undefined ? { voice: o.voice as ConfigDef['voice'] } : {}) };
  return {
    root: '/p',
    config: { ...cfg, ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'Invite', goal: 'Admins invite teammates so the team can start today', cases: { happy: 'Happy' }, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
}

describe('say() 与 config({ voice })', () => {
  it('say 写进步骤，字幕不变；没写 say 的步骤没有这个字段', () => {
    const p = compile(src(), 'dev').project!;
    const steps = p.scenarios['f.a.happy']!.steps;
    expect(steps[1]!.caption).toBe('Ana sends it');
    expect(steps[1]!.say).toBe('Ana sends the invite; Leo gets a mail');
    expect(steps[2]!.say).toBeUndefined();
    // 发布站同样保留 say（观众端朗读要用）
    expect(compile(src(), 'publish').project!.scenarios['f.a.happy']!.steps[1]!.say).toBe('Ana sends the invite; Leo gets a mail');
  });

  it('say 为空报 SAY_EMPTY', () => {
    const r = compile(src({ scenarios: { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', say('  ')) } }), 'dev');
    expect(r.diagnostics.map((d) => d.code)).toContain('SAY_EMPTY');
  });

  it('voice 配置进 IR（发布站由 publishPayload 去掉）；空对象视为没写；形状不对报 VOICE_CONFIG_INVALID', () => {
    const v = { profile: ' OpenAI ', narrator: 'nova', roles: { leo: 'echo' } };
    expect(compile(src({ voice: v }), 'dev').project!.voiceConfig).toEqual({ profile: 'OpenAI', narrator: 'nova', roles: { leo: 'echo' } });
    expect(compile(src({ voice: {} }), 'dev').project!.voiceConfig).toBeUndefined();
    for (const bad of [{ narrator: '' }, { roles: { leo: 3 } }, { key: 'sk-…' }, 'nova', []]) {
      const r = compile(src({ voice: bad }), 'dev');
      expect(r.diagnostics.map((d) => d.code), JSON.stringify(bad)).toContain('VOICE_CONFIG_INVALID');
    }
  });

  it('SAY_TOO_LONG：超过约 80 个“字”时提示', () => {
    const long = 'word '.repeat(170);
    const p = compile(src({ scenarios: { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', say(long)) } }), 'dev').project!;
    expect(validate(p).diagnostics.filter((d) => d.code === 'SAY_TOO_LONG')).toHaveLength(1);
    const ok = compile(src(), 'dev').project!;
    expect(validate(ok).diagnostics.filter((d) => d.code === 'SAY_TOO_LONG')).toHaveLength(0);
  });
});

describe('narrate() 与朗读优先级', () => {
  it('narrate（旁白的声音）> say（角色的声音）> 字幕（旁白的声音）；空 narrate 报 NARRATE_EMPTY', () => {
    const p = compile(src({ scenarios: { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', 'Ana sends it', say('Here you go!'), narrate('She sends it as a link.')).click('go', 'Again', say('Once more!')).click('go', 'Last') } }), 'dev').project!;
    const [a, b, c] = p.scenarios['f.a.happy']!.steps;
    expect(a!.narrate).toBe('She sends it as a link.');
    expect(spokenLine(a!, 'Ana sends it', 'ana')).toEqual({ text: 'She sends it as a link.', role: null });
    expect(spokenLine(b!, 'Again', 'ana')).toEqual({ text: 'Once more!', role: 'ana' });
    expect(spokenLine(c!, 'Last', 'ana')).toEqual({ text: 'Last', role: null });
    const r = compile(src({ scenarios: { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', narrate('')) } }), 'dev');
    expect(r.diagnostics.map((d) => d.code)).toContain('NARRATE_EMPTY');
    const long = compile(src({ scenarios: { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', narrate('word '.repeat(170))) } }), 'dev').project!;
    expect(validate(long).diagnostics.filter((d) => d.code === 'NARRATE_TOO_LONG')).toHaveLength(1);
  });
});

describe('读什么、键', () => {
  it('narrationText：say 优先；过渡卡读标题 + 副标题；其余读当前语言的字幕', () => {
    const steps = compile(src(), 'dev').project!.scenarios['f.a.happy']!.steps;
    expect(narrationText(steps[0]!, 'ignored')).toBe('Ana needs Leo today. She is the admin');
    expect(narrationText(steps[1]!, 'Ana sends it')).toBe('Ana sends the invite; Leo gets a mail');
    expect(narrationText(steps[2]!, ' Mail sent ')).toBe('Mail sent');
  });

  it('joinSpoken：中文补全角句号、不加空格；已有句末标点不重复', () => {
    expect(joinSpoken(['周末一起去露营', '交给助手'])).toBe('周末一起去露营。交给助手');
    expect(joinSpoken(['Done!', 'Next', null, ''])).toBe('Done! Next');
  });

  it('clipKey：同一声音同一文字（空白差异不算）键相同；换声音或改字就变', () => {
    const a = clipKey('fp1', 'Ana sends it');
    expect(a).toMatch(/^c[0-9a-f]{28}$/);
    expect(clipKey('fp1', '  Ana   sends it ')).toBe(a);
    expect(clipKey('fp2', 'Ana sends it')).not.toBe(a);
    expect(clipKey('fp1', 'Ana sent it')).not.toBe(a);
  });

  it('voiceFingerprint：角色没有单独的声音时用旁白的', () => {
    const v = { narrator: 'n', roles: { leo: 'l' } };
    expect(voiceFingerprint(v, 'leo')).toBe('l');
    expect(voiceFingerprint(v, 'ana')).toBe('n');
    expect(voiceFingerprint(v, null)).toBe('n');
    expect(voiceFingerprint({ narrator: null, roles: {} }, null)).toBeNull();
  });
});
