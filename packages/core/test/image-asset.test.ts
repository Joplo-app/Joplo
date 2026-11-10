import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 真实图片：asset() 把项目里的图片内嵌成 data URI；<Image> 只画内嵌的图片，其他 src 退回占位并给出提示。
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { asset, feature, flow, layer, work, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(tree: unknown) {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const opt = work({ title: 'A', summary: 'i', layers: { v: layer('视图', tree as never) }, scenarios: { s: flow('一次', { start: '/' }) } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}
const warnings = (r: ReturnType<typeof build>, code: string) => r.diagnostics.filter((d) => d.code === code);

describe('asset()', () => {
  const dir = mkdtempSync(join(tmpdir(), 'joplo-asset-'));
  writeFileSync(join(dir, 'dot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dir, 'notes.txt'), 'x');
  const from = join(dir, 'features', 'f', 'works', 'a.tsx');

  it('相对调用它的源文件解析路径，按扩展名给出 MIME，内容 base64', () => {
    expect(asset('../../../dot.png', from)).toBe(`data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`);
    expect(asset('../../../icon.svg', from)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it('不写 from 时按调用者所在文件解析', () => {
    // 本测试文件旁边没有这个文件：报错信息里的路径应以本文件所在目录为基准
    expect(() => asset('./missing.png')).toThrow(join(import.meta.dirname, 'missing.png'));
  });
  it('文件不存在、类型不支持：报错并说明怎么改', () => {
    expect(() => asset('../../../nope.jpg', from)).toThrow(/file not found .*relative to the file that calls asset/);
    expect(() => asset('../../../notes.txt', from)).toThrow(/unsupported asset type "\.txt"/);
  });
});

describe('<Image> 的 src', () => {
  it('内嵌图片（data:image/…）原样进 IR，没有提示', () => {
    const r = build(h(ui.Image, { id: 'photo', src: 'data:image/png;base64,AAAA', alt: '照片', fit: 'contain' }));
    expect(warnings(r, 'IMAGE_PLACEHOLDER')).toEqual([]);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('网址或相对路径：画成占位，并提示用 asset() 内嵌', () => {
    const r = build(h('div', null, h(ui.Image, { id: 'a', src: 'https://example.com/x.jpg', alt: 'x' }), h(ui.Image, { id: 'b', src: './x.jpg', alt: 'y' })));
    const w = warnings(r, 'IMAGE_PLACEHOLDER');
    expect(w).toHaveLength(2);
    expect(w[0]!.severity).toBe('warning');
    expect(w[0]!.message).toContain("asset('./photo.jpg')");
  });
  it('没写 src、或 src 是状态绑定：不提示', () => {
    expect(warnings(build(h(ui.Image, { id: 'a', alt: '占位' })), 'IMAGE_PLACEHOLDER')).toEqual([]);
  });
  it('fit 只接受 cover / contain', () => {
    const r = build(h(ui.Image, { id: 'a', src: 'data:image/png;base64,AAAA', fit: 'stretch' }));
    expect(r.diagnostics.map((d) => d.code)).toContain('INVALID_IMAGE_FIT');
  });
});
