import { resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { compile, explainClick, initialState, replay, stateAt, type Project } from '../src/index.ts';
import { loadAuthoring } from '../src/load.ts';
import type { AuthoringProject } from '../src/compile.ts';

const root = resolve(import.meta.dirname, '../../../examples/invite');
let authoring: AuthoringProject;
let dev: Project;
let pub: Project;

const find = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => find(c, id)).find(Boolean));

beforeAll(async () => {
  const r = await loadAuthoring(root, (p) => tsImport(p, { parentURL: import.meta.url, tsconfig: `${root}/tsconfig.json` }));
  expect(r.diagnostics).toEqual([]);
  authoring = r.authoring!;
  const d = compile(authoring, 'dev');
  expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  dev = d.project!;
  pub = compile(authoring, 'publish').project!;
}, 60_000);

describe('TSX 邀请示例编译', () => {
  it('路径优先：基础路径 + 方案新增路径；每个方案在每个路径上各有画面', () => {
    // /join 由方案 A 新增（D68 样板：撤销后受邀者看到的失效页），/members/invite 由方案 B 新增
    expect(Object.keys(dev.routes).sort()).toEqual(['/join', '/members', '/members/invite', '/settings']);
    expect(dev.scenes['invite.a-modal@/members']).toBeDefined();
    expect(dev.scenes['invite.b-batch@/members/invite']).toBeDefined();
    expect(dev.scenes['invite.a-modal@/members/invite']).toBeUndefined();
    expect(dev.scenes['invite.a-modal@/join']).toBeDefined();
    expect(dev.scenes['invite.b-batch@/join']).toBeUndefined();
  });

  it('同一功能的方案互相隔离，堆叠元素记录来源与 文件:行号', () => {
    const a = dev.scenes['invite.a-modal@/members']!.root;
    expect(find(a, 'btn_batch')).toBeUndefined();
    expect(find(dev.scenes['invite.b-batch@/members']!.root, 'btn_invite')).toBeUndefined();
    const btn = find(a, 'btn_invite');
    expect(btn.from).toBe('invite.a-modal');
    expect(btn.source).toMatch(/^features\/invite\/works\/a-modal\.tsx:\d+:\d+$/);
    expect(find(a, 'nav_settings').source).toMatch(/^layouts\/app\.tsx:/);
  });

  it('所有场景完整回放；步骤带源位置；字幕可自动生成', () => {
    for (const id of Object.keys(dev.scenarios)) expect(replay(dev, id).diagnostics, id).toEqual([]);
    const s = dev.scenarios['invite.a-modal.success']!;
    expect(s.steps[1]!).toMatchObject({ caption: 'Type “li.lei@example.com” in “邮箱”', captionAuto: { kind: 'type', label: '邮箱', value: 'li.lei@example.com' } });
    expect(s.mock).toEqual({ label: 'Mock success', outcome: 'success', auto: true });
    expect(pub.scenarios[s.id]!.steps[1]!.captionAuto).toEqual(s.steps[1]!.captionAuto);
    expect(s.steps.map((x) => x.source)).toEqual(s.steps.map(() => expect.stringMatching(/^features\/invite\/works\/a-modal\.tsx:\d+:\d+$/)));
    expect(s.steps[0]!.ruleIds).toEqual(['invite.admin_only']);
  });

  it('跨路径跳转（go）在方案上下文内', () => {
    const end = stateAt(dev, 'invite.b-batch.partial', 5);
    expect(end.sceneId).toBe('invite.b-batch@/members/invite');
    expect((end.data.results as unknown[]).length).toBe(3);
  });

  it('覆盖：有场景即已表达，声明优先，其余自动标为缺失', () => {
    const cov = dev.features.invite!.alternatives['invite.a-modal']!.coverage;
    expect(cov['invite.happy']).toMatchObject({ status: 'expressed', basis: 'derived' });
    expect(cov['invite.already_member']).toMatchObject({ status: 'undecided', basis: 'declared' });
    expect(cov['invite.revoked']).toEqual({ status: 'expressed', scenarioIds: ['invite.a-modal.revoke'], basis: 'derived' });
    expect(cov['invite.expired']).toEqual({ status: 'missing', scenarioIds: [], basis: 'derived' });
  });

  it('禁用与未建模的点击解释仍由播放器决定', () => {
    expect(explainClick(dev, initialState(dev, 'invite.a-modal.denied'), 'btn_invite')).toEqual({ kind: 'disabled', reason: '只有空间管理员可以邀请成员' });
    expect(explainClick(dev, initialState(dev, 'invite.a-modal.success'), 'nav_settings').kind).toBe('unmodeled');
  });

  it('发布模式：只含选定方案，去掉规则、情况、问题、备注与源路径', () => {
    expect(Object.keys(pub.works)).toEqual(['invite.a-modal']);
    expect(Object.keys(pub.routes)).not.toContain('/members/invite');
    expect(pub.rules).toEqual({});
    expect(pub.cases).toEqual({});
    expect(pub.issues).toEqual({});
    const json = JSON.stringify(pub);
    expect(json).not.toContain('"note"');
    expect(json).not.toContain('"source"');
    expect(json).not.toContain(root);
    for (const id of Object.keys(pub.scenarios)) expect(replay(pub, id).diagnostics, id).toEqual([]);
  });

  it('编译错误带 文件:行号：未知组件、缺 id、函数属性、未知插槽', async () => {
    const { jsx } = await import('@joplo-app/kit/jsx-runtime');
    const bad = { ...authoring, features: {} } as AuthoringProject;
    bad.features = {
      x: {
        def: { kind: 'feature', name: 'X', goal: 'g', cases: {}, file: 'features/x/feature.ts' } as any,
        works: {
          o: {
            kind: 'work', title: 'O', summary: 'i', file: 'features/x/works/o.tsx', scenarios: {},
            on: { '/members': { nope: jsx('Bogus', {}), 'header.actions': [jsx(((p: any) => p) as any, {}) as any] } },
          } as any,
        },
      },
    };
    const codes = compile(bad, 'dev').diagnostics.map((d) => d.code);
    expect(codes).toContain('UNKNOWN_SLOT');
  });
});
