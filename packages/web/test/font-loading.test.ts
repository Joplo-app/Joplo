import { afterEach, expect, it, vi } from 'vitest';
import { loadWenKai, waitForFonts } from '../src/board/font-loading';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function fakeDocument() {
  const links: { rel?: string; href?: string; onload?: () => void; onerror?: () => void; remove: ReturnType<typeof vi.fn> }[] = [];
  return { links, doc: { createElement: () => ({ remove: vi.fn() }), head: { appendChild: (link: typeof links[number]) => links.push(link) } } as unknown as Document };
}
it('never requests CDN for other fonts; selected kai inserts one pinned link and tolerates failure', async () => {
  const { links, doc } = fakeDocument();
  await loadWenKai(null, doc);
  await loadWenKai('hand', doc);
  expect(links).toHaveLength(0);
  const first = loadWenKai('kai', doc);
  const second = loadWenKai('kai', doc);
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css' });
  links[0]!.onerror!();
  await Promise.all([first, second]);
  expect(links[0]!.remove).toHaveBeenCalled();
  const retry = loadWenKai('kai', doc);
  expect(links).toHaveLength(2);
  links[1]!.onload!();
  await retry;
  await loadWenKai('hand', doc);
  expect(links[1]!.remove).toHaveBeenCalled();
});
it('waits for the stylesheet before loading the actual font stack and tolerates timeout', async () => {
  vi.useFakeTimers();
  const { links, doc } = fakeDocument();
  const load = vi.fn().mockResolvedValue([]);
  Object.assign(doc, { fonts: { load, ready: Promise.resolve() } });
  const pending = waitForFonts(doc, 'kai', ['400 16px "LXGW WenKai", serif'], '中文', 50);
  expect(load).not.toHaveBeenCalled();
  links[0]!.onload!();
  await pending;
  expect(load).toHaveBeenCalledWith('400 16px "LXGW WenKai", serif', '中文');
  Object.assign(doc, { fonts: { load: () => new Promise(() => {}), ready: new Promise(() => {}) } });
  const offline = waitForFonts(doc, 'hand', ['16px test'], '中', 50);
  await vi.advanceTimersByTimeAsync(51);
  await expect(offline).resolves.toBeUndefined();
});
it('removes a stalled CDN stylesheet at the export deadline', async () => {
  vi.useFakeTimers();
  const { links, doc } = fakeDocument();
  const pending = waitForFonts(doc, 'kai', ['16px serif'], '中', 50);
  await vi.advanceTimersByTimeAsync(51);
  await pending;
  expect(links[0]!.remove).toHaveBeenCalled();
});
