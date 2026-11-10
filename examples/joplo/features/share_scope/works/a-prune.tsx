import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, callout, done, flow, highlight, work, set, shot, spotlight, uses, type Bind } from '@joplo-app/kit';

import { initialUi, invite, layers, marks, site } from '../../../shared/share/share.tsx';

const ui = $.ui as unknown as Record<string, Bind>;
const clearIn = set($.inputs.t_in, '');

/** 只分享「正常发出邀请」时保留的条目；其余裁掉。 */
const HAPPY = { f_invite: 'keep', sc_happy: 'keep', p_members: 'keep', e_invite: 'keep', v_voice: 'keep', v_preview: 'keep' } as const;
/** 只分享「席位已满时邀请」：多借用账单堆进来的「席位 5 / 5」。 */
const FULL = { f_invite: 'keep', sc_full: 'keep', p_members: 'keep', e_invite: 'keep', e_seat: 'borrow', v_voice: 'keep', v_preview: 'keep' } as const;
/** 只分享「邀请成员」整个功能：三个场景都在，「席位已满」那一条照样借用席位徽标。 */
const FEATURE = { f_invite: 'keep', sc_happy: 'keep', sc_full: 'keep', sc_expired: 'keep', p_members: 'keep', e_invite: 'keep', e_seat: 'borrow', v_voice: 'keep', v_preview: 'keep' } as const;

