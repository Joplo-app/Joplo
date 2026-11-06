/**
 * 评审版（compile 的 review 模式）与评审清单（reviewManifest，云端契约 8.1）。不变量：
 * 1. review 模式含所有功能的所有方案，但和 publish 一样去掉创作侧信息：规则、情况、问题、备注、取舍、源位置；
 * 2. 评审清单的每一项字段与契约 8.1 一致，id 与 IR 一致；publish 清单只含选定方案的内容；
 * 3. 字符串、数组有上限（截断）；序列化超过 512 KiB 时报错，不静默截断整体。
 */
import { describe, expect, it } from 'vitest';
import { assertReviewManifestSize, compile, nodeLabel, REVIEW_LIMITS, REVIEW_MANIFEST_MAX_BYTES, reviewManifest, reviewManifestBytes, type Project, type SceneNode } from '../src/index.ts';
import { reviewSource, SECRET } from './fixtures/review.ts';

const devProject = (): Project => {
  const r = compile(reviewSource(), 'dev');
  expect(r.project, JSON.stringify(r.diagnostics)).toBeTruthy();
  return r.project!;
};

describe('compile review 模式', () => {
  it('含所有功能的所有方案和场景，场景用方案自己的画面', () => {
    const r = compile(reviewSource(), 'review');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.diagnostics.map((d) => d.code)).not.toContain('NOT_PICKED');
    const p = r.project!;
    expect(p.mode).toBe('review');
    expect(p.featureIds).toEqual(['f', 'g']);
    expect(Object.keys(p.options)).toEqual(['f.a', 'f.b', 'g.a']);
    expect(p.features.f!.pick).toBe('f.a');
    expect(p.features.g!.pick).toBeNull();
    expect(Object.keys(p.scenarios)).toEqual(['f.a.main', 'f.b.only', 'g.a.view']);
    expect(p.scenarios['f.b.only']!.initial.sceneId).toBe('f.b@/');
    expect(p.scenes['f.b@/']).toBeTruthy();
    // 场景、步骤 id 与 dev IR 一致（评审页的锚点和清单都用这一套）
    const dev = devProject();
    for (const [id, s] of Object.entries(p.scenarios)) expect(s.steps.map((x) => x.id)).toEqual(dev.scenarios[id]!.steps.map((x) => x.id));
  });

  it('和 publish 一样去掉规则、情况、问题、备注、取舍、源位置', () => {
    const p = compile(reviewSource(), 'review').project!;
    expect(p.rules).toEqual({});
    expect(p.cases).toEqual({});
    expect(p.issues).toEqual({});
    for (const f of Object.values(p.features)) expect(f.caseIds).toEqual([]);
    for (const o of Object.values(p.options)) {
      expect(o.tradeoffs).toEqual([]);
      expect(o.decisionFocus).toBe('');
      expect(o.coverage).toEqual({});
    }
    for (const s of Object.values(p.scenarios)) {
      expect(s.caseIds).toEqual([]);
      for (const st of s.steps) expect(st.ruleIds).toEqual([]);
    }
    const text = JSON.stringify(p);
    for (const [k, v] of Object.entries(SECRET)) if (k !== 'constraint') expect(text, k).not.toContain(v);
    expect(text).not.toMatch(/"source"/);
    expect(text).not.toMatch(/"note"/);
  });

  it('dev 与 publish 输出不受影响', () => {
    const dev = compile(reviewSource(), 'dev').project!;
    expect(dev.mode).toBe('dev');
    expect(Object.keys(dev.rules).length).toBe(5);
    const pub = compile(reviewSource(), 'publish');
    expect(pub.project!.mode).toBe('publish');
    expect(Object.keys(pub.project!.options)).toEqual(['f.a']);
    expect(pub.diagnostics.map((d) => d.code)).toContain('NOT_PICKED');
  });
});

const keys = (o: object) => Object.keys(o).sort();

