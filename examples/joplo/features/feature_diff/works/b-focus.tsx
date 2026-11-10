import { $, callout, done, excluded, flow, highlight, layer, work, set, uses } from '@joplo-app/kit';
import { FocusViewer, focusInitial } from '../../../shared/comparison/focus.tsx';

export default work({
  title: 'B · 并排对照，可收起列表、单侧放大',
  summary: '默认仍是左右并排；场景列表可以收起、变化卡压成一行，把空间还给画面；需要细看时把一侧放大到整个工作区，在旧版和新版之间切换',
  focus: '画面太小看不清：先把空间让给播放器，再允许单侧放大',
  tradeoffs: ['保留并排的直接对照', '列表收起后要再点一次才能换场景', '放大后同一时间只看到一版'],
  layers: { viewer: layer('功能差异查看器', <FocusViewer />, { icon: 'window' }) },
  state: { ui: focusInitial() },
  coverage: Object.fromEntries(['rationale', 'insertion', 'added', 'removed', 'uncertain', 'initial', 'drift', 'stale'].map((k) => [k, excluded('本方案只改查看器布局；匹配、对齐与发布行为沿用 A')])),
  scenarios: {
    legible: flow('先把空间让给画面', { cases: ['legible'], start: '/comparison', expected: '收起列表后两版画面明显变大，变化卡只占一行' })
      .system('现在：两版各占半宽，字小到读不清', callout('fb_new_sm_status', '状态变了，但字太小', { side: 'bottom' }), uses('canvas_first'))
      .click('fb_nav', '收起场景列表', set($.ui.nav, false), set($.ui.navLabel, '展开列表'), set($.ui.size, 'md'))
      .system('变化卡压成一行，结果的前后值直接写出', highlight('fb_delta'), uses('result_values'))
      .system('同样并排，画面大了一截', done('不用放大也能读清两版的状态')),
    zoom: flow('放大一侧，在两版之间切换', { cases: ['zoom', 'spot'], start: '/comparison', expected: '一侧占满工作区；切换旧版/新版时两边仍停在对应的同一步' })
      .click('fb_zoom_new', '把新版放大到整个工作区', set($.ui.mode, 'new'), set($.ui.size, 'lg'))
      .select('fb_side', 'old', '同一步切到旧版', set($.ui.mode, 'old'), highlight('fb_old_lg_status'))
      .select('fb_side', 'new', '再切回新版：多了预览，状态变成“正在发送”', set($.ui.mode, 'new'), highlight('fb_new_lg_preview'))
      .click('fb_unzoom', '看清以后回到并排', set($.ui.mode, 'split'), set($.ui.size, 'sm'), done('需要细节时放大，需要对照时并排')),
  },
});