export default withDesignRecord(work({
  title: 'A · 构建时裁剪',
  summary: 'joplo share --private --no-review --scenario / --work 在构建时就把范围外的功能、场景、页面和别的功能堆进来的元素裁掉；场景引用到的别的功能的元素只借用那一个',
  focus: '保密看的是分享里有什么数据，而不是页面上有没有入口',
  tradeoffs: ['分享里确实没有其他功能，源码里也搜不到', '页面会少掉其他功能堆进来的按钮，和完整项目看起来不一样', '借用元素时由作者判断，不会自动拦下'],

  layers: layers(),
  state: { ui: initialUi() },

  scenarios: {
    deep_link: flow('现在：发场景深链接', { cases: ['deep_link'], start: '/share-scope', outcome: 'failure', mock: '现在的分享', expected: '（现状）链接停在邀请成员，但小周能切到账单，源码里也能搜到新定价' })
      .card('现在：把场景链接发给小周', { sub: '林舟只想让合作方看邀请成员，账单的新定价还没公布' })
      .type('t_in', 'npx joplo share --private --no-review', '林舟像平时一样分享')
      .press('Enter', '整个项目都发上去了', clearIn, set(ui.tOld, true), shot('t_term'))
      .system('复制场景链接', '再复制停在这个场景的链接', set(ui.tDeep, true), highlight('t_deeplink'), uses('deep_link_not_secret'))
      .system('分享里有什么', '三个功能都在分享里', shot('inside'), spotlight('in_billing'), set(ui.insideNote, '链接只决定从哪里开始看：三个功能、六个场景、所有页面都写在 index.html 里'))
      .card('现在是小周', { role: 'zhou', sub: '他打开林舟发来的链接' })
      .system('打开链接', '停在邀请成员，看起来没问题', ...site('full'), shot('s_root'))
      .click('s_feat', '小周点开功能下拉', set(ui.featOpen, true), callout('s_feat_billing', '还没公布的账单也在'))
      .click('s_src', '再看一眼页面源码', set(ui.featOpen, false), set(ui.srcOpen, true))
      .type('s_find', '新定价', '搜「新定价」')
      .press('Enter', '源码里找到了 7 处', set($.inputs.s_find, ''), set(ui.findState, 'hit'), shot('s_srcpanel'), highlight('s_srchit'),
        done('小周看到了还没公布的新定价', 'failure')),

    scenario: flow('只分享一个场景', { cases: ['scenario'], start: '/share-scope', expected: '分享里只有「正常发出邀请」；小周打开直接进演示，源码里搜不到账单' })
      .card('只分享「正常发出邀请」', { sub: '林舟这次只把一个场景发给小周' })
      .type('t_in', 'npx joplo share --private --no-review --scenario invite.a-modal.happy', '分享时写明场景')
      .press('Enter', '终端先写清楚范围', clearIn, set(ui.tHappy, true), shot('t_term'), highlight('t_scope'))
      .system('裁掉范围外的内容', '构建时就裁掉其他功能', shot('inside'), set(ui.insideTitle, '--scenario invite.a-modal.happy'), ...marks(HAPPY, 'cut'), spotlight('in_features'), uses('prune_build', 'keep_reachable'))
      .system('堆叠元素一样裁掉', '隐藏的横幅也在 IR 里，一样裁掉', highlight('in_stacked'), set(ui.insideNote, '账单的「新定价」横幅虽然被 when 隐藏，也写在 IR 里，所以一样要裁掉'))
      .system('上传完成', '得到一条单独的链接', set(ui.tHappyOk, true), shot('t_term'), highlight('t_happy_ok'))
      .card('现在是小周', { role: 'zhou', sub: '他打开林舟发来的新链接' })
      .system('直接进演示', '打开就是这个场景', ...site('scenario'), shot('s_root'), callout('s_scope_title', '没有功能下拉'), uses('straight_in'))
      .system('第 1 步', '照常播放演示', ...invite.open(), spotlight('s_stage'))
      .system('第 3 步', '邀请发出', ...invite.email(), ...invite.send())
      .click('s_src', '小周看一眼源码', set(ui.srcOpen, true))
      .type('s_find', '新定价', '搜「新定价」')
      .press('Enter', '一处也没有', set($.inputs.s_find, ''), set(ui.findState, 'none'), shot('s_srcpanel'), highlight('s_srcnone'),
        done('小周只看到这一个场景，源码里也找不到账单')),

    feature: flow('只分享一个功能', { cases: ['feature'], start: '/share-scope', expected: '分享里是邀请成员的三个场景，账单和数据导出都不在' })
      .card('只分享「邀请成员」', { sub: '小周要看邀请的全部情况' })
      .type('t_in', 'npx joplo share --private --no-review --work invite', '按功能分享')
      .press('Enter', '三个场景都带上', clearIn, set(ui.tFeature, true), shot('t_term'))
      .system('分享里有什么', '只有邀请成员', shot('inside'), set(ui.insideTitle, '--work invite'), ...marks(FEATURE, 'cut'), spotlight('in_features'))
      .card('现在是小周', { role: 'zhou' })
      .system('打开链接', '左边是三个场景，没有别的功能', ...site('feature'), shot('s_root'), highlight('s_side'))
      .click('s_sc_full', '切到「席位已满时邀请」', set(ui.siteScenario, 'full'), set(ui.showSeat, true),
        done('小周能看邀请成员的所有场景，看不到别的功能')),

    borrowed: flow('场景用到了别的功能的元素', { cases: ['borrowed'], start: '/share-scope', expected: '只借用「席位 5 / 5」这一个元素；终端写明带了什么；源码里搜不到账单' })
      .card('「席位已满」用到了账单的元素', { sub: '这个场景第 2 步对准顶栏的「席位 5 / 5」，它是账单功能堆进来的' })
      .type('t_in', 'npx joplo share --private --no-review --scenario invite.a-modal.full', '分享这个场景')
      .press('Enter', '终端写明借用了哪个元素', clearIn, set(ui.tFull, true), shot('t_term'), highlight('t_borrow'), uses('report_borrowed'))
      .system('只借这一个', '只带被引用的那一个元素', shot('inside'), set(ui.insideTitle, '--scenario invite.a-modal.full'), ...marks(FULL, 'cut'), spotlight('i_e_seat'),
        set(ui.insideNote, '保留「席位 5 / 5」这一条贡献子树，去掉 from: "billing.a-tier"；账单的名字、场景、横幅都不进分享'), uses('borrow_referenced'))
      .system('上传完成', '照常发布，只在终端提醒', set(ui.tFullOk, true), shot('t_term'))
      .card('现在是小周', { role: 'zhou' })
      .system('打开链接', '直接进「席位已满时邀请」', ...site('scenario', 'full'), shot('s_root'))
      .system('第 2 步', '镜头对准席位徽标', ...invite.open(), set(ui.seatFull, true), shot('s_seat'), callout('s_seat', '借来的元素'))
      .click('s_src', '小周看一眼源码', set(ui.srcOpen, true), shot('s_root'))
      .type('s_find', '新定价', '搜「新定价」')
      .press('Enter', '一处也没有', set($.inputs.s_find, ''), set(ui.findState, 'none'), shot('s_srcpanel'),
        done('只多了一个徽标，账单的其他内容都没有带出去')),

    reshare: flow('写错 id，改好后重新分享', { cases: ['bad_id', 'reshare'], start: '/share-scope', state: { ui: { ...initialUi(), ...Object.fromEntries(Object.entries(HAPPY).map(([k, v]) => [`r_${k}`, v])) } }, expected: '写错 id 时什么都不上传；改好后更新原来的范围链接，主链接不变' })
      .card('改完场景，再分享一次', { sub: '林舟（Pro）改了「正常发出邀请」，要更新给小周的链接' })
      .type('t_in', 'npx joplo share --private --no-review --scenario invite.happy', '少写了方案名')
      .press('Enter', '报错，列出可选的场景', clearIn, set(ui.tBad, true), shot('t_term'), highlight('t_bad'), uses('fail_closed'))
      .type('t_in', 'npx joplo share --private --no-review --scenario invite.a-modal.happy', '照着提示改')
      .press('Enter', '更新原来的范围链接', clearIn, set(ui.tFix, true), highlight('t_fix'), uses('own_link'))
      .system('cloud.json', '每个范围一条记录', set(ui.cloud, 'after'), shot('a_cloud_after'), uses('no_cloud_change'),
        done('小周的链接不变，主链接和评审链接也没动')),
  },
}), designRecords.share_scope);
