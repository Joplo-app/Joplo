import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 影片形状的 IR（D102，docs/film-form.md 第 4 节）。film() 的编译在另一条分支上，这里先用功能演示的创作 API 编译，
 * 再按契约的映射改成影片：Feature.kind = 'film'、唯一的方案 `<键>.main`、caseIds = []、pick 指向它、章节之间用 from 链起来
 * （flow({ from }) 编译期就写好 Scenario.from，与 film() 的默认接续一致）、mock 为自动的“成功”。
 *
 * 需要“项目里还有功能演示”时，withDemo 加一个普通的功能演示 `invite`（两个方案、带情况），它不经过任何改写。
 */
import { expect } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, layer, option, page, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

export type ChapterSpec = {
  key: string;
  title: string;
  description?: string;
  /** 步数（每一步是一个带字幕的 system 步）。 */
  steps?: number;
  /** autoplay: false 的支线。 */
  side?: boolean;
  /** 接续：缺省 = 上一章（第一章从初始状态开始）；null = 从初始状态重新开始。 */
  from?: string | null;
};

export const DEFAULT_CHAPTERS: ChapterSpec[] = [
  { key: 'hook', title: 'Overnight, he lost Congress', description: 'What happened on election night', steps: 3 },
  { key: 'basics', title: 'What is a midterm, anyway?', steps: 2 },
  { key: 'results', title: 'How big was the blue wave?', description: 'Seats in both chambers', steps: 4 },
  { key: 'aside', title: 'Aside: how the House is counted', side: true, steps: 1 },
];

export type FilmOptions = {
  mode?: 'dev' | 'publish';
  key?: string;
  title?: string;
  summary?: string;
  audience?: string;
  draft?: boolean;
  chapters?: ChapterSpec[];
  /** 再加一个普通的功能演示 `invite`。 */
  withDemo?: boolean;
  /** 第二支影片（例如旧版，可标 draft）。 */
  second?: { key: string; title: string; draft?: boolean; chapters?: ChapterSpec[] };
};

const chapterFlows = (chapters: ChapterSpec[]): Record<string, Flow> => {
  const out: Record<string, Flow> = {};
  let prev: string | null = null;
  for (const c of chapters) {
    const from = c.from === undefined ? prev : c.from;
    let fl = flow(c.title, { ...(from ? { from } : { start: '/' }), ...(c.description ? { description: c.description } : {}), ...(c.side ? { autoplay: false } : {}) });
    for (let i = 0; i < (c.steps ?? 1); i++) fl = fl.system(`${c.key} ${i + 1}`, `${c.title} — beat ${i + 1}`);
    out[c.key] = fl;
    // 支线不进连续播放；下一章仍接上一条主线（与 film() 的“声明顺序里的上一章”一致时，作者会显式写 from）
    if (!c.side) prev = c.key;
  }
  return out;
};

function filmSource(key: string, title: string, summary: string, chapters: ChapterSpec[]) {
  const stage = layer(title, h(ui.Stack, { id: `${key}_world` }, h(ui.Text, { id: `${key}_frame` }, title)));
  return {
    def: { ...feature({ name: title, goal: summary, cases: {}, pick: 'main' }), ...F(`films/${key}.tsx`) },
    options: { main: { ...option({ name: title, idea: summary, layers: { stage }, scenarios: chapterFlows(chapters) }), ...F(`films/${key}.tsx`) } },
  };
}

/** 按契约第 4 节把编译出的功能演示改成影片。 */
function toFilm(p: Project, key: string, o: { audience?: string; draft?: boolean }) {
  const f = p.features[key]!;
  const optionId = `${key}.main`;
  Object.assign(f, { kind: 'film', caseIds: [], optionIds: [optionId], pick: optionId, ...(o.audience ? { audience: o.audience } : {}), ...(o.draft ? { draft: true } : {}) });
  Object.assign(p.options[optionId]!, { coverage: {}, routes: [] });
  for (const s of Object.values(p.scenarios)) if (s.optionId === optionId) Object.assign(s, { caseIds: [], mock: { label: 'Mock success', outcome: 'success', auto: true } });
}

/** 影片形状的 IR。chapters: [] = 还没有章节的影片。 */
export function filmProject(o: FilmOptions = {}): Project {
  const key = o.key ?? 'midterms';
  const title = o.title ?? 'After he lost Congress';
  const summary = o.summary ?? 'The 2026 midterms in five minutes';
  const chapters = o.chapters ?? DEFAULT_CHAPTERS;
  // 空影片：先编译一章再删掉（功能演示的方案不能没有场景时也照样得到影片形状）
  const authored = chapters.length ? chapters : [{ key: 'placeholder', title: 'placeholder' }];
  const home = page({ title: 'Home', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, 'Go')));
  const features: AuthoringProject['features'] = { [key]: filmSource(key, title, summary, authored) };
  if (o.second) features[o.second.key] = filmSource(o.second.key, o.second.title, 'Earlier cut', o.second.chapters ?? DEFAULT_CHAPTERS.slice(0, 2));
  if (o.withDemo) {
    const a = option({ name: 'A · Banner', idea: 'i', scenarios: { main: flow('Send an invite', { start: '/', cases: ['happy'] }).click('go', 'Send') } });
    const b = option({ name: 'B · Email', idea: 'i', scenarios: { only: flow('Email invite', { start: '/', cases: ['happy'] }).click('go', 'Email') } });
    features.invite = {
      def: { ...feature({ name: 'Invite teammates', goal: 'Bring teammates in', roles: ['Admin'], cases: { happy: { title: 'Invite one person', dimension: 'main', priority: 'high', expected: 'Sent' }, gone: { title: 'Invitee left', dimension: 'lifecycle' } }, pick: 'a' }), ...F('features/invite/feature.ts') },
      options: { a: { ...a, ...F('features/invite/options/a.tsx') }, b: { ...b, ...F('features/invite/options/b.tsx') } },
    };
  }
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'Midterms 2026', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features,
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error'), JSON.stringify(r.diagnostics)).toEqual([]);
  const p = structuredClone(r.project!);
  toFilm(p, key, { audience: o.audience, draft: o.draft });
  if (o.second) toFilm(p, o.second.key, { draft: o.second.draft });
  if (!chapters.length) for (const id of Object.keys(p.scenarios)) if (p.scenarios[id]!.optionId === `${key}.main`) delete p.scenarios[id];
  if (o.mode === 'publish') {
    // 发布 IR：没有情况与创作侧字段；草稿影片整支不进（契约第 4 节）
    for (const f of Object.values(p.features)) if (f.draft) dropFeature(p, f.id);
    p.cases = {};
    for (const f of Object.values(p.features)) f.caseIds = [];
  }
  return p;
}

function dropFeature(p: Project, id: string) {
  const f = p.features[id]!;
  for (const oid of f.optionIds) {
    delete p.options[oid];
    for (const [sid, s] of Object.entries(p.scenarios)) if (s.optionId === oid) delete p.scenarios[sid];
  }
  delete p.features[id];
  if (Array.isArray((p as { featureIds?: string[] }).featureIds)) (p as { featureIds?: string[] }).featureIds = (p as { featureIds?: string[] }).featureIds!.filter((x) => x !== id);
}
