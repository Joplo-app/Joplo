import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * <Canvas> 在任何合法父容器里都可见：父元素没给高度（Stack、页面里普通的块）时，按 view 的宽高比撑开，
 * 不会因为 height: 100% 解析成 0 而整块消失；父元素给了高度（层、h="100%"）时照常铺满。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/plugin-ui';
import { Canvas, Split, camera } from '../src/plugin.ts';
import { feature, flow, work, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt, type AuthoringProject, type Project } from '@joplo-app/core';
import { I18nProvider } from '../../../packages/web/src/i18n/context';
import { Stage } from '../../../packages/web/src/renderer/Stage';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(tree: unknown): Project {
  const opt = work({ title: 'A', summary: 'i', routes: { '/c': page({ title: 'P' }, tree as never) }, scenarios: { happy: flow('一次', { start: '/c' }) } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...page({ title: 'P', layout: false }, h(ui.Text, { id: 'n' }, 'x')), ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}
const html = (p: Project) => renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={p} state={stateAt(p, 'f.a.happy', 0)} theme="sketch" mode="render" animate={false} /></I18nProvider>);
const canvasRoot = (out: string) => out.match(/<div[^>]*data-jtype="content:Canvas"[^>]*>/)?.[0] ?? '';

describe('<Canvas> sizing', () => {
  it('keeps the view aspect ratio so an auto-height parent does not collapse it', () => {
    const out = html(build(h(ui.Stack, { p: 'lg' }, h(ui.Text, { id: 't' }, 'title'), h(Canvas, { id: 'cv', w: 2560, h: 1600 }, h('div', { id: 'a' }, 'A')))));
    const root = canvasRoot(out);
    expect(root).toMatch(/aspect-ratio:1280 \/ 800/);
    expect(root).toMatch(/width:100%/);
  });
  it('keeps direct text children when splitting world and screen children', () => {
    const out = html(build(h(Canvas, { id: 'cv' }, 'Direct world text', h('div', { id: 'overlay', screen: true }, 'Fixed overlay'))));
    expect(out).toContain('Direct world text');
    expect(out).toMatch(/data-jcanvas-screen[\s\S]*Fixed overlay/);
  });
  it('uses a custom view for the ratio', () => {
    const root = canvasRoot(html(build(h(Canvas, { id: 'cv', view: [1920, 1080] }, h('div', { id: 'a' }, 'A')))));
    expect(root).toMatch(/aspect-ratio:1920 \/ 1080/);
  });
});

it('preserves author HTML metadata without replacing Joplo anchors', () => {
  const out = html(build(h('div', { id: 'probe', 'data-app-frame': 'portrait', 'aria-label': 'Frame', 'aria-hidden': false, role: 'img', title: 'Title', 'data-jid': 'forged', 'data-jexport': 'forged' }, 'Picture')));
  expect(out).toContain('data-app-frame="portrait"');
  expect(out).toContain('aria-label="Frame"');
  expect(out).toContain('aria-hidden="false"');
  expect(out).toContain('role="img"');
  expect(out).toContain('title="Title"');
  expect(out).toContain('data-jid="probe"');
  expect(out).not.toContain('forged');
});

describe('<Split>', () => {
  it('puts the entrance on each piece, keeps the root still, and reads the whole text once to screen readers', () => {
    const out = html(build(h(Canvas, { id: 'cv' }, h(Split, { id: 's', text: 'Not typing, guessing', enter: 'blur', enterMs: 500, enterEase: 'spring', exit: 'fade' }))));
    const root = out.match(/<span[^>]*data-jid="s"[^>]*>/)?.[0] ?? '';
    expect(root).not.toContain('data-jp-content-enter=');
    expect(root).toContain('data-jp-content-enter-stagger="70"');
    expect(root).toContain('data-jp-content-exit="fade"');
    const pieces = [...out.matchAll(/<span[^>]*data-jp-content-enter="blur"[^>]*>([^<]*)<\/span>/g)].map(m => m[1]);
    expect(pieces).toEqual(['Not', 'typing,', 'guessing']);
    expect(out).toContain('data-jp-content-enter-ease="spring"');
    expect(out).toContain('aria-hidden="true"');
    expect(out.split('Not typing, guessing').length - 1).toBe(1);
  });
  it('char mode defaults to rise and a shorter stagger; an explicit enterStagger wins', () => {
    const out = html(build(h(Canvas, { id: 'cv' }, h(Split, { id: 's', text: 'ab', by: 'char' }), h(Split, { id: 't', text: 'cd', enterStagger: 200 }))));
    expect(out).toContain('data-jp-content-enter-stagger="30"');
    expect(out).toContain('data-jp-content-enter-stagger="200"');
    expect([...out.matchAll(/data-jp-content-enter="rise"[^>]*>([^<]*)</g)].map(m => m[1])).toEqual(['a', 'b', 'cd']);
  });
});
