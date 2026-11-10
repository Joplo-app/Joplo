import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 界面测试用的项目（D102 修订，docs/work-model.md）：真实编译 works/<键>.tsx 的 work() 与功能 / 方案，不手工改 IR。
 * 四种能力搭配都能造出来：
 * - 独立作品 + 章节（sequencing linear）：slices 用 chapter()；
 * - 独立作品 + 独立切片（independent）：linear: false，slices 用 flow()；
 * - 功能 + 独立切片：withDemo（功能 `invite`，两个方案、带情况，与以前一样）；
 * - 功能 + 选定方案用章节：withDemo: 'linear'（选定的方案 a 用 chapter()）。
 */
import { expect } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { chapter, feature, flow, work, page, layer, role, type Chapter, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

export type SliceSpec = {
  key: string;
  title: string;
  description?: string;
  /** 步数（每一步是一个带字幕的 system 步）。 */
  steps?: number;
  /** autoplay: false 的支线。 */
  side?: boolean;
  /** 只对章节：缺省 = 声明顺序里的上一章；null = 从初始状态重新开始；'键' = 接指定的章节。 */
  from?: string | null;
};

export const DEFAULT_SLICES: SliceSpec[] = [
  { key: 'hook', title: 'Overnight, he lost Congress', description: 'What happened on election night', steps: 3 },
  { key: 'basics', title: 'What is a midterm, anyway?', steps: 2 },
  { key: 'results', title: 'How big was the blue wave?', description: 'Seats in both chambers', steps: 4 },
  { key: 'aside', title: 'Aside: how the House is counted', side: true, steps: 1 },
];

export type WorkFixtureSettings = {
  mode?: 'dev' | 'publish';
  key?: string;
  title?: string;
  summary?: string;
  audience?: string;
  roles?: boolean;
  draft?: boolean;
  /** 缺省 true：切片用 chapter()（linear）；false：用 flow()（independent）。 */
  linear?: boolean;
  slices?: SliceSpec[];
  /** 再加一个功能 `invite`；'linear' 时它选定的方案用章节。 */
  withDemo?: boolean | 'linear';
  /** 不要独立作品（只有功能的项目）。 */
  noWork?: boolean;
  /** 第二件独立作品（例如旧版，可标 draft）。 */
  second?: { key: string; title: string; draft?: boolean; linear?: boolean; slices?: SliceSpec[] };
};

function slicesOf(specs: SliceSpec[], linear: boolean): Record<string, Flow | Chapter> {
  const out: Record<string, Flow | Chapter> = {};
  for (const c of specs) {
    const opts = { ...(c.description ? { description: c.description } : {}), ...(c.side ? { autoplay: false } : {}) };
    let s: Flow | Chapter = linear ? chapter(c.title, { ...opts, ...(c.from !== undefined ? { from: c.from } : {}) }) : flow(c.title, opts);
    for (let i = 0; i < (c.steps ?? 1); i++) s = s.system(`${c.key} ${i + 1}`, `${c.title} — beat ${i + 1}`) as typeof s;
    out[c.key] = s;
  }
  return out;
}

const workSource = (key: string, o: { title: string; summary: string; audience?: string; roles?: boolean; draft?: boolean; linear: boolean; slices: SliceSpec[] }) => ({
  ...work({
    title: o.title,
    summary: o.summary,
    ...(o.audience ? { audience: o.audience } : {}),
    ...(o.draft ? { draft: true } : {}),
    ...(o.roles ? {
      roles: { speaker: role('Speaker', { desc: 'Presenter' }) },
      layers: { stage: layer(o.title, h(ui.Stack, { id: `${key}_world` }, h(ui.Text, { id: `${key}_frame` }, o.title)), { role: 'speaker' }) },
    } : { stage: h(ui.Stack, { id: `${key}_world` }, h(ui.Text, { id: `${key}_frame` }, o.title)) }),
    scenarios: slicesOf(o.slices, o.linear),
  }),
  ...F(`works/${key}.tsx`),
});

/** 编译出的项目（dev 或 publish）。slices: [] = 还没有切片的作品。 */
export function workProject(o: WorkFixtureSettings = {}): Project {
  const key = o.key ?? 'midterms';
  const works: NonNullable<AuthoringProject['works']> = {};
  if (!o.noWork) works[key] = workSource(key, { title: o.title ?? 'After he lost Congress', summary: o.summary ?? 'The 2026 midterms in five minutes', audience: o.audience, roles: o.roles, draft: o.draft, linear: o.linear !== false, slices: o.slices ?? DEFAULT_SLICES });
  if (o.second) works[o.second.key] = workSource(o.second.key, { title: o.second.title, summary: 'Earlier cut', draft: o.second.draft, linear: o.second.linear !== false, slices: o.second.slices ?? DEFAULT_SLICES.slice(0, 2) });
  const features: AuthoringProject['features'] = {};
  if (o.withDemo) {
    const linear = o.withDemo === 'linear';
    const a = work({ title: 'A · Banner', summary: 'i', scenarios: linear
      ? { main: chapter('Send an invite', { start: '/', cases: ['happy'] }).click('go', 'Send'), follow: chapter('Follow up', { cases: ['happy'] }).click('go', 'Remind') }
      : { main: flow('Send an invite', { start: '/', cases: ['happy'] }).click('go', 'Send') } });
    const b = work({ title: 'B · Email', summary: 'i', scenarios: { only: flow('Email invite', { start: '/', cases: ['happy'] }).click('go', 'Email') } });
    features.invite = {
      def: { ...feature({ name: 'Invite teammates', goal: 'Bring teammates in', roles: ['Admin'], cases: { happy: { title: 'Invite one person', dimension: 'main', priority: 'high', expected: 'Sent' }, gone: { title: 'Invitee left', dimension: 'lifecycle' } }, pick: 'a' }), ...F('features/invite/feature.ts') },
      works: { a: { ...a, ...F('features/invite/works/a.tsx') }, b: { ...b, ...F('features/invite/works/b.tsx') } },
    };
  }
  const home = page({ title: 'Home', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, 'Go')));
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'Midterms 2026', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    // 功能需要路径页面；只有独立作品的项目没有 routes/（编译器合成空白页）
    routes: o.withDemo ? { '/': { ...home, ...F('routes/page.tsx') } } : {},
    features,
    works,
  };
  const r = compile(src, o.mode ?? 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error'), JSON.stringify(r.diagnostics)).toEqual([]);
  return r.project!;
}
