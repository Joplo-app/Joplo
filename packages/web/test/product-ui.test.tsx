import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * D68 产品界面组件与 D67 PM 视角的默认呈现（无浏览器，服务端渲染）：
 * - 每个新组件都能编译、check 没有 error、回放通过（replay_ok），交互状态（Menu 打开、TabBar 当前项、DataTable 选中 / 排序 / 加载、
 *   浮层通知、Radio.Card、图表数据、Indicator 的条件 disabled）随步骤变化，跳到哪一步就渲染哪一步；
 * - 渲染器源码不发网络请求、不加载外部资源（发布站 CSP connect-src 'none'；真实浏览器里的验证见 server/test/product-ui-csp.test.ts）；
 * - 看板左栏写功能目标与“面向：角色”、高优先级标记、缺失里的高优先级数；发布站首页卡片写角色；封面说明缺省用功能目标。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, option, page, set, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, isNodeVisible, replay, stateAt, validate, type AuthoringProject, type Project } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { Stage } from '../src/renderer/Stage';
import { chartModel, diffTone, menuPlacement, notificationPlacement, selectedIds } from '../../../plugins/ui/src/runtime.tsx';
import { CaseNav } from '../src/board/CaseNav';
import { caseBrief, gapsOf, rolesOfFeature } from '../src/board/nav-model';
import { SiteApp, SiteHome } from '../src/site/SiteApp';
import { Brand, JOPLO_SITE_URL } from '../src/player/PlayerPage';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const members = [
  { id: 'u1', name: 'Ana Lee', status: 'Active', joined: '2026-10-01' },
  { id: 'u2', name: 'Bo Chen', status: 'Pending', joined: '2026-11-02' },
];

