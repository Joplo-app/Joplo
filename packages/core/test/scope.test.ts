/**
 * 按场景保密分享（D75）。不变量：
 * 1. 裁剪后的 IR 里不出现范围外功能、方案、场景的 id、名字、目标、角色、步骤文字和它们堆进来的元素（when 隐藏的也一样）；
 * 2. 范围内步骤引用到的别的功能的元素整条子树保留（借用），去掉暴露方案 id 的 from / addedBy，并在 info.borrowed 里写明；
 * 3. 写错场景 / 功能、没有选定方案、范围为空时报错；
 * 4. 裁剪结果仍然能播放（schema 合法，每个场景回放成功）。
 */
import { describe, expect, it } from 'vitest';
import { compile, Project as ProjectSchema, resolveScope, reviewManifest, scopeKey, scopeProject, stateAt, type Project } from '../src/index.ts';
import { OUT, SEAT, scopeSource } from './fixtures/scope.ts';

const built = (mode: 'publish' | 'review' | 'dev'): Project => {
  const r = compile(scopeSource(), mode);
  expect(r.diagnostics.filter((d) => d.severity === 'error'), JSON.stringify(r.diagnostics)).toEqual([]);
  return r.project!;
};
/** 范围外的东西：id（功能、方案）和只属于它们的文字。 */
const outsideNeedles = (except: string[] = []) => [...Object.values(OUT), 'billing', 'billing.a', 'exp.a', 'invite.b'].filter((s) => !except.includes(s));
const leaks = (p: Project, except: string[] = []) => {
  const text = JSON.stringify(p);
  return outsideNeedles(except).filter((s) => text.includes(s));
};
const playable = (p: Project) => {
  expect(() => ProjectSchema.parse(p)).not.toThrow();
  for (const s of Object.values(p.scenarios)) expect(stateAt(p, s.id, s.steps.length).completed || s.steps.length >= 0).toBeTruthy();
};

describe('resolveScope', () => {
  it('场景与功能合并，保持 IR 顺序', () => {
    const p = built('publish');
    expect(resolveScope(p, { scenarios: ['invite.a.full'] }, 'publish')).toEqual(['invite.a.full']);
    expect(resolveScope(p, { features: ['invite'] }, 'publish')).toEqual(['invite.a.happy', 'invite.a.full', 'invite.a.jump']);
    // 按演示顺序（featureIds：billing、exp、invite），与参数顺序无关
    expect(resolveScope(p, { scenarios: ['invite.a.happy', 'exp.a.csv'] }, 'publish')).toEqual(['exp.a.csv', 'invite.a.happy']);
  });
  it('写错场景 id：NOT_FOUND，并给出相近的场景', () => {
    const p = built('publish');
    expect(() => resolveScope(p, { scenarios: ['invite.happy'] }, 'publish')).toThrow(/Unknown scenario invite\.happy[\s\S]*invite\.a\.happy[\s\S]*Nothing was built or uploaded/);
    try { resolveScope(p, { scenarios: ['nope'] }, 'publish'); } catch (e) { expect((e as { code: string }).code).toBe('NOT_FOUND'); }
  });
  it('没选定的方案的场景：publish 拒绝（dev IR 也一样），review 可以', () => {
    const dev = built('dev');
    expect(() => resolveScope(dev, { scenarios: ['invite.b.batch'] }, 'publish')).toThrow(/not the picked option[\s\S]*--review/);
    expect(resolveScope(dev, { scenarios: ['invite.b.batch'] }, 'review')).toEqual(['invite.b.batch']);
    expect(resolveScope(built('review'), { features: ['invite'] }, 'review')).toEqual(['invite.a.happy', 'invite.a.full', 'invite.a.jump', 'invite.b.batch']);
  });
  it('未知功能、空范围报错', () => {
    const p = built('publish');
    expect(() => resolveScope(p, { features: ['nope'] }, 'publish')).toThrow(/Unknown feature "nope"/);
    expect(() => resolveScope(p, {}, 'publish')).toThrow(/no scenarios/);
  });
});

