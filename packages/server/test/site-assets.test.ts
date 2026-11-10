import { installFixturePlugins, fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
/**
 * 发布素材独立文件（D98）：
 * - build 把 IR 里的 data URL 素材写成 assets/<sha256>.<ext>，index.html 里不再有 base64 素材；同一内容只写一次；
 * - embeddedAsset 认 data URL、看板本机素材地址与发布素材文件，按类型区分，不认随手写的远程地址；
 * - joplo preview 只读、不出目录、支持 Range（视频 / 音频拖动）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embeddedAsset, SITE_ASSET_PREFIX } from '@joplo-app/kit/plugin';
import { extractSiteAssets } from '../src/binary-assets.ts';
import { buildSite } from '../src/build.ts';
import { startPreview, type PreviewHandle } from '../src/preview.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const H = 'a'.repeat(64);

describe('extractSiteAssets', () => {
  it('写成 <sha256>.<ext>，换成相对路径；同一内容只写一次；未知类型与普通字符串原样保留', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-assets-'));
    const png = dataUrl('image/png', PNG);
    const r = extractSiteAssets({ a: png, b: [png, { c: dataUrl('audio/mpeg', Buffer.from('mp3')) }], d: 'data:text/x-unknown;base64,AAAA', e: 'hello' }, { directory: dir, prefix: './assets/' });
    expect(r.files).toHaveLength(2);
    expect(r.value.a).toMatch(/^\.\/assets\/[0-9a-f]{64}\.png$/);
    expect(r.value.b[0]).toBe(r.value.a);
    expect((r.value.b[1] as { c: string }).c).toMatch(/\.mp3$/);
    expect(r.value.d).toBe('data:text/x-unknown;base64,AAAA');
    expect(r.value.e).toBe('hello');
    expect(fs.readFileSync(path.join(dir, r.value.a.slice('./assets/'.length)))).toEqual(PNG);
  });
});

describe('embeddedAsset', () => {
  it('认 data URL、看板素材地址与发布素材文件，按类型区分；远程地址与随手写的路径不认', () => {
    expect(SITE_ASSET_PREFIX).toBe('./assets/');
    expect(embeddedAsset(`./assets/${H}.png`, 'image')).toBe(`./assets/${H}.png`);
    expect(embeddedAsset(`./assets/${H}.png`, 'model')).toBeNull();
    expect(embeddedAsset(`./assets/${H}.glb`, 'model')).toBeTruthy();
    expect(embeddedAsset(`./assets/${H}.mp4`, 'video')).toBeTruthy();
    expect(embeddedAsset(`/__joplo/p/proj-1/binary/${H}.glb`, 'model')).toBeTruthy();
    expect(embeddedAsset(`/__joplo/p/proj-1/binary/${H}.audio`, 'audio')).toBeTruthy();
    expect(embeddedAsset('data:image/png;base64,AAAA', 'image')).toBeTruthy();
    expect(embeddedAsset('data:image/png;base64,AAAA', 'video')).toBeNull();
    expect(embeddedAsset('https://example.com/a.png', 'image')).toBeNull();
    expect(embeddedAsset('./photo.png', 'image')).toBeNull();
    expect(embeddedAsset(`./assets/${H}.png/../x.png`)).toBeNull();
    expect(embeddedAsset(42)).toBeNull();
  });
});

describe('joplo preview', () => {
  let dir: string, site: PreviewHandle;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-preview-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', `${H}.mp4`), Buffer.from('0123456789'));
    fs.writeFileSync(path.join(os.tmpdir(), 'joplo-preview-secret.txt'), 'secret');
    site = await startPreview({ dir });
  });
  afterAll(async () => { await site?.close(); });
  it('只监听本机；按扩展名给类型；目录外、未知类型、写请求都拒绝', async () => {
    expect(site.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const home = await fetch(site.url);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    const video = await fetch(`${site.url}assets/${H}.mp4`);
    expect(video.headers.get('content-type')).toBe('video/mp4');
    expect((await fetch(`${site.url}..%2Fjoplo-preview-secret.txt`)).status).toBe(404);
    expect((await fetch(`${site.url}%2e%2e/joplo-preview-secret.txt`)).status).toBe(404);
    expect((await fetch(`${site.url}index.html`, { method: 'POST' })).status).toBe(405);
  });
  it('Range：视频拖动取一段', async () => {
    const r = await fetch(`${site.url}assets/${H}.mp4`, { headers: { range: 'bytes=2-5' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await r.text()).toBe('2345');
  });
  it('没有 index.html 的目录给出可操作的错误', async () => {
    await expect(startPreview({ dir: os.tmpdir() + '/joplo-no-such-site' })).rejects.toThrow(/joplo build/);
  });
});

describe('build：素材是独立文件，不再 base64 内联', () => {
  it('图片素材写进 assets/，index.html 里只有相对路径', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-site-assets-')));
    const write = (file: string, content: string | Buffer) => { const t = path.join(root, file); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, content); };
    installFixturePlugins(root);
    write('joplo.config.ts', fixtureConfigSource(`import { config } from '@joplo-app/kit'; export default config({ name: 'Assets', home: '/' });`));
    write('routes/dot.png', PNG);
    write('routes/page.tsx', `import { asset, page } from '@joplo-app/kit';\nimport { Image, Stack } from '@joplo-app/plugin-ui';\nexport default page({ title: 'P', layout: false }, <Stack><Image id="pic" src={asset('./dot.png')} alt="dot" /></Stack>);`);
    write('features/f/feature.ts', `import { feature } from '@joplo-app/kit'; export default feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' });`);
    write('features/f/works/a.tsx', `import { flow, work } from '@joplo-app/kit'; export default work({ title: 'A', summary: 'i', scenarios: { s: flow('S', { start: '/' }).system('One', 'one') } });`);
    const out = path.join(root, 'dist');
    const built = await buildSite({ projectDir: root, outDir: out, home: path.join(root, 'home') });
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    expect(html).not.toContain(PNG.toString('base64'));
    const name = fs.readdirSync(path.join(out, 'assets')).find((f) => /^[0-9a-f]{64}\.png$/.test(f));
    expect(name).toBeTruthy();
    expect(html).toContain(`./assets/${name}`);
    expect(fs.readFileSync(path.join(out, 'assets', name!))).toEqual(PNG);
  }, 180_000);
});
