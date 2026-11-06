import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, embedScenarioIds, Project, type AuthoringProject } from '@joplo-app/core';
import { publishPayload } from '../../server/src/build';
import { DemoController } from '../src/runtime/demo';
import { routeTree } from '../src/runtime/views';
import { featureMenu } from '../src/board/nav-model';
import * as home from '../src/board/home-model';
import * as siteCore from '../src/site/core-lite';
import { SiteApp } from '../src/site/SiteApp';
import { I18nProvider } from '../src/i18n/context';

afterEach(() => vi.unstubAllGlobals());

const ids = ['z', 'item9', 'item10', 'a'];
const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:3:1` });
function project(mode: 'dev' | 'publish') {
  const src: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'Order' }), ...at('joplo.config.ts') }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, jsx('Text', { children: 'Home' })), ...at('routes/page.tsx') } },
    features: Object.fromEntries(([['a', undefined], ['item10', 1], ['z', 0], ['item9', 1]] as const).map(([id, order]) => {
      const fid = String(id);
      return [fid, {
        def: { ...feature({ name: `Feature-${fid}`, goal: 'Goal', cases: {}, pick: 'a', ...(order === undefined ? {} : { order }) }), ...at(`features/${fid}/feature.ts`) },
        options: { a: { ...option({ name: 'A', idea: 'Idea', on: { '/': {} }, scenarios: { second: flow('Second', { start: '/' }).system('Ready'), first: flow('First', { start: '/' }).system('Ready') } }), ...at(`features/${fid}/options/a.tsx`) } },
      }];
    })),
  };
  const r = compile(src, mode);
  expect(r.project, JSON.stringify(r.diagnostics)).toBeTruthy();
  return r.project!;
}
const namesIn = (html: string) => [...html.matchAll(/Feature-(z|item9|item10|a)(?=<)/g)].map(m => m[1]);

describe('功能顺序端到端一致', () => {
  it('发布站精简运行时提供相同的顺序读取函数', () => {
    const p = project('publish');
    p.features = Object.fromEntries(Object.entries(p.features).reverse());
    expect(siteCore.orderedFeatures(p).map(f => f.id)).toEqual(ids);
  });
  it('编译 → JSON/schema → 首页卡片、左栏/菜单、浏览视图、控制器与嵌入场景', () => {
    const p = Project.parse(JSON.parse(JSON.stringify(project('dev'))));
    p.features = Object.fromEntries(Object.entries(p.features).reverse());
    expect(featureMenu(p, null).map(f => f.id)).toEqual(ids);
    expect(home.featureCards(p).map(f => f.id)).toEqual(ids);
    // 故意打乱方案表的插入顺序，路径树仍只读功能顺序。
    p.options = Object.fromEntries(Object.entries(p.options).reverse());
    expect(routeTree(p)[0]!.features.map(f => f.featureId)).toEqual(ids);
    const c = new DemoController(null);
    for (const id of ids) {
      c.setProject(p, 1);
      expect(c.getSnapshot()).toMatchObject({ featureId: id, scenarioId: `${id}.a.second` });
      delete p.features[id];
      if ('featureIds' in p) (p.featureIds as string[]).shift();
      delete p.options[`${id}.a`];
    }
  });

  it('发布 payload 保留顺序，首页卡片和左栏顺序相同，嵌入场景同序', () => {
    const compiled = project('publish');
    compiled.features = Object.fromEntries(Object.entries(compiled.features).reverse());
    const payload = publishPayload(compiled, '/');
    expect(Object.keys(payload.project.features as object)).toEqual(ids);
    const p = Project.parse(JSON.parse(JSON.stringify(payload.project)));
    p.features = Object.fromEntries(Object.entries(p.features).reverse());
    expect(payload.project).toMatchObject({ featureIds: ids });
    expect(embedScenarioIds(p)).toEqual(ids.flatMap(id => [`${id}.a.second`, `${id}.a.first`]));
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/' });
    const html = renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: p, home: '/' }} search="" /></I18nProvider>);
    expect(namesIn(html)).toEqual([...ids, ...ids]);
  });
});
