import { resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectMessages, compile, contentLocaleFor, localizeProject, nearestKey, replay, stateAt, type Project } from '../src/index.ts';
import { loadAuthoring } from '../src/load.ts';
import type { AuthoringProject } from '../src/compile.ts';

const root = resolve(import.meta.dirname, '../../../examples/invite');
let base: AuthoringProject;

const find = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const textOf = (n: any): string => (n.type === '#text' ? n.props.text : (n.children ?? []).map(textOf).join(''));
const withLocales = (locales: unknown, tables: Record<string, Record<string, string>> = {}): AuthoringProject => ({
  ...base,
  config: { ...base.config, locales: locales as string[] },
  locales: tables,
  localeFiles: Object.fromEntries(Object.keys(tables).map((l) => [l, `locales/${l}.json`])),
});

beforeAll(async () => {
  const r = await loadAuthoring(root, (p) => tsImport(p, { parentURL: import.meta.url, tsconfig: `${root}/tsconfig.json` }));
  // examples/invite 自己带英文译文；这里从“没写 locales”的状态出发，各用例自己加
  base = { ...r.authoring!, config: { ...r.authoring!.config, locales: undefined }, locales: undefined, localeFiles: undefined };
}, 60_000);

describe('作者内容多语言（D84）', () => {
  it('没写 locales 时 IR 不变，也不报译文问题', () => {
    const r = compile(base, 'dev');
    expect(r.project!.i18n).toBeUndefined();
    expect(r.diagnostics.filter((d) => d.code.startsWith('I18N') || d.code.startsWith('LOCALE'))).toEqual([]);
  });

  it('收集显示出来的原文；状态里只收绑定显示的，跳过邮箱这类像代码的值', () => {
    const p = compile(withLocales(['zh-CN', 'en']), 'dev').project!;
    const texts = collectMessages(p).map((m) => m.text);
    expect(texts).toContain('邀请成员');
    expect(texts).toContain('只有空间管理员可以邀请成员');
    expect(texts).toContain('已向 li.lei@example.com 发送邀请');
    expect(texts).not.toContain('li.lei@example.com');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('整份 IR 换成译文：画面、字幕、提示、选择的值一起换，状态与条件里的同一字面量一起换', () => {
    const en = { 邀请成员: 'Invite member', 编辑者: 'Editor', '已向 li.lei@example.com 发送邀请': 'Invite sent to li.lei@example.com', '只有空间管理员可以邀请成员': 'Only space admins can invite' };
    const dev = compile(withLocales(['zh-CN', 'en'], { en }), 'dev').project!;
    const p = localizeProject(dev, 'en');
    const btn = find(p.scenes['invite.a-modal@/members']!.root, 'btn_invite');
    expect(textOf(btn)).toBe('Invite member');
    expect(btn.disabledReason).toBe('Only space admins can invite');
    expect(dev.scenes['invite.a-modal@/members']!.root).not.toBe(p.scenes['invite.a-modal@/members']!.root);
    expect(textOf(find(dev.scenes['invite.a-modal@/members']!.root, 'btn_invite'))).toBe('邀请成员');
    const sc = Object.values(p.scenarios).find((s) => s.steps.some((st) => st.action.type === 'select' && st.action.value === 'Editor'))!;
    expect(sc).toBeDefined();
    expect(sc.steps.some((st) => st.effects.some((e) => e.type === 'toast' && e.text === 'Invite sent to li.lei@example.com'))).toBe(true);
    // 选择的值和下拉的选项一起换：按译文回放仍能走完
    const r = replay(p, sc.id);
    expect(r.diagnostics).toEqual([]);
    expect(r.reached).toBe(sc.steps.length);
    expect(JSON.stringify(stateAt(p, sc.id, sc.steps.length).data)).toContain('Editor');
  });

  it('看板里的创作侧文字（情况、规则、待决问题、备注）也换；发布 IR 不带它们的译文', () => {
    const en = { 正常发出邀请并被接受: 'Invite sent and accepted', 只有空间管理员可以发起邀请: 'Only space admins can start an invite', '入口：成员页右上角，只对管理员可用': 'Entry point: top right, admins only' };
    const dev = compile(withLocales(['zh-CN', 'en'], { en }), 'dev').project!;
    const p = localizeProject(dev, 'en');
    expect(Object.values(p.cases).map((c) => c.title)).toContain('Invite sent and accepted');
    expect(Object.values(p.rules).map((r) => r.text)).toContain('Only space admins can start an invite');
    expect(find(p.scenes['invite.a-modal@/members']!.root, 'btn_invite').note).toBe('Entry point: top right, admins only');
    const pub = compile(withLocales(['zh-CN', 'en'], { en }), 'publish').project!;
    expect(pub.i18n!.messages.en!['正常发出邀请并被接受']).toBeUndefined();
  });

  it('观众的语言项目里没有时退回默认语言；默认语言原样返回', () => {
    const p = compile(withLocales(['zh-CN', 'en']), 'dev').project!;
    expect(contentLocaleFor(p, 'en')).toBe('en');
    expect(contentLocaleFor(p, 'pt-BR')).toBe('zh-CN');
    expect(contentLocaleFor(p, null)).toBe('zh-CN');
    expect(contentLocaleFor({}, 'en')).toBeNull();
    expect(localizeProject(p, 'zh-CN')).toBe(p);
  });

  it('check：缺的汇总成一条，原文改过的逐条给出最接近的旧条目，没人用的条目给 info', () => {
    const r = compile(withLocales(['zh-CN', 'ja'], { ja: { 邀请同事: '同僚を招待', 完全无关的旧句子很长很长: 'y', 邮箱: '' } }), 'dev');
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes.filter((c) => c === 'I18N_MISSING')).toHaveLength(1);
    const stale = r.diagnostics.filter((d) => d.code === 'I18N_STALE');
    expect(stale.some((d) => d.message.includes('"邀请成员"') && d.message.includes('"邀请同事"'))).toBe(true);
    expect(r.diagnostics.find((d) => d.code === 'I18N_UNUSED')?.message).toContain('完全无关的旧句子很长很长');
    expect(r.project!.i18n!.stale!.ja).toBe(stale.length);
    expect(r.diagnostics.every((d) => d.severity !== 'error')).toBe(true);
  });

  it('config 写错、文件没声明时报错', () => {
    expect(compile(withLocales(['zh-CN', 'it']), 'dev').diagnostics.map((d) => d.code)).toContain('LOCALES_INVALID');
    expect(compile(withLocales(['zh-CN', 'zh-CN']), 'dev').diagnostics.map((d) => d.code)).toContain('LOCALES_INVALID');
    expect(compile(withLocales([]), 'dev').diagnostics.map((d) => d.code)).toContain('LOCALES_INVALID');
    expect(compile(withLocales(['zh-CN'], { ja: {} }), 'dev').diagnostics.map((d) => d.code)).toContain('LOCALES_UNDECLARED');
    expect(compile({ ...base, locales: { ja: {} }, localeFiles: { ja: 'locales/ja.json' } }, 'dev').diagnostics.map((d) => d.code)).toContain('LOCALES_UNDECLARED');
  });

  it('发布 IR 只带用得到的译文（没选的方案里的文字不进站点）', () => {
    const dev = compile(withLocales(['zh-CN', 'en'], { en: { 邀请成员: 'Invite member', 批量邀请: 'Bulk invite', 根本不存在的句子: 'nope' } }), 'dev').project!;
    const pub = compile(withLocales(['zh-CN', 'en'], { en: { 邀请成员: 'Invite member', 批量邀请: 'Bulk invite', 根本不存在的句子: 'nope' } }), 'publish').project!;
    expect(pub.i18n!.messages.en!['根本不存在的句子']).toBeUndefined();
    expect(dev.i18n!.messages.en!['根本不存在的句子']).toBeUndefined();
    expect(pub.i18n!.messages.en!['邀请成员']).toBe('Invite member');
    expect(pub.i18n!.stale).toBeUndefined();
  });

  it('选项对象的 value 和状态、条件一起换：受控的 Tabs / Select 不会丢失选中项', () => {
    const p = {
      name: 'P', description: '', routes: {}, features: {}, works: {}, cases: {}, rules: {}, issues: {},
      i18n: { default: 'en', locales: ['en', 'ja'], messages: { ja: { Overview: '概要' } } },
      plugins: { probe: {id:'probe',title:'Probe',components:{Chooser:{traits:{text:['data','value']}}}} },
      scenes: { s: { id: 's', root: { id: 'r', type: 'probe:Chooser', props: { value: '$ui.tab', data: [{ value: 'Overview', label: 'Overview' }] }, when: { eq: ['ui.tab', 'Overview'] } } } },
      scenarios: { x: { id: 'x', name: 'X', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 's', ui: { tab: 'Overview' }, data: {}, inputs: {} }, steps: [] } },
    } as unknown as Project;
    const ja = localizeProject(p, 'ja');
    const root = ja.scenes.s!.root as any;
    expect(root.props.data[0]).toEqual({ value: '概要', label: '概要' });
    expect(root.when).toEqual({ eq: ['ui.tab', '概要'] });
    expect(ja.scenarios.x!.initial.ui.tab).toBe('概要');
    expect(root.props.value).toBe('$ui.tab');
  });

  it('nearestKey 只接受相近的条目', () => {
    expect(nearestKey('邀请同事', ['邀请成员', '账单'])).toBe('邀请成员');
    expect(nearestKey('邀请同事', ['完全不一样的一句话'])).toBeNull();
  });
});