function build(): { dev: Project; publish: Project } {
  const tree = h(ui.Stack, null,
    h(ui.Indicator, { id: 'bell', label: $.ui.unread, disabled: $.ui.read }, h(ui.Text, null, 'Inbox')),
    h(ui.Stat, { id: 'kpi', label: 'Signups', value: $.data.signups, diff: '+12%' }),
    h(ui.KeyValue, { id: 'kv', total: true, items: [{ label: 'Seats', value: '5' }, { label: 'Total', value: $.data.total }] }),
    h(ui.BarChart, { id: 'chart', dataKey: 'week', data: $.data.weeks, series: [{ name: 'signups', label: 'Signups' }] }),
    h(ui.LineChart, { id: 'line', dataKey: 'week', data: $.data.weeks, series: [{ name: 'signups' }] }),
    h(ui.Avatar.Group, { id: 'avatars' }, h(ui.Avatar, { name: 'Ana Lee' }), h(ui.Avatar, { name: 'Bo Chen' })),
    h(ui.EmptyState, { id: 'empty', when: $.ui.empty, icon: '✉', title: 'No members yet', description: 'Invite teammates' }, h(ui.Button, { id: 'invite_first' }, 'Invite')),
    h(ui.ListRow, { id: 'row_bo', avatar: 'Bo Chen', title: 'Bo Chen', description: $.ui.boStatus, active: $.ui.boNew }, h(ui.Badge, null, 'Member')),
    h(ui.Menu, { id: 'menu', opened: $.ui.menu, position: 'bottom-end' },
      h(ui.Menu.Target, null, h(ui.ActionIcon, { id: 'more', 'aria-label': 'More' }, '⋯')),
      h(ui.Menu.Dropdown, { id: 'dropdown' }, h(ui.Menu.Label, null, 'Invite'), h(ui.Menu.Item, { id: 'revoke', color: 'red', leftSection: '✕' }, 'Revoke'), h(ui.Menu.Divider, null))),
    h(ui.DataTable, { id: 'table', records: $.data.members, selectedRecords: $.ui.selected, fetching: $.ui.loading, sortStatus: $.ui.sort, columns: [{ accessor: 'name', avatar: true }, { accessor: 'status', badge: { Active: 'green', Pending: 'yellow' } }, { accessor: 'joined', sortable: true }] }),
    h(ui.Radio.Group, { id: 'plan', label: 'Plan' }, h(ui.Radio.Card, { value: 'team', label: 'Team' }), h(ui.Radio.Card, { value: 'pro', label: 'Pro', description: 'Unlimited' })),
    h(ui.Tabs, { id: 'tabs' }, h(ui.Tabs.List, null, h(ui.Tabs.Tab, { id: 'tab_all', value: 'all', rightSection: $.ui.count }, 'All'))),
    h(ui.Skeleton, { id: 'sk', when: $.ui.loading, h: 20 }),
    h(ui.Notification, { id: 'undo_bar', when: $.ui.revoked, position: 'bottom', title: 'Invite revoked', withCloseButton: false }, h(ui.Button, { id: 'undo' }, 'Undo')),
    h(ui.TabBar, { id: 'tabbar', 'aria-label': 'Bottom navigation', data: [{ value: 'home', label: 'Home', icon: '⌂' }, { value: 'me', label: 'Me', icon: '☺', badge: 2 }] }),
  );
  const fl = flow('Revoke Bo', { start: '/', cases: ['happy'] })
    .click('more', set($.ui.menu, true))
    .click('revoke', set($.ui.menu, false), set($.ui.loading, true))
    .system('Server revokes the invite', set($.ui.loading, false), set($.ui.revoked, true), set($.ui.selected, ['u2']), set($.ui.sort, { columnAccessor: 'joined', direction: 'desc' }), set($.data.weeks, [{ week: 'W1', signups: 4 }, { week: 'W2', signups: 9 }]), set($.ui.read, true))
    .select('plan', 'pro')
    .select('tabbar', 'me')
    .click('undo', set($.ui.revoked, false))
    .click('invite_first')
    .click('tab_all');
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...page({ title: 'Members', layout: false }, tree), ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'Members', goal: 'Admins manage teammates so access stays right', roles: ['Space admin', 'Member'], cases: { happy: { title: 'Revoke an invite', priority: 'high', expected: 'The invite disappears and Undo is offered' }, gone: { title: 'Link already used', priority: 'high' } }, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...option({ name: 'A · Inline', idea: 'i', state: { ui: { menu: false, loading: false, revoked: false, selected: [], sort: null, empty: true, boStatus: 'Invited', boNew: true, unread: '3', read: false, count: 2 }, data: { signups: 128, total: '$45', members, weeks: [{ week: 'W1', signups: 2 }, { week: 'W2', signups: 5 }] } }, scenarios: { happy: fl } }), ...F('features/f/options/a.tsx') } } } },
  };
  const dev = compile(src, 'dev');
  expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const publish = compile(src, 'publish');
  expect(publish.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return { dev: dev.project!, publish: publish.project! };
}
const html = (p: Project, position: number) => renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={p} state={stateAt(p, 'f.a.happy', position)} theme="sketch" mode="render" animate={false} /></I18nProvider>);

