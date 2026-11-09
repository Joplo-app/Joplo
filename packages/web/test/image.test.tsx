/**
 * <Image>：内嵌的图片（asset() 生成的 data:image/… URI）真正画出来，fit / position 生效；
 * 其他 src（网址、路径）不加载，仍画带 alt 的占位（发布站 CSP 不允许外部资源）。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt, type AuthoringProject, type Project } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { Stage } from '../src/renderer/Stage';
import { embeddedImage } from '../../../plugins/ui/src/runtime.tsx';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function build(tree: unknown): Project {
  const opt = option({ name: 'A', idea: 'i', routes: { '/img': page({ title: 'P' }, tree as never) }, scenarios: { happy: flow('一次', { start: '/img' }) } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...page({ title: 'P', layout: false }, h(ui.Text, { id: 'n' }, 'x')), ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}
const html = (p: Project) => renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={p} state={stateAt(p, 'f.a.happy', 0)} theme="sketch" mode="render" animate={false} /></I18nProvider>);

describe('<Image>', () => {
  it('embeddedImage：只认 data:image/…', () => {
    expect(embeddedImage(PNG)).toBe(PNG);
    expect(embeddedImage('https://example.com/a.png')).toBeNull();
    expect(embeddedImage('./a.png')).toBeNull();
    expect(embeddedImage(undefined)).toBeNull();
  });
  it('内嵌图片画成 <img>，带 alt、fit、position 和尺寸', () => {
    const out = html(build(h(ui.Image, { id: 'photo', src: PNG, alt: 'Capitol', h: 200, fit: 'contain', position: 'center 20%' })));
    expect(out).toContain(`<img src="${PNG}"`);
    expect(out).toMatch(/role="img" aria-label="Capitol"/);
    expect(out).toMatch(/object-fit:contain/);
    expect(out).toMatch(/object-position:center 20%/);
    expect(out).toMatch(/height:200px/);
  });
  it('网址不加载：仍是占位，不出现 <img>', () => {
    const out = html(build(h(ui.Image, { id: 'photo', src: 'https://example.com/a.png', alt: 'Remote' })));
    expect(out).not.toContain('<img');
    expect(out).toContain('Remote');
  });
});
