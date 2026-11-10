/** 合成页面只是回放锚点；不产生作者文字，也不覆盖真实页面。 */
import { describe, expect, it } from 'vitest';
import { chapter, layer, page, Slot, work } from '@joplo-app/kit';
import { Stack, Text } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { fixtureConfig } from '../../../scripts/test/fixtures.ts';
import { INTERNAL_BLANK_TITLE, visibleRoutes, collectMessages, compile, localizeProject, stateAt, validate, type AuthoringProject } from '../src/index.ts';

const picture = (text = 'Author picture') => jsx(Text, { id: 'screen', children: text });
const source = (layers = false): AuthoringProject => ({
  root: '/p', config: { ...fixtureConfig({ name: 'Project', locales: ['en', 'ja'] }), file: 'joplo.config.ts' },
  layouts: {}, routes: {}, features: {},
  works: { demo: { ...work({ title: 'Author title', summary: 'Author summary', ...(layers ? { layers: { world: layer('Author layer', picture()) } } : { stage: picture() }), scenarios: { one: chapter('Opening').system('Begin') } }), file: 'works/demo.tsx' } },
});

const realRoot = () => ({ ...page({ title: 'Real root', layout: false, viewport: 'mobile' }, jsx(Stack, { children: jsx(Slot, { name: 'main' }) })), source: '/p/works/home.tsx:6:1' });
const withRoot = (src: AuthoringProject, key: string) => {
  src.works![key] = { ...work({ title: 'Route work', summary: 'Own a page', routes: { '/': realRoot() }, scenarios: { opening: chapter('Open real page').system('Open') } }), file: `works/${key}.tsx` };
  return src;
};

/** 只翻译真实作者内容；用同一张收集表验证缺失与过期统计。 */
function translateAuthorText(src: AuthoringProject) {
  const first = compile(src, 'dev');
  expect(first.project, JSON.stringify(first.diagnostics)).not.toBeNull();
  src.locales = { ja: Object.fromEntries(collectMessages(first.project!).filter(m => m.text !== 'Work stage').map(m => [m.text, `Translated: ${m.text}`])) };
  src.localeFiles = { ja: 'locales/ja.json' };
}

describe('合成空白根页面', () => {
  it.each(['dev', 'publish', 'review'] as const)('stage 与 layers 的内部元数据不可见、无翻译项（%s）', mode => {
    for (const layers of [false, true]) {
      const src = source(layers); translateAuthorText(src);
      const r = compile(src, mode); expect(r.project, JSON.stringify(r.diagnostics)).not.toBeNull();
      const p = r.project!;
      expect(collectMessages(p).map(m => m.text)).not.toContain('Work stage');
      expect(p.routes['/']!.title).toBe(INTERNAL_BLANK_TITLE); expect(visibleRoutes(p).map(r=>r.path)).not.toContain('/'); expect(collectMessages(p).map(m=>m.text)).not.toContain(INTERNAL_BLANK_TITLE);
      expect(p.scenes['@/']!.name).toBe(INTERNAL_BLANK_TITLE);
      expect(JSON.stringify(p)).not.toContain('Work stage');
      expect(r.diagnostics.filter(d => d.code.startsWith('I18N_'))).toEqual([]);
      expect(p.i18n!.stale?.ja ?? 0).toBe(0);
      const ja = localizeProject(p, 'ja');
      expect(ja.routes['/']!.title).toBe(INTERNAL_BLANK_TITLE);
      expect(ja.scenes['@/']!.name).toBe(INTERNAL_BLANK_TITLE);
      expect(validate(p).summary.error).toBe(0);
      expect(stateAt(p, 'demo.one', 1)).toBeTruthy();
    }
  });

  it.each(['dev', 'publish', 'review'] as const)('作品自己的真实 / 优先进入路由表（%s）', mode => {
    const src = withRoot(source(), 'demo'); translateAuthorText(src);
    const r = compile(src, mode); expect(r.project, JSON.stringify(r.diagnostics)).not.toBeNull();
    const p = r.project!;
    expect(p.routes['/']).toMatchObject({ title: 'Real root', layout: null, slots: ['main'], addedBy: 'demo' });
    expect(p.scenes['@/']).toMatchObject({ name: 'Real root', viewport: 'mobile' });
    expect(p.scenes['demo@/']).toMatchObject({ name: 'Real root · Route work', viewport: 'mobile' });
    expect(collectMessages(p).map(m => m.text)).toContain('Real root');
    expect(r.diagnostics.filter(d => d.code.startsWith('I18N_'))).toEqual([]);
    expect(localizeProject(p, 'ja').routes['/']!.title).toBe('Translated: Real root');
    expect(validate(p).summary.error).toBe(0);
  });

  it('其他作品声明了真实 / 时，舞台仍隔离且不合成额外的全局空白页', () => {
    const src = withRoot(source(), 'home');
    const p = compile(src, 'dev').project!;
    expect(p.routes['/']!.title).toBe('Real root');
    expect(p.scenes['@/']!.name).toBe('Real root');
    expect(p.scenes['demo@/']!.root.children).toBeUndefined();
    expect(p.scenes['demo~stage']!.root.id).toBe('screen');
    expect(validate(p).summary.error).toBe(0);
  });

  it('routes/ 的真实 / 同样保留元数据与作者翻译', () => {
    const src = source(); src.routes['/'] = { ...realRoot(), file: 'routes/page.tsx' };
    const p = compile(src, 'dev').project!;
    expect(p.routes['/']).toMatchObject({ title: 'Real root', slots: ['main'] });
    expect(p.routes['/']).not.toHaveProperty('addedBy');
    expect(collectMessages(p).map(m => m.text)).toContain('Real root');
  });

  it('只有其他路径时仍补上空白 /，已有路径的作者标题照常翻译', () => {
    const src = source(); src.routes['/app'] = { ...page({ title: 'Real app', layout: false }, picture()), file: 'routes/app/page.tsx' };
    const p = compile(src, 'dev').project!;
    expect(p.routes['/']!.title).toBe(INTERNAL_BLANK_TITLE); expect(visibleRoutes(p).map(r=>r.path)).not.toContain('/'); expect(collectMessages(p).map(m=>m.text)).not.toContain(INTERNAL_BLANK_TITLE);
    expect(p.routes['/app']!.title).toBe('Real app');
    expect(collectMessages(p).map(m => m.text)).toContain('Real app');
    expect(validate(p).summary.error).toBe(0);
  });

  it('作者真的写了 Work stage 时不按文字内容排除翻译', () => {
    const src = source(); src.works!.demo!.stage = picture('Work stage');
    expect(collectMessages(compile(src, 'dev').project!).map(m => m.text)).toContain('Work stage');
  });
});
