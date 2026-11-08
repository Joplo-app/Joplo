/** 回归测试：执行真实 hook/浮层的状态、异步读取和点击处理；不启动浏览器或上传项目。 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReactElement } from 'react';

// 最小 hook 宿主：保留状态、依赖和 effect cleanup，让异步接口测试不依赖 DOM 布局。
const host = vi.hoisted(() => ({ slots: [] as any[], at: 0, effects: [] as (() => void)[], dirty: false }));
const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useState(initial: any) {
    const i = host.at++;
    if (!(i in host.slots)) host.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [host.slots[i], (value: any) => {
      const next = typeof value === 'function' ? value(host.slots[i]) : value;
      if (!Object.is(next, host.slots[i])) { host.slots[i] = next; host.dirty = true; }
    }];
  },
  useCallback(fn: unknown, deps: unknown[]) {
    const i = host.at++;
    if (!same(host.slots[i]?.deps, deps)) host.slots[i] = { deps, fn };
    return host.slots[i].fn;
  },
  useEffect(fn: () => (() => void) | void, deps: unknown[]) {
    const i = host.at++;
    if (!same(host.slots[i]?.deps, deps)) {
      const old = host.slots[i];
      host.slots[i] = { deps };
      host.effects.push(() => { old?.cleanup?.(); host.slots[i].cleanup = fn(); });
    }
  },
}));
vi.mock('../src/i18n/board/context', async () => {
  const { boardEn } = await import('../src/i18n/board/en');
  return { useBoardI18n: () => ({ t: boardEn, locale: 'en' }) };
});
import { CloudPublishPopover, useCloudPublish, type CloudPublishModel } from '../src/board/CloudPublish';
import { fetchCloudLinks } from '../src/runtime/dev-client';

function render<T>(fn: () => T): T {
  let value!: T, count = 0;
  do {
    host.at = 0; host.dirty = false; value = fn();
    for (const effect of host.effects.splice(0)) effect();
    if (count++ > 20) throw Error('State did not settle');
  } while (host.dirty);
  return value;
}
function find(node: any, predicate: (v: ReactElement<any>) => boolean): any {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate); if (match) return match;
  }
}
async function settle<T>(fn: () => T): Promise<T> {
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 0)); render(fn); }
  return render(fn);
}
beforeEach(() => {
  host.slots = []; host.at = 0; host.effects = []; host.dirty = false;
  vi.stubGlobal('document', { querySelector: () => ({ content: 'local-token' }) });
});
afterEach(() => {
  for (const slot of host.slots) slot?.cleanup?.();
  vi.unstubAllGlobals();
});

test.each(['http', 'network', 'json'] as const)('读取链接 %s 失败必须抛错，不能当作已确认不存在链接', async (failure) => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (failure === 'network') throw Error('offline');
    return new Response(failure === 'json' ? '{' : '', { status: failure === 'http' ? 500 : 200 });
  }));
  await expect(fetchCloudLinks('project')).rejects.toThrow();
});
test('读取失败阻止发布；重试成功恢复私密记录，不把失败当成新建公开', async () => {
  let failed = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/links')) return failed ? new Response('', { status: 500 }) : Response.json({ links: { main: { visibility: 'private' } } });
    if (url.endsWith('/account')) return Response.json({ available: true, account: { signedIn: true, email: 'a@b.c', plan: 'free', server: 'https://cloud.joplo.app' } });
    return Response.json({ job: null });
  }));
  const hook = () => useCloudPublish('project');
  let model = render(hook); model.setOpen(true); model = await settle(hook);
  expect(model.linksReady).toBe(false);
  expect(model.linksError).toBeTruthy();
  // 浮层使用独立宿主，避免其状态与 hook 槽位混合。
  const saved = host.slots; host.slots = [];
  const props = { model, ctx: { featureId: 'f', scenarioId: 'f.a.main' }, names: { feature: 'F', scenario: 'Main' }, picks: { scenario: true, feature: true, project: true }, onFlash: () => {} };
  const tree = render(() => CloudPublishPopover(props));
  expect(find(tree, n => n.props['data-testid'] === 'cloud-publish').props.disabled).toBe(true);
  expect(find(tree, n => n.props['data-testid'] === 'cloud-links-error').props.role).toBe('alert');
  const retry = find(tree, n => n.props['data-testid'] === 'cloud-links-retry');
  expect(retry).toBeTruthy();
  host.slots = saved; failed = false;
  await retry.props.onClick(); model = await settle(hook);
  expect(model.linksReady).toBe(true); expect(model.linksError).toBeNull(); expect(model.links.main?.visibility).toBe('private');
});

test('范围没有 picked 内容时勾选评审仍可发布，普通发布保持拦截', () => {
  const publish = vi.fn();
  const model = { open: true, setOpen: () => {}, anchor: null, links: { main: null }, linksReady: true, linksError: null,
    acct: { loading: false, available: true, account: { signedIn: true, email: 'a@b.c', plan: 'free', server: 'https://cloud.joplo.app' } },
    job: null, publish, refresh: async () => null } as unknown as CloudPublishModel;
  const props = { model, ctx: { featureId: 'g', scenarioId: 'g.a.view' }, names: { feature: 'G', scenario: 'View' }, picks: { scenario: false, feature: false, project: false }, onFlash: () => {} };
  let tree = render(() => CloudPublishPopover(props));
  expect(find(tree, n => n.props['data-testid'] === 'cloud-publish').props.disabled).toBe(true);
  find(tree, n => typeof n.type === 'function' && n.type.name === 'VisibilityFields').props.onReview(true);
  tree = render(() => CloudPublishPopover(props));
  const button = find(tree, n => n.props['data-testid'] === 'cloud-publish');
  expect(button.props.disabled).toBe(false); button.props.onClick();
  expect(publish).toHaveBeenCalledWith(props.ctx, 'scenario', 'private', true);
});

test.each([{}, { links: {} }, { links: null }, { links: {main:false} }, { links: {main:[]} }, { links: {main:{visibility:'unknown'}} }])('损坏/旧接口成功响应也不能冒充新建记录：%j', async body => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
 await expect(fetchCloudLinks('project')).rejects.toThrow();
});