describe('新组件：编译、回放与按步骤渲染', () => {
  it('check 没有 error，回放通过（replay_ok）；Menu.Item 只在菜单打开时可点', () => {
    const { dev } = build();
    const r = validate(dev);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.verification['f.a']).toBe('replay_ok');
    expect(replay(dev, 'f.a.happy').diagnostics).toEqual([]);
    const scene = dev.scenes['f.a@/']!;
    expect(isNodeVisible(scene, 'revoke', stateAt(dev, 'f.a.happy', 0))).toBe(false);
    expect(isNodeVisible(scene, 'revoke', stateAt(dev, 'f.a.happy', 1))).toBe(true);
    // 菜单没打开时点菜单项：回放报 TARGET_HIDDEN（与 Modal 里的按钮一致）
    const broken = structuredClone(dev);
    broken.scenarios['f.a.happy']!.steps.splice(0, 1);
    expect(replay(broken, 'f.a.happy').diagnostics.map((d) => d.code)).toContain('TARGET_HIDDEN');
  });
  it('第 0 步：菜单关闭、表格无选中无排序、图表是初始数据、空状态与角标显示、TabBar 第一项是当前项', () => {
    const { dev } = build();
    const s = html(dev, 0);
    expect(s).not.toContain('data-jid="revoke"');
    expect(s).toContain('data-jid="more"');
    expect(s).not.toContain('data-jselected-row');
    expect(s).not.toContain('data-jsort');
    expect(s).toContain('⇅');
    expect(s).toContain('data-jbadge="Pending"');
    expect(s).toContain('data-jid="empty"');
    expect(s).toContain('No members yet');
    expect(s).toContain('data-jindicator');
    expect(s).toMatch(/role="tab" aria-selected="true" data-jchoice="home"/);
    expect(s).toContain('data-jdiff="up"');
    expect(s).toContain('data-jtotal');
    expect(s).toContain('javatar-group');
    expect(s).toMatch(/data-jid="row_bo"[^>]*data-jactive/);
    expect(s).not.toContain('data-jid="undo_bar"');
  });
  it('第 1 步菜单打开（Menu.Item 可见、右对齐）；第 2 步加载中（表格遮罩 + Skeleton）', () => {
    const { dev } = build();
    const one = html(dev, 1);
    expect(one).toContain('data-jid="revoke"');
    expect(one).toContain('role="menu"');
    expect(one).toContain('right:0');
    expect(html(dev, 1)).not.toContain('data-jfetching');
    const two = html(dev, 2);
    expect(two).not.toContain('data-jid="revoke"');
    expect(two).toContain('data-jfetching=""');
    expect(two).toContain('data-jid="sk"');
  });
  it('第 3 步：选中行、排序箭头、图表新数据、浮层通知出现、角标按条件隐藏', () => {
    const { dev } = build();
    const s = html(dev, 3);
    expect(s).toMatch(/data-jselected-row="" aria-selected="true"/);
    expect(s).toContain('data-jsort="desc"');
    expect(s).toContain('▼');
    expect(s).toContain('data-jfloating="bottom"');
    expect(s).toContain('Invite revoked');
    expect(s).not.toContain('data-jindicator');
    expect(s).not.toContain('data-jfetching');
  });
  it('第 4–6 步：Radio.Card 与 TabBar 的选择、撤销后通知消失', () => {
    const { dev } = build();
    expect(html(dev, 3)).not.toMatch(/data-jid="[^"]+"[^>]*role="radio" aria-checked="true"/);
    expect(html(dev, 4)).toMatch(/role="radio" aria-checked="true" data-jchecked=""/);
    expect(html(dev, 5)).toMatch(/role="tab" aria-selected="true" data-jchoice="me"/);
    expect(html(dev, 6)).not.toContain('data-jfloating');
  });
  it('发布 IR 也能渲染同样的状态（新组件只是目录里的属性，没有创作侧字段）', () => {
    const { publish } = build();
    expect(replay(publish, 'f.a.happy').diagnostics).toEqual([]);
    expect(html(publish, 3)).toContain('data-jselected-row');
  });
});

