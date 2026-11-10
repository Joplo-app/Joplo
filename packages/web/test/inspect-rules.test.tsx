import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, go, page, rule, work } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt, type AuthoringProject, type Project, type Selection } from '@joplo-app/core';
import { InspectDrawer } from '../src/board/InspectDrawer';
import { I18nProvider } from '../src/i18n/context';
import { boardDictionary } from '../src/i18n/board/dictionaries';

const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
// 同一 stage 工厂在功能作品与独立作品中复用合法的元素 id。
const stage = () => jsx(ui.Stack, { children: jsx(ui.Text, { id: 'status', children: 'Ready' }) });
const linkedRule = (text: string) => rule(text, { origin: 'user', status: 'confirmed', elements: ['status'] });
function project(): Project {
  const source: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'Shared stage' }), ...at('joplo.config.ts') }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, stage()), ...at('routes/page.tsx') } },
    features: {
      queue: {
        def: { ...feature({ name: 'Queue', goal: 'Feature only', cases: {}, rules: { only: linkedRule('QUEUE_FEATURE_RULE') }, pick: 'a' }), ...at('features/queue/feature.ts') },
        works: Object.fromEntries(['a', 'b'].map(key => [key, {
          ...work({ title: key, summary: 'Queue stage', stage: stage(), rules: { own: linkedRule(`QUEUE_${key.toUpperCase()}_RULE`) }, scenarios: {
            start: flow('Queue').system('Ready'),
            borrow: flow('Borrowed page', { start: '/' }).system('Open borrowed page', go('/borrowed')),
          } }), ...at(`features/queue/works/${key}.tsx`),
        }])),
      },
      donor: {
        def: { ...feature({ name: 'Donor', goal: 'Another feature', cases: {}, rules: { only: linkedRule('DONOR_FEATURE_RULE') }, pick: 'a' }), ...at('features/donor/feature.ts') },
        works: { a: { ...work({ title: 'Donor', summary: 'Borrow this page', routes: { '/borrowed': page({ title: 'Borrowed', layout: false }, stage()) }, rules: { own: linkedRule('DONOR_WORK_RULE') }, scenarios: { start: flow('Donor', { start: '/borrowed' }).system('Ready') } }), ...at('features/donor/works/a.tsx') } },
      },
    },
    works: { independent: { ...work({ title: 'Independent', summary: 'No feature', stage: stage(), scenarios: {
      start: flow('Independent').system('Ready'),
    } }), ...at('works/independent.tsx') } },
  };
  const result = compile(source, 'dev');
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return result.project!;
}
const p = project();
function selection(workId: string | null, featureId: string | null, scenarioId: string | null, position = 0): Selection {
  const stageScene = workId ? p.works[workId]?.layers.stage?.sceneId : undefined;
  const sceneId = position === 0 && stageScene ? stageScene : scenarioId ? stateAt(p, scenarioId, position).sceneId : '@/';
  return { workId, featureId, scenarioId, position, sceneId, nodeId: 'status', stepId: null, route: p.scenes[sceneId]!.route, at: null, label: 'Ready', selectedAt: '2026-11-10T00:00:00.000Z' };
}
function rules(sel: Selection): string[] {
  const html = renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}><InspectDrawer project={p} state={null} selection={sel} sync={{ status: 'ok' }} onClose={() => {}} onClear={() => {}} onOpenEditor={() => {}} /></I18nProvider>);
  return [...html.matchAll(/data-testid="rule-([^"]+)"/g)].map(m => m[1]!);
}

describe('检查抽屉按选中作品的归属隔离规则', () => {
  it('功能与独立作品共用 status：独立作品不显示任何功能规则', () => {
    const sel = selection('independent', null, 'independent.start');
    expect(rules(sel)).toEqual([]);
    // 即使上一次功能的元数据残留，也以当前 workId 的核心投影为准。
    expect(rules({ ...sel, featureId: 'queue' })).toEqual([]);
  });
  it.each(['a', 'b'])('功能下面的作品 %s 只显示所属功能的规则与自己的规则，包括未选方案', key => {
    const sel = selection(`queue.${key}`, 'queue', `queue.${key}.start`);
    expect(rules(sel)).toEqual(['queue.only', `queue.${key}.own`]);
    expect(rules({ ...sel, featureId: null })).toEqual(['queue.only', `queue.${key}.own`]);
  });
  it('借用另一个作品的页面元素，仍按当前作品的归属过滤，不改成来源作品的规则', () => {
    const sel = selection('queue.a', 'queue', 'queue.a.borrow', 1);
    expect(p.scenes[sel.sceneId]!.route).toBe('/borrowed');
    expect(p.routes['/borrowed']!.addedBy).toBe('donor.a');
    expect(rules(sel)).toEqual(['queue.only', 'queue.a.own']);
  });
  it('未选作品的全局浏览保留所有功能级规则，限定功能的浏览保持限定', () => {
    const browse = selection(null, null, null);
    expect(rules(browse)).toEqual(['donor.only', 'queue.only']);
    expect(rules({ ...browse, featureId: 'queue' })).toEqual(['queue.only']);
  });
  it('无法投影的作品不会降级成全局规则浏览', () => {
    expect(rules({ ...selection('independent', null, 'independent.start'), workId: 'missing' })).toEqual([]);
  });
});
