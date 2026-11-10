import '../../../scripts/test/render-fixtures.ts';
import { cloudPicks } from '../src/board/cloud-model';
import { reviewScenarios } from '../src/site/review-bridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { workProject } from './work-fixture';
import { entryOf } from '@joplo-app/core';
import { sliceRows } from '../src/player/work-view';
import { UpNextCard } from '../src/player/WatchView';
import { DemoController } from '../src/runtime/demo';
import { I18nProvider } from '../src/i18n/context';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary } from '../src/i18n/board/dictionaries';
import { locales } from '../src/i18n/locale';

afterEach(() => vi.unstubAllGlobals());

describe('IR v3 界面补项', () => {
  it('独立作品不需要 pick 即可发布，草稿与未选方案不能发布；空项目无候选', () => {
    for (const draft of [true, false]) {
      const p = workProject({ draft });
      expect(cloudPicks(p, { featureId: 'midterms', scenarioId: 'midterms.hook' })).toEqual({ scenario: !draft, feature: !draft, project: !draft });
    }
    const p = workProject({ noWork: true });
    expect(cloudPicks(p, { featureId: 'missing', scenarioId: null })).toEqual({ scenario: false, feature: false, project: false });
  });
  it('评审 ready 按混合条目顺序及功能作品声明顺序发出 workId', () => {
    const p = workProject({ withDemo: true });
    p.entryIds = ['midterms', 'invite'];
    p.scenarios = Object.fromEntries(Object.entries(p.scenarios).reverse());
    const ready = reviewScenarios(p);
    expect(ready.map(s => s.workId)).toEqual([
      ...Object.values(p.scenarios).filter(s => s.workId === 'midterms').map(s => s.workId),
      'invite.a', 'invite.b',
    ]);
    expect(ready.every(s => !('optionId' in s))).toBe(true);
  });

  it('下一章卡片与左栏共享编号，支线与独立切片不编号；无倒计时不显示', () => {
    for (const linear of [true, false]) {
      const p = workProject({ linear });
      const ctl = new DemoController(null);
      ctl.setProject(p, 1);
      const rows = sliceRows(entryOf(p, 'midterms')!, null);
      for (const row of [...rows.main, ...rows.side]) {
        const snap = { ...ctl.getSnapshot(), upNext: { scenarioId: row.id, left: 3 } };
        for (const variant of ['corner', 'center'] as const) {
          const html = renderToStaticMarkup(<I18nProvider explicit="en"><UpNextCard ctl={ctl} snap={snap} variant={variant} /></I18nProvider>);
          expect(html).toContain(`>${row.no ? `${row.no} · ` : ''}${row.title}<`);
        }
      }
      expect(renderToStaticMarkup(<I18nProvider explicit="en"><UpNextCard ctl={ctl} snap={ctl.getSnapshot()} variant="corner" /></I18nProvider>)).toBe('');
    }
  });
  it('十种语言的条目切换无障碍名称不再限定功能', () => {
    const labels = {
      en: 'Switch entry', 'zh-CN': '切换条目', 'zh-TW': '切換項目', ja: '項目を切り替え', ko: '항목 전환',
      es: 'Cambiar elemento', fr: 'Changer d’entrée', de: 'Eintrag wechseln', 'pt-BR': 'Trocar item', ru: 'Сменить элемент',
    };
    for (const locale of locales) {
      expect(dictionary(locale).site.switchFeature).toBe(labels[locale]);
      expect(boardDictionary(locale).board.switchFeature).toBe(labels[locale]);
    }
  });
});