describe('新组件的纯函数', () => {
  it('chartModel：系列取数字（其余当 0），刻度是好看的整数步长，空数据不崩', () => {
    const m = chartModel([{ w: 'a', x: 3 }, { w: 'b', x: 'bad' }, { w: 'c', x: 17 }], 'w', [{ name: 'x', label: 'X' }, { nope: 1 }]);
    expect(m.labels).toEqual(['a', 'b', 'c']);
    expect(m.series).toHaveLength(1);
    expect(m.series[0]).toMatchObject({ name: 'x', label: 'X', values: [3, 0, 17] });
    expect(m.max).toBeGreaterThanOrEqual(17);
    expect(m.ticks[0]).toBe(0);
    expect(m.ticks.at(-1)).toBe(m.max);
    expect(chartModel(undefined, undefined, null)).toMatchObject({ labels: [], series: [], max: 1 });
  });
  it('selectedIds / diffTone / menuPlacement / notificationPlacement', () => {
    expect([...selectedIds(['u1', { id: 'u2' }, null, ''], 'id')]).toEqual(['u1', 'u2']);
    expect([...selectedIds(undefined, 'id')]).toEqual([]);
    expect(diffTone('+3%')).toBe('up');
    expect(diffTone('−2')).toBe('down');
    expect(diffTone('-2')).toBe('down');
    expect(diffTone('flat')).toBe('flat');
    expect(menuPlacement('top-end')).toEqual({ top: true, end: true });
    expect(menuPlacement('bottom-start')).toEqual({ top: false, end: false });
    expect(notificationPlacement('top-right')).toMatchObject({ position: 'absolute', top: 16, right: 16 });
    expect(notificationPlacement('bottom')).toMatchObject({ bottom: 16, left: '50%' });
    expect(notificationPlacement('middle')).toBeNull();
    expect(notificationPlacement(undefined)).toBeNull();
  });
  it('渲染器源码不发网络请求、不加载外部资源（发布站 CSP connect-src none 下照常工作）', () => {
    const src = readFileSync(new URL('../src/renderer/components.tsx', import.meta.url), 'utf8');
    for (const banned of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\(/, /https?:\/\//, /new Image\(/, /localStorage/]) expect(src, String(banned)).not.toMatch(banned);
  });
});

describe('PM 视角的默认呈现（只读现有字段）', () => {
  it('看板左栏：功能目标、面向：角色、高优先级标记、缺失里的高优先级数', () => {
    const { dev } = build();
    expect(rolesOfFeature(dev, 'f')).toEqual(['Space admin', 'Member']);
    expect(caseBrief(dev, 'f.happy')).toEqual({ high: true, expected: 'The invite disappears and Undo is offered' });
    expect(caseBrief(dev, 'f.gone')).toEqual({ high: true, expected: null });
    expect(caseBrief(dev, 'f.nope')).toEqual({ high: false, expected: null });
    expect(gapsOf(dev, 'f.a')).toEqual({ missing: 1, undecided: 0, missingHigh: 1 });
    const nav = renderToStaticMarkup(<I18nProvider explicit="en"><CaseNav project={dev} featureId="f" optionId="f.a" caseId={null} scenarioId={null} onOption={() => {}} onCase={() => {}} onScenario={() => {}} onOptionCase={() => {}} onCopy={() => {}} /></I18nProvider>);
    expect(nav).toContain('data-testid="feature-brief"');
    expect(nav).toContain('Admins manage teammates so access stays right');
    expect(nav).toContain('For: Space admin and Member');
    expect(nav).toContain('data-testid="case-f.happy-high"');
    expect(nav).toContain('data-testid="gap-high"');
    expect(nav).toContain('1 high priority');
    const zh = renderToStaticMarkup(<I18nProvider explicit="zh-CN"><CaseNav project={dev} featureId="f" optionId="f.a" caseId={null} scenarioId={null} onOption={() => {}} onCase={() => {}} onScenario={() => {}} onOptionCase={() => {}} onCopy={() => {}} /></I18nProvider>);
    expect(zh).toContain('面向：Space admin、Member');
    expect(zh).toContain('高优先级 1');
  });
  it('发布站首页卡片写“面向：角色”；发布 IR 里没有 cases / expected（创作侧，D33）', () => {
    const { publish } = build();
    expect(publish.cases).toEqual({});
    expect(publish.features.f!.caseIds).toEqual([]);
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/' });
    // D102：只有一个作品的发布站打开就是它的封面（不经过首页），所以这里直接渲染首页本身来看卡片
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={publish} onView={() => {}} /></I18nProvider>);
    vi.unstubAllGlobals();
    expect(home).toContain('For: Space admin and Member · 1 scenario');
    expect(home).not.toContain('The invite disappears');
  });
  it('发布站顶栏的 Joplo 标志在新标签页打开官网；看板里仍是回首页的按钮', () => {
    const { publish } = build();
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://share.joplo.app/x/' });
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: publish, home: '/' }} search="" /></I18nProvider>);
    vi.unstubAllGlobals();
    // 演示页（SitePlayer）要等 effect 才有内容，SSR 渲染不出来；它和首页传同一个 JOPLO_SITE_URL
    const player = renderToStaticMarkup(<I18nProvider explicit="en"><Brand href={JOPLO_SITE_URL} /></I18nProvider>);
    const board = renderToStaticMarkup(<I18nProvider explicit="en"><Brand onClick={() => {}} /></I18nProvider>);
    expect(board).toMatch(/^<button[^>]*aria-label="Joplo · Go to home"/);
    const brand = /<a[^>]*data-testid="brand"[^>]*>/;
    for (const html of [home, player]) {
      const tag = html.match(brand)?.[0] ?? '';
      expect(tag).toContain('href="https://joplo.app/"');
      expect(tag).toContain('target="_blank"');
      expect(tag).toContain('rel="noopener noreferrer"');
      expect(tag).toContain('aria-label="Joplo website (opens in a new tab)"');
    }
  });
});