describe('scopeProject', () => {
  it('只分享一个场景：其他功能、场景、堆叠元素（含 when 隐藏的横幅）都不在', () => {
    const p = built('publish');
    const { project, info } = scopeProject(p, ['invite.a.happy']);
    expect(leaks(project)).toEqual([]);
    expect(JSON.stringify(project)).not.toContain(SEAT);
    expect(Object.keys(project.scenarios)).toEqual(['invite.a.happy']);
    expect(Object.keys(project.features)).toEqual(['invite']);
    expect(project.featureIds).toEqual(['invite']);
    expect(Object.keys(project.options)).toEqual(['invite.a']);
    expect(Object.keys(project.routes)).toEqual(['/']);
    expect(project.features.invite!.pick).toBe('invite.a');
    expect(project.description).toBe('');
    expect(info).toEqual({ key: 'invite.a.happy', scenarios: ['invite.a.happy'], features: ['invite'], borrowed: [] });
    playable(project);
    // 输入不变
    expect(JSON.stringify(p)).toContain(OUT.banner);
  });

  it('引用了别的功能的元素：只借这一条贡献子树，去掉 from，info 写明', () => {
    const { project, info } = scopeProject(built('publish'), ['invite.a.full']);
    const text = JSON.stringify(project);
    expect(text).toContain(SEAT);
    expect(leaks(project)).toEqual([]);
    expect(text).not.toContain(OUT.banner);
    expect(info.borrowed).toEqual([{ kind: 'element', featureId: 'billing', featureName: OUT.billingName, optionId: 'billing.a', elementId: 'seat_box', route: '/', refs: ['seat'], scenarios: ['invite.a.full'] }]);
    playable(project);
  });

  it('跳到别的功能新增的页面：页面按借用保留，去掉 addedBy', () => {
    const { project, info } = scopeProject(built('publish'), ['invite.a.jump']);
    expect(Object.keys(project.routes).sort()).toEqual(['/', '/billing']);
    expect(project.routes['/billing']!.addedBy).toBeUndefined();
    expect(info.borrowed).toEqual([{ kind: 'page', featureId: 'billing', featureName: OUT.billingName, optionId: 'billing.a', route: '/billing', scenarios: ['invite.a.jump'] }]);
    // 页面本身（标题）是借用的；功能名、目标、场景、横幅、其他按钮都不在
    // 路径 /billing 本身带着 billing：只排除这一项，其余 id 与文字照查
    expect(leaks(project, [OUT.billingPage, 'billing'])).toEqual([]);
    expect(JSON.stringify(project)).not.toMatch(/"billing\.|billing\.a|"billing"/);
    playable(project);
  });

  it('范围外的分叉去掉', () => {
    const p = built('publish');
    const happy = p.scenarios['invite.a.happy']!;
    const withFork: Project = { ...p, scenarios: { ...p.scenarios, 'invite.a.full': { ...p.scenarios['invite.a.full']!, steps: p.scenarios['invite.a.full']!.steps.map((st, i) => (i === 0 ? { ...st, forks: [{ label: 'Other', scenarioId: happy.id, at: 0 }, { label: 'Export', scenarioId: 'exp.a.csv', at: 0 }] } : st)) } } };
    const { project } = scopeProject(withFork, ['invite.a.happy', 'invite.a.full']);
    expect(project.scenarios['invite.a.full']!.steps[0]!.forks).toEqual([{ label: 'Other', scenarioId: happy.id, at: 0 }]);
  });

  it('评审版：只含范围内方案；没选定的方案场景 pick 置空，不暴露选定方案的 id', () => {
    const { project, info } = scopeProject(built('review'), ['invite.b.batch'], 'review');
    expect(Object.keys(project.options)).toEqual(['invite.b']);
    expect(project.features.invite!.pick).toBeNull();
    expect(JSON.stringify(project)).not.toContain('invite.a');
    expect(info.key).toBe('review:invite.b.batch');
  });

  it('dev IR（评审清单、预览图用）：规则、情况、角色只留范围内的', () => {
    const { project } = scopeProject(built('dev'), ['invite.a.happy'], 'publish');
    expect(leaks(project)).toEqual([]);
    expect(Object.keys(project.cases)).toEqual(['invite.main']);
    const manifest = reviewManifest(project, 'publish');
    expect(JSON.stringify(manifest)).not.toContain(OUT.billingRule);
    expect(manifest.features.map((f) => f.id)).toEqual(['invite']);
  });

  it('scopeKey 排序、评审版加前缀', () => {
    expect(scopeKey(['b', 'a'], 'publish')).toBe('a,b');
    expect(scopeKey(['a'], 'review')).toBe('review:a');
  });
});
