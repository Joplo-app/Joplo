import { fixtureConfig as config } from '../../../../scripts/test/fixtures.ts';
/**
 * 按场景保密分享（D75）的测试夹具：「团队空间」三个功能都往 / 的 header 插槽堆元素。
 * - invite（选定 a）：邀请按钮；happy 只点自己的按钮；full 的镜头对准 billing 堆进来的席位徽标（借用）；
 *   jump 跳到 billing 新增的 /billing 页面（借用页面）；fork 有一条分叉指向 happy；b 是没选定的方案。
 * - billing（选定 a）：席位徽标、when 隐藏的新定价横幅、新增 /billing 页面，名字、目标、场景都带 SECRET。
 * - exp（选定 a）：导出按钮。
 */
import { $, feature, flow, go, option, page, role, rule, shot, Slot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import * as ui from '@joplo-app/plugin-ui';
import type { AuthoringProject } from '../../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:2:3` });

/** 只属于 billing / exp 的文字：裁剪后的 IR 里一个都不能出现（借用的元素除外，见测试）。 */
export const OUT = {
  billingName: 'BILLING_NAME_secret_pricing',
  billingGoal: 'BILLING_GOAL_pro_39_per_seat',
  billingRole: 'BILLING_ROLE_finance',
  billingScenario: 'BILLING_SCENARIO_upgrade_to_pro',
  billingStep: 'BILLING_STEP_pick_the_new_plan',
  banner: 'BILLING_BANNER_new_price_unannounced',
  billingRule: 'BILLING_RULE_discount_for_old_users',
  billingPage: 'BILLING_PAGE_plans_table',
  exportName: 'EXPORT_NAME_data_export',
  exportLabel: 'EXPORT_LABEL_download_csv',
  exportScenario: 'EXPORT_SCENARIO_download',
  inviteB: 'INVITE_B_OPTION_batch_page',
};
/** 借用的席位徽标上的文字（full 场景分享时应该出现）。 */
export const SEAT = 'SEAT_BADGE_5_of_5';

export function scopeSource(): AuthoringProject {
  const home = page({ title: 'Members', layout: false }, h(ui.Stack, { id: 'home' }, h(ui.Group, { id: 'header' }, h(Slot, { name: 'header' })), h(ui.Text, { id: 'list' }, 'Members list')));
  const inviteA = option({
    name: 'A modal', idea: 'Invite in place',
    on: { '/': { header: h(ui.Button, { id: 'invite_btn' }, 'Invite') } },
    scenarios: {
      happy: flow('Happy invite', { start: '/' }).click('invite_btn', 'Open invite'),
      full: flow('Seats full', { start: '/' }).click('invite_btn', 'Open invite').system('Seats', 'Look at the seats', shot('seat')),
      jump: flow('Jump to billing', { start: '/' }).click('invite_btn', 'Open invite', go('/billing')),
    },
  });
  const inviteB = option({ name: OUT.inviteB, idea: 'Batch page', scenarios: { batch: flow('Batch', { start: '/' }).system('Batch', 'Batch only') } });
  const billingA = option({
    name: 'Tiered', idea: 'New tiers',
    on: {
      '/': {
        header: [
          h(ui.Group, { id: 'seat_box' }, h(ui.Badge, { id: 'seat' }, SEAT)),
          h(ui.Alert, { id: 'banner', when: $.ui.never }, OUT.banner),
        ],
      },
    },
    routes: { '/billing': page({ title: OUT.billingPage, layout: false }, h(ui.Stack, { id: 'plans' }, h(ui.Button, { id: 'upgrade' }, 'Upgrade'))) },
    rules: { discount: rule(OUT.billingRule) },
    scenarios: { upgrade: flow(OUT.billingScenario, { start: '/' }).click('seat', OUT.billingStep, go('/billing')) },
  });
  const expA = option({
    name: 'CSV', idea: 'Download',
    on: { '/': { header: h(ui.Button, { id: 'export_btn' }, OUT.exportLabel) } },
    scenarios: { csv: flow(OUT.exportScenario, { start: '/' }).click('export_btn', 'Export') },
  });
  return {
    root: '/p',
    config: { ...config({ name: 'Team space', home: '/' }), ...at('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...at('routes/page.tsx') } },
    features: {
      invite: {
        def: { ...feature({ name: 'Invite', goal: 'Invite members', roles: { lin: role('Lin') }, cases: { main: { title: 'Main' } }, pick: 'a' }), ...at('features/invite/feature.ts') },
        options: { a: { ...inviteA, ...at('features/invite/options/a.tsx') }, b: { ...inviteB, ...at('features/invite/options/b.tsx') } },
      },
      billing: {
        def: { ...feature({ name: OUT.billingName, goal: OUT.billingGoal, roles: { fin: role(OUT.billingRole) }, cases: {}, pick: 'a' }), ...at('features/billing/feature.ts') },
        options: { a: { ...billingA, ...at('features/billing/options/a.tsx') } },
      },
      exp: {
        def: { ...feature({ name: OUT.exportName, goal: 'Export data', cases: {}, pick: 'a' }), ...at('features/exp/feature.ts') },
        options: { a: { ...expA, ...at('features/exp/options/a.tsx') } },
      },
    },
  };
}