describe('reviewManifest', () => {
  it('review：字段与契约 8.1 一致，id 与 IR 一致', () => {
    const dev = devProject();
    const m = reviewManifest(dev, 'review');
    expect(keys(m)).toEqual(['elements', 'features', 'mode', 'scenarios', 'v']);
    expect(m.v).toBe(1);
    expect(m.mode).toBe('review');
    expect(m.features.map((f) => f.id)).toEqual(['f', 'g']);
    for (const f of m.features) {
      expect(keys(f)).toEqual(['goal', 'id', 'name', 'options', 'pick', 'questions', 'rules']);
      for (const o of f.options) expect(keys(o)).toEqual(['id', 'idea', 'key', 'name', 'tradeoffs']);
      for (const r of f.rules) expect(keys(r)).toEqual(['confirmation', 'elementIds', 'id', 'optionId', 'origin', 'text']);
      for (const q of f.questions) expect(keys(q)).toEqual(['id', 'optionId', 'severity', 'text']);
    }
    const f = m.features[0]!;
    expect(f).toMatchObject({ id: 'f', name: 'Invite', goal: 'Invite members', pick: 'f.a' });
    expect(f.options).toEqual([
      { id: 'f.a', key: 'a', name: 'A modal', idea: 'Invite in place', tradeoffs: [SECRET.tradeoff, 'second'] },
      { id: 'f.b', key: 'b', name: 'B batch', idea: 'Invite many', tradeoffs: [] },
    ]);
    expect(f.rules).toEqual([
      { id: 'f.admins', optionId: null, text: SECRET.featureRule, origin: 'user', confirmation: 'confirmed', elementIds: ['go'] },
      { id: 'f.a.keep', optionId: 'f.a', text: SECRET.optionRule, origin: 'ai_assumption', confirmation: 'pending', elementIds: ['email'] },
      { id: 'f.a.retry', optionId: 'f.a', text: SECRET.assumption, origin: 'ai_assumption', confirmation: 'pending', elementIds: [] },
      { id: 'f.b.batch', optionId: 'f.b', text: SECRET.bRule, origin: 'ai_assumption', confirmation: 'pending', elementIds: [] },
    ]);
    for (const r of f.rules) expect(dev.rules[r.id]).toBeTruthy();
    expect(f.questions).toEqual([
      { id: 'f.dup', optionId: null, text: SECRET.featureQuestion, severity: 'minor' },
      { id: 'f.a.limit', optionId: 'f.a', text: SECRET.optionQuestion, severity: 'blocker' },
    ]);
    expect(m.features[1]).toMatchObject({ id: 'g', pick: null, rules: [{ id: 'g.audit', optionId: null }] });

    expect(m.scenarios.map((s) => s.id)).toEqual(['f.a.main', 'f.b.only', 'g.a.view']);
    for (const s of m.scenarios) {
      expect(keys(s)).toEqual(['featureId', 'id', 'name', 'optionId', 'steps']);
      for (const st of s.steps) expect(keys(st)).toEqual(['caption', 'explain', 'id', 'index', 'ruleIds']);
    }
    const main = m.scenarios[0]!;
    expect(main).toMatchObject({ id: 'f.a.main', featureId: 'f', optionId: 'f.a', name: 'Main' });
    expect(main.steps).toEqual(dev.scenarios['f.a.main']!.steps.map((st, index) => ({ id: st.id, index, caption: st.caption, explain: st.explain ?? null, ruleIds: st.ruleIds })));
    expect(main.steps[0]).toMatchObject({ index: 0, explain: 'Why this matters', ruleIds: ['f.a.keep', 'f.admins'] });
    expect(main.steps[1]).toMatchObject({ index: 1, caption: 'Type email', explain: null, ruleIds: [] });

    // elements：画面里所有作者 id（和 Rule.elementIds 同一套），label 用 nodeLabel，没有编译器生成的 _ id
    const ids = m.elements.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['home', 'go', 'email']));
    expect(ids.every((id) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of m.elements) expect(keys(e)).toEqual(['id', 'label']);
    const find = (n: SceneNode, id: string): SceneNode | null => (n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);
    expect(m.elements.find((e) => e.id === 'email')!.label).toBe(nodeLabel(find(dev.scenes['@/']!.root, 'email')!));
    expect(m.elements.find((e) => e.id === 'email')!.label).toBe('Email');
  });

  it('publish：只含选定方案（与 publish 构建同一范围），去掉未选定的功能', () => {
    const m = reviewManifest(devProject(), 'publish');
    expect(m.mode).toBe('publish');
    expect(m.features.map((f) => f.id)).toEqual(['f']);
    const f = m.features[0]!;
    expect(f.options.map((o) => o.id)).toEqual(['f.a']);
    expect(f.rules.map((r) => r.id)).toEqual(['f.admins', 'f.a.keep', 'f.a.retry']);
    expect(f.questions.map((q) => q.id)).toEqual(['f.dup', 'f.a.limit']);
    expect(m.scenarios.map((s) => s.id)).toEqual(['f.a.main']);
    expect(JSON.stringify(m)).not.toContain(SECRET.bRule);
    expect(JSON.stringify(m)).not.toContain(SECRET.gRule);
  });

  it('只接受 dev IR（publish / review IR 已去掉规则）', () => {
    expect(() => reviewManifest(compile(reviewSource(), 'publish').project!, 'publish')).toThrow(/dev IR/);
    expect(() => reviewManifest(compile(reviewSource(), 'review').project!, 'review')).toThrow(/dev IR/);
  });

  it('字符串和数组有上限：超长截断，id 不截断', () => {
    const dev = devProject();
    const big = structuredClone(dev);
    big.features.f!.name = '名'.repeat(REVIEW_LIMITS.text.name + 50);
    big.rules['f.admins']!.text = 'x'.repeat(REVIEW_LIMITS.text.rule + 1);
    big.options['f.a']!.tradeoffs = Array.from({ length: REVIEW_LIMITS.tradeoffs + 5 }, (_, i) => `t${i}`);
    big.scenarios['f.a.main']!.steps[0]!.caption = 'c'.repeat(10_000);
    const m = reviewManifest(big, 'review');
    const f = m.features[0]!;
    expect([...f.name].length).toBe(REVIEW_LIMITS.text.name);
    expect(f.name.endsWith('…')).toBe(true);
    expect([...f.rules[0]!.text].length).toBe(REVIEW_LIMITS.text.rule);
    expect(f.rules[0]!.id).toBe('f.admins');
    expect(f.options[0]!.tradeoffs).toHaveLength(REVIEW_LIMITS.tradeoffs);
    expect([...m.scenarios[0]!.steps[0]!.caption].length).toBe(REVIEW_LIMITS.text.caption);
  });

  it('序列化超过 512 KiB 时报错（不发请求），未超过时通过', () => {
    const dev = devProject();
    expect(() => assertReviewManifestSize(reviewManifest(dev, 'review'))).not.toThrow();
    const big = structuredClone(dev);
    for (let i = 0; i < 400; i++) big.rules[`f.r${i}`] = { id: `f.r${i}`, featureId: 'f', text: '规'.repeat(REVIEW_LIMITS.text.rule), origin: 'user', confirmation: 'pending', caseIds: [], elementIds: [] };
    const m = reviewManifest(big, 'review');
    expect(reviewManifestBytes(m)).toBeGreaterThan(REVIEW_MANIFEST_MAX_BYTES);
    expect(() => assertReviewManifestSize(m)).toThrow(/512 KiB/);
    try {
      assertReviewManifestSize(m);
    } catch (e) {
      expect(e).toMatchObject({ code: 'EXPORT_FAILED', details: { maxBytes: REVIEW_MANIFEST_MAX_BYTES } });
    }
  });
});
