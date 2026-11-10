import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * D100 语音输入一类的演示（网页）：
 * - 控制器提交一步时用“提交前的状态”算出字计划：接着往后写时原有的字不重出（keep）；
 * - pace: 'voice' 的字对齐真实朗读：streamAt.voice() 返回正在读这一步的进度，换了一步 / 没在读时为 null；
 * - say(…, { role }) 在系统步骤上用这个角色的声音读。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { $, feature, flow, work, page, role, say, stream } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { Narrator, type Narration } from '../src/runtime/voice';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await sleep(10);
  }
};

function project(): Project {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'mic' }, 'Mic'), h(ui.Text, { id: 'box' }, $.ui.spoken)));
  const opt = work({
    title: 'A', summary: 'i',
    state: { ui: { spoken: '' } },
    scenarios: {
      s: flow('Dictate', { start: '/' })
        .click('mic', 'Start', say('Write an email', { role: 'me' }), stream($.ui.spoken, 'Write an email', { pace: 'voice' }))
        .system('Speak', say('to Mr. Wang.', { role: 'me' }), stream($.ui.spoken, 'Write an email to Mr. Wang.', { pace: 'voice' })),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, roles: { me: role('Me') }, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

/** 假的朗读器：进度由测试设定，读完由测试决定。 */
class FakeNarrator extends Narrator {
  calls: { text: string; role: string | null; finish: () => void; progress: number | null }[] = [];
  override speak(text: string, role: string | null): Narration | null {
    if (!this.enabled) return null;
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const c = { text, role, finish, progress: 0 as number | null };
    this.calls.push(c);
    return { source: 'clip', done, pause: () => {}, resume: () => {}, cancel: () => finish(), progress: () => c.progress };
  }
}

function setup() {
  const c = new DemoController(null);
  c.reducedMotion = true;
  c.setProject(project(), 1, null);
  c.setScenario('f.a.s', 0, { quiet: true });
  const n = new FakeNarrator();
  n.enabled = true;
  c.narrator = n;
  return { c, n };
}

describe('控制器：stream 接着往后写，跟着朗读出字', () => {
  it('提交时用提交前的状态算计划：第二步只出新加的字；voice() 跟着正在读这一步的进度', async () => {
    const { c, n } = setup();
    void c.play();
    await until(() => n.calls.length === 1);
    const first = c.getSnapshot().streamAt!;
    expect(first.plan).toMatchObject([{ path: 'ui.spoken', keep: 0, pace: 'voice' }]);
    expect(n.calls[0]).toMatchObject({ text: 'Write an email', role: 'me' }); // 用户操作写明角色
    n.calls[0]!.progress = 0.5;
    expect(first.voice()).toBe(0.5);
    n.calls[0]!.finish();
    await until(() => n.calls.length === 2);
    const second = c.getSnapshot().streamAt!;
    expect(second.position).toBe(2);
    expect(second.plan).toMatchObject([{ path: 'ui.spoken', value: 'Write an email to Mr. Wang.', keep: [...'Write an email'].length }]);
    expect(n.calls[1]).toMatchObject({ text: 'to Mr. Wang.', role: 'me' }); // 系统步骤也用“我”的声音
    n.calls[1]!.progress = 0.25;
    expect(second.voice()).toBe(0.25);
    expect(first.voice()).toBeNull(); // 上一步的计划不再跟着现在的声音
    n.calls[1]!.progress = null;
    expect(second.voice()).toBeNull(); // 朗读给不出进度：按估算时长
    n.calls[1]!.finish();
    await until(() => !c.getSnapshot().playing);
  });

  it('跳到某一步不逐字出现（没有 streamAt），整段直接显示', () => {
    const { c } = setup();
    c.goto(2);
    expect(c.getSnapshot().streamAt).toBeNull();
    expect(c.getSnapshot().state!.ui.spoken).toBe('Write an email to Mr. Wang.');
  });
});