describe('IR v3 字段搬迁的消费者', () => {
  it('独立作品角色通过 rolesOf 进入封面，受众与角色通过 Entry 进入首页；没有数据不显示', async () => {
    const { coverFor } = await import('../src/player/cover-content');
    const { SiteHome } = await import('../src/site/SiteApp');
    const { Curtain } = await import('../src/player/Curtain');
    const { WorkNav } = await import('../src/board/WorkNav');
    const render = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}>{node}</I18nProvider>);
    for (const roles of [true, false]) {
      const p = workProject({ roles });
      const cover = coverFor(p, 'midterms.hook')!;
      expect(cover.roles.map(r => r.name)).toEqual(roles ? ['Speaker'] : []);
      const html = render(<SiteHome project={p} onView={() => {}} />);
      expect(html.includes('For: Speaker')).toBe(roles);
    }
    for (const audience of ['Readers', undefined]) {
      const p = workProject({ audience, roles: true });
      const entry = entryOf(p, 'midterms')!;
      const html = render(<WorkNav project={p} entry={entry} scenarioId={null} onScenario={() => {}} onCopy={() => {}} />);
      expect(html.includes('data-testid="work-audience"')).toBe(!!audience);
      const cover = coverFor(p, 'midterms.hook')!;
      expect(render(<Curtain project={p} scenarioId="midterms.hook" position={0} cover={cover} theme="sketch" width={1132} height={700} animate={false} />).includes('data-testid="cover-audience"')).toBe(!!audience);
      expect(render(<SiteHome project={p} onView={() => {}} />)).toContain(audience ? 'For: Readers' : 'For: Speaker');
    }
  });

  it('取舍与覆盖读取 feature.alternatives，切换作品读各自记录；没有记录内容时不显示作者信息', async () => {
    const { WorkDetails } = await import('../src/board/CaseNav');
    const { caseCard } = await import('../src/board/nav-model');
    const { resolvePlay } = await import('../src/player/playRoute');
    const p = workProject({ noWork: true, withDemo: true });
    const a = p.features.invite!.alternatives['invite.a']!;
    a.tradeoffs = ['Keeps context'];
    a.decisionFocus = 'Entry placement';
    a.coverage['invite.gone'] = { status: 'undecided', basis: 'declared', scenarioIds: [], reason: 'Needs recovery' };
    const details = (workId: string) => renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}><WorkDetails project={p} workId={workId} index={0} /></I18nProvider>);
    expect(details('invite.a')).toContain('<li>Keeps context</li>');
    expect(details('invite.b')).not.toContain('Keeps context');
    const rows = caseCard(p, 'invite', 'invite.gone');
    expect(rows[0]).toMatchObject({ workId: 'invite.a', status: 'undecided', detail: 'Needs recovery' });
    expect(rows[1]!.detail).not.toContain('Needs recovery');
    expect(resolvePlay(p, { featureId: 'invite', workId: 'invite.a', caseId: 'invite.gone' }).gap).toMatchObject({ status: 'undecided', reason: 'Needs recovery' });
    a.tradeoffs = [];
    delete a.coverage['invite.gone'];
    expect(details('invite.a')).not.toMatch(/Keeps context|<ul/);
    expect(caseCard(p, 'invite', 'invite.gone')[0]).toMatchObject({ status: 'none', detail: 'This case is not covered yet' });
  });
});

it('本地评审读取用 workId 参数，选中写回正文用 workId；切换作品时不改变条目路由格式', async () => {
  const { fetchLocalReview, selectionWriter } = await import('../src/runtime/dev-client');
  const { boardHash, parseBoardHash } = await import('../src/runtime/route');
  vi.stubGlobal('document', { querySelector: () => ({ content: 'test-token' }) });
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ session: null, selection: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await fetchLocalReview('test-project', 'invite.a');
  expect(fetch.mock.calls[0]![0]).toBe('/__joplo/p/test-project/review?workId=invite.a');
  const input = { workId: 'invite.a', scenarioId: 'invite.a.main', sceneId: 'scene', position: 0, nodeId: null };
  await selectionWriter('test-project')(input);
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ selection: input });
  const route = { kind: 'play' as const, projectId: 'test-project', play: { featureId: 'invite', workId: 'invite.a' } };
  expect(boardHash(route)).toBe('#/test-project/f/invite?o=invite.a');
  expect(parseBoardHash(boardHash(route))).toEqual(route);
});

it('热更新与条目切换保留独立作品上下文，浏览视图只合并已选功能与独立作品', async () => {
  const { browseState, routeTree } = await import('../src/runtime/views');
  const p = workProject({ withDemo: true });
  const ctl = new DemoController(null);
  ctl.setProject(p, 1);
  ctl.setFeature('midterms');
  expect(ctl.getSnapshot()).toMatchObject({ featureId: 'midterms', workId: 'midterms', scenarioId: 'midterms.hook' });
  ctl.setScenario('midterms.basics', 1, { quiet: true });
  ctl.setProject(structuredClone(p), 2);
  expect(ctl.getSnapshot()).toMatchObject({ featureId: 'midterms', workId: 'midterms', scenarioId: 'midterms.basics', state: { position: 1 } });
  p.scenarios['invite.a.main']!.initial.ui.featureValue = 'picked';
  p.scenarios['midterms.hook']!.initial.ui.workValue = 'independent';
  expect(browseState(p, '@/').ui).toEqual({ featureValue: 'picked', workValue: 'independent' });
  p.features.invite!.pick = null;
  expect(browseState(p, '@/').ui).toEqual({ workValue: 'independent' });
  expect(routeTree(workProject())).toEqual([]);
});
