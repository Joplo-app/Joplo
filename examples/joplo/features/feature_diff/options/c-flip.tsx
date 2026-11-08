import { $, callout, done, excluded, flow, highlight, layer, mark, numbered, option, set, uses } from '@joplo-app/kit';
import { FlipViewer, flipInitial } from '../../../shared/comparison/focus.tsx';

export default option({
  name: 'C · 一个大画面，旧版 / 新版来回切换',
  idea: '默认只放一个大画面，停在当前变化；用切换或空格键在旧版和新版之间来回切，变化的位置会像翻页动画一样“跳”出来；需要时再切回并排',
  focus: '画面太小看不清：不拆半宽，用同一个大画面来回切换找差异',
  tradeoffs: ['画面始终最大，字号和真实页面接近', '来回切换比左右扫视更容易发现位置相同的差异', '同一时间只看到一版，要靠切换和记忆对照'],
  layers: { viewer: layer('功能差异查看器', <FlipViewer />, { icon: 'window' }) },
  state: { ui: flipInitial() },
  coverage: Object.fromEntries(['rationale', 'insertion', 'added', 'removed', 'uncertain', 'initial', 'drift', 'stale'].map((k) => [k, excluded('本方案只改查看器布局；匹配、对齐与发布行为沿用 A')])),
  scenarios: {
    spot: flow('来回切换，差异自己跳出来', { cases: ['spot', 'legible'], start: '/comparison', expected: '同一画面、同一步，切换后能直接指出预览新增、状态改变' })
      .system('上面是这处变化，下面切换版本', numbered('fc_strip', 'fc_side'), uses('canvas_first'))
      .select('fc_side', 'old', '切到旧版，画面不变大小', set($.ui.side, 'old'), mark('fc_old_lg_status', { kind: 'box', note: '旧：邀请已发出' }))
      .press('空格', '按空格切回新版', set($.ui.side, 'new'), mark('fc_new_lg_status', { kind: 'box', note: '新：正在发送' }))
      .system('同一位置多出来的，就是新增的预览', highlight('fc_new_lg_preview'), callout('fc_delta', '变化卡写出前后值'), uses('result_values'))
      .system('不用左右来回扫', done('在一个大画面里找到了这一步的两处差异')),
    side_by_side: flow('并排时，点一侧直接放大', { cases: ['zoom'], start: '/comparison', expected: '可以切到并排；点任一侧的标题栏，就只看那一版的大画面' })
      .select('fc_layout', 'split', '切到并排，两版同时出现', set($.ui.layout, 'split'))
      .system('代价：每版只剩半宽', callout('fc_split', '适合看整体结构'))
      .click('fc_zoom_old', '像看多路直播：点旧版，只看旧版', set($.ui.layout, 'single'), set($.ui.side, 'old'), uses('layout_choice'))
      .press('空格', '放大后照样用空格切到新版', set($.ui.side, 'new'), done('并排看整体，点一下放大看细节')),
  },
});
