/**
 * D74 朗读（网页）：
 * - 控制器：自动播放每一步停留 = max(画面停留, 声音读完 + 换气)；暂停时声音一起暂停；手动下一步立刻停掉当前声音；
 *   读什么、用谁的声音（narrate > say > 字幕）；
 * - 镜头：手机层等画面被缩小时，界面元素推近到文字看得清（最多 3 倍）；
 * - 看板：旁白语言识别、预设音色排序。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, narrate, option, page, say } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { VOICE_BREATH_MS, compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController, TIMING } from '../src/runtime/demo';
import { Narrator, type Narration } from '../src/runtime/voice';
import { MIN_UI_PX, UI_LEGIBLE_MAX, UI_MAX_ZOOM, uiMaxZoom } from '../src/renderer/camera-math';
import { narrationLanguage, sortVoices } from '../src/board/voice-model';

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
  const home = page({ title: 'Home', layout: false }, h(ui.Group, null, h(ui.Button, { id: 'go' }, 'Go'), h(ui.Button, { id: 'more' }, 'More')));
  const opt = option({
    name: 'A',
    idea: 'i',
    state: { ui: {} },
    scenarios: { s: flow('One', { start: '/' }).click('go', 'Ana goes', narrate('She starts here.'), say('Here I go!')).click('more', 'Ana goes on', say('And again!')).click('go', 'Done') },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return compile(src, 'dev').project!;
}

/** 假的朗读器：记录读了什么，由测试决定什么时候读完。 */
class FakeNarrator extends Narrator {
  calls: { text: string; role: string | null; finish: () => void; paused: number; resumed: number; cancelled: boolean }[] = [];
  override speak(text: string, role: string | null): Narration | null {
    if (!this.enabled) return null;
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const c = { text, role, finish, paused: 0, resumed: 0, cancelled: false };
    this.calls.push(c);
    return { source: 'clip', done, pause: () => c.paused++, resume: () => c.resumed++, cancel: () => ((c.cancelled = true), finish()) };
  }
}

function setup() {
  const c = new DemoController(null);
  c.reducedMotion = true; // 每步停留 TIMING.reducedStep（450ms），比声音短
  c.setProject(project(), 1, null);
  c.setScenario('f.a.s', 0, { quiet: true });
  const n = new FakeNarrator();
  n.enabled = true;
  c.narrator = n;
  return { c, n };
}

describe('控制器：等声音读完再走', () => {
  it('画面停够了、声音没读完：不进下一步，标出“在等声音”；读完再换气 0.45 秒才走', async () => {
    const { c, n } = setup();
    const play = c.play();
    await until(() => n.calls.length === 1);
    expect(n.calls[0]!.text).toBe('She starts here.'); // narrate 优先于 say
    await sleep(TIMING.reducedStep + 300);
    expect(c.getSnapshot().state!.position).toBe(1);
    expect(n.calls).toHaveLength(1);
    expect(c.getSnapshot().narration).toMatchObject({ position: 1, waiting: true });
    n.calls[0]!.finish();
    await sleep(VOICE_BREATH_MS / 2);
    expect(n.calls).toHaveLength(1); // 还在换气
    await until(() => n.calls.length === 2);
    expect(n.calls[1]!.text).toBe('And again!'); // 没有 narrate：读 say
    n.calls[1]!.finish();
    await until(() => n.calls.length === 3);
    expect(n.calls[2]!.text).toBe('Done'); // 都没有：读字幕
    n.calls[2]!.finish();
    await play;
    expect(c.getSnapshot().playing).toBe(false);
  });

  it('暂停时声音一起暂停，继续时接着读；手动下一步立刻停掉当前声音', async () => {
    const { c, n } = setup();
    void c.play();
    await until(() => n.calls.length === 1);
    c.pause();
    expect(n.calls[0]!.paused).toBe(1);
    c.resume();
    expect(n.calls[0]!.resumed).toBe(1);
    await c.next();
    expect(n.calls[0]!.cancelled).toBe(true);
    expect(c.getSnapshot().state!.position).toBe(2);
    expect(n.calls.at(-1)!.text).toBe('And again!');
    c.stop();
    expect(n.calls.at(-1)!.cancelled).toBe(true);
    expect(c.getSnapshot().narration).toBeNull();
  });

  it('朗读关闭：不读，也不等', async () => {
    const { c, n } = setup();
    n.enabled = false;
    await c.play();
    expect(n.calls).toHaveLength(0);
    expect(c.getSnapshot().state!.position).toBe(3);
  });
});

describe('镜头：手机层推近到看得清', () => {
  it('桌面上文字够大：最多 1.25 倍；手机外框把画面缩小时放宽到看得清，最多 3 倍', () => {
    expect(uiMaxZoom([14], 1)).toBe(UI_MAX_ZOOM);
    expect(uiMaxZoom([14], 0.6)).toBeCloseTo(MIN_UI_PX / (14 * 0.6), 6);
    expect(uiMaxZoom([10], 0.3)).toBe(UI_LEGIBLE_MAX);
    expect(uiMaxZoom([], 0.3)).toBe(UI_MAX_ZOOM);
  });
});

describe('看板：跟随语言', () => {
  it('按朗读文字识别语言（假名 → 日语、谚文 → 韩语、汉字 → 中文），否则跟随界面语言；推荐与同语言口音的音色排前面', () => {
    expect(narrationLanguage([{ stepId: 'a', text: '小雨去露营', role: null }], 'en')).toBe('zh');
    expect(narrationLanguage([{ stepId: 'a', text: 'こんにちは', role: null }], 'en')).toBe('ja');
    expect(narrationLanguage([{ stepId: 'a', text: 'Hello', role: null }], 'fr-FR')).toBe('fr');
    const v = sortVoices([{ id: 'a', accent: 'fr-FR' }, { id: 'b', recommended: true }, { id: 'c', accent: 'en-US' }], 'en');
    expect(v.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
