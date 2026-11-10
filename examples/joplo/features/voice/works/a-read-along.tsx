import { withProductionUpdate } from '../../../shared/production/update.tsx';
import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, callout, done, flow, highlight, notApplicable, work, set, shot, spotlight, uses, type Bind } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';

import { BROWSER_VOICE, PROVIDER_VOICE, initialUi, inner, layers, speak } from '../../../shared/voice/voice.tsx';

const ui = $.ui as unknown as Record<string, Bind>;

/** 声音已经打开（浏览器朗读），停在被演示原型的第 1 步。 */
const atStep1 = () => ({ ...initialUi(), voice: 'textwait', voiceIcon: '🔊', voicePct: 100, dlg: true, caption: '管理员打开「邀请成员」', speaker: '林舟', stepText: '第 1 / 3 步', playLabel: '⏸ 暂停' });

/** 已选中「公司网关」profile、浮层打开，还没生成。 */
const providerReady = () => ({ ...initialUi(), engine: 'provider', voiceOpen: true, voiceIcon: '🔊', voice: 'ready', genStatus: '3 段待生成' });
const profileInputs = { b_v_profile: '公司网关' };

export default withProductionUpdate(withDesignRecord(work({
  title: 'A · 边看边读',
  summary: '打开声音就用浏览器朗读，不用配置；想要所有人听到同一个声音时，再接外部供应商提前生成音频',
  focus: '声音参与决定每一步停多久：画面停够了、声音没读完，也要等声音读完',
  tradeoffs: ['零配置，看板和发布站马上能用', '浏览器的声音每台电脑不一样', '外部音色要先生成，生成失败的步骤退回浏览器朗读'],

  layers: layers(),
  state: { ui: initialUi() },

  coverage: {
    video: notApplicable('第一期只做网页上的朗读；视频带声音放第二期（Playwright 录屏不录声音，要按时间轴另外合成音频）'),
  },

  scenarios: {
    read_along: flow('打开声音，边看边读', { cases: ['browser'], start: '/voice', expected: '不用配置，自动播放时每一步一边显示一边朗读，声音没读完不切走' })
      .card('评审会上，大家边看边听', { sub: '林舟要放“邀请成员”的演示，不想一边播一边念字幕' })
      .click('b_voice', '林舟打开声音设置', set(ui.voiceOpen, true))
      .toggle('b_v_on', true, '打开朗读，默认用浏览器的声音', set(ui.voiceIcon, '🔊'), set(ui.voice, 'ready'), callout('b_v_on', '不用配置，打开就能读'), uses('read_along_default'))
      .click('b_voice', '收起设置，回到画面', set(ui.voiceOpen, false))
      .click('b_play', '点播放：第 1 步边显示边朗读', ...inner.s1(), ...speak(45, BROWSER_VOICE), set(ui.playLabel, '⏸ 暂停'), shot('b_root'), spotlight('b_sub'))
      .system('第 1 步读完', '声音先读完，画面照常停够', set(ui.voice, 'textwait'), set(ui.voicePct, 100))
      .system('第 2 步', '旁白比字幕长，一起开始', ...inner.s2(), ...speak(40))
      .system('字幕时间到了', '画面停够了，声音还没读完', set(ui.voice, 'waiting'), set(ui.voicePct, 75), spotlight('b_sub'), callout('b_vwait', '声音读完才走'), uses('wait_voice'))
      .system('声音读完', '读完再换一口气', set(ui.voice, 'breath'), set(ui.voicePct, 100))
      .system('第 3 步', '接着读第 3 步', ...inner.s3(), ...speak(60), shot('b_root'))
      .system('播完', '三步都读完了', set(ui.voice, 'textwait'), set(ui.voicePct, 100), set(ui.playLabel, '▶ 重播'),
        done('声音和画面一起播完，没有一句被截断')),

    voice_longer: flow('旁白比字幕长', { cases: ['voice_longer'], start: '/voice', state: { ui: atStep1() }, expected: '画面停留结束后继续等声音，换气后再走；暂停、手动下一步都听人的' })
      .card('旁白比字幕长的时候', { sub: '作者用 narrate() 给第 2 步写了更完整的旁白' })
      .system('narrate() 写法', '字幕给眼睛，旁白给耳朵', shot('a_flow'), uses('say_separate'))
      .system('第 2 步开始', '字幕和旁白同时开始', ...inner.s2(), ...speak(20), set(ui.textPct, 35), set(ui.paceState, 'reading'), shot('pace'))
      .system('画面停留结束', '3 秒到了，声音才读到一半多', set(ui.textPct, 100), set(ui.voicePct, 58), set(ui.paceState, 'text_done'), highlight('p_text'))
      .system('等声音', '不切走，接着等声音', set(ui.paceState, 'waiting'), set(ui.voice, 'waiting'), set(ui.voicePct, 72), highlight('p_voice'), uses('wait_voice'))
      .click('b_play', '林舟按暂停：声音一起停', set(ui.voice, 'paused'), set(ui.playLabel, '▶ 继续'), uses('human_first'))
      .click('b_play', '继续：从停下的地方接着读', set(ui.voice, 'waiting'), set(ui.voicePct, 90), set(ui.playLabel, '⏸ 暂停'))
      .system('读完再换气', '读完，再停 0.45 秒', set(ui.voicePct, 100), set(ui.voice, 'breath'), set(ui.paceState, 'breath'), set(ui.dwellText, '5.2 + 0.45 ≈ 5.7 秒（不是 3 秒）'), shot('pace'), highlight('p_sum'))
      .system('第 3 步', '第 3 步开始朗读', ...inner.s3(), ...speak(25), set(ui.paceState, 'next'), shot('b_root'), spotlight('b_sub'))
      .click('b_next', '手动下一步：当前声音立刻停', set(ui.voice, 'textwait'), set(ui.voicePct, 100), set(ui.playLabel, '▶ 重播'), set(ui.stepText, '已播完'), callout('b_next', '人的操作优先'),
        done('声音读完才走；暂停和手动下一步都听人的')),

    profile: flow('在看板里接入公司的语音网关', { cases: ['profile'], start: '/voice', state: { ui: { ...initialUi(), voiceIcon: '🔊', voice: 'ready' } }, expected: '在看板里新建 profile：自定义 Base URL，按测试提示配好返回格式；保存后直接播放、边放边生成，Key 只在本机' })
      .card('接入公司自己的语音网关', { sub: '接口兼容 OpenAI，但地址不同，返回的是 JSON' })
      .click('b_voice', '林舟打开声音设置', set(ui.voiceOpen, true))
      .click('b_v_manage', '打开「管理供应商」', set(ui.voiceOpen, false), set(ui.profilesOpen, true))
      .click('m_new', '新建一个供应商 profile', set(ui.editing, true), uses('profiles_local'))
      .type('m_name', '公司网关', '起个名字')
      .type('m_url', 'https://llm.acme.internal/v1', '填自己的 Base URL', callout('m_url', '任何 OpenAI 兼容的地址'), uses('custom_endpoint'))
      .type('m_key', 'sk-acme-2f9c7d1e', 'Key 只存在本机', uses('key_local'))
      .click('m_test', '测试：返回的是 JSON，不是音频', set(ui.testState, 'bad'), highlight('m_bad'), uses('test_before_save'))
      .select('m_format', 'JSON 里的 base64', '按提示改返回内容', set(ui.jsonPath, true), set(ui.testState, 'none'))
      .type('m_path', 'data.audio', '填音频字段的路径')
      .click('m_test', '再测一次：读出来了', set(ui.testState, 'ok'), highlight('m_ok'))
      .click('m_save', '保存，并选中这个 profile', set(ui.profilesOpen, false), set(ui.voiceOpen, true), set(ui.engine, 'provider'), set(ui.genStatus, '3 段待生成'), set($.inputs.b_v_profile, '公司网关'), shot('b_root'))
      .click('b_play', '直接播放，不用先生成', set(ui.voiceOpen, false), ...inner.s1(), ...speak(30, '公司网关 · marin'), set(ui.playLabel, '⏸ 暂停'), shot('b_root'), spotlight('b_sub'))
      .system('边放边生成', '播到这一步才生成这一段', shot('arch'), trace('key', 'gen', 'prov'))
      .system('顺手预取', '后面几步提前生成好', trace('prov', 'files'), set(ui.genStatus, '3/3 已生成 · 共 11 秒'), set(ui.genButton, '重新生成'),
        done('接好就能播，声音边放边生成')),

    gen_fail: flow('生成失败', { cases: ['gen_fail'], start: '/voice', state: { ui: providerReady(), inputs: profileInputs }, outcome: 'success', mock: '模拟供应商限流', expected: '失败的那一步改用浏览器朗读，不静音也不卡住；check 也提示重试' })
      .card('供应商出错，演示照样能放', { sub: '林舟生成声音时，供应商限流了' })
      .click('b_v_gen', '生成 3 段声音', set(ui.generating, true), set(ui.genPct, 30), set(ui.genStatus, '正在生成 1/3'))
      .system('第 2 段失败', '第 2 段被限流，其余照常', trace.fail('gen', 'prov'), shot('arch'))
      .system('生成结束', '2 段成功，第 2 段可以重试', set(ui.generating, false), set(ui.genPct, 67), set(ui.genStatus, '2/3 已生成 · 第 2 段失败：限流（429）'), set(ui.genButton, '重试失败的 1 段'), shot('b_v_status'))
      .click('b_play', '先播：第 1 步用新音色', set(ui.voiceOpen, false), ...inner.s1(), ...speak(50, PROVIDER_VOICE), set(ui.playLabel, '⏸ 暂停'))
      .system('第 2 步', '没生成的一步改用浏览器读', ...inner.s2(), set(ui.voice, 'fallback'), set(ui.voicePct, 50), shot('b_root'), spotlight('b_sub'), trace('player', 'narr', 'web'), callout('b_vfallback', '不静音，也不卡住', { side: 'left' }), uses('fallback_browser'))
      .type('t_in', 'npx joplo check', 'Agent 跑 check 也能看到')
      .press('Enter', 'check 指出哪一步、怎么重试', set($.inputs.t_in, ''), set(ui.tCheck, true), shot('t_term'))
      .click('b_voice', '回到看板打开声音设置', set(ui.voiceOpen, true))
      .click('b_v_gen', '重试失败的 1 段', set(ui.genPct, 100), set(ui.genStatus, '3/3 已生成 · 共 11 秒'), set(ui.genButton, '重新生成'), trace('gen', 'prov'),
        done('重试后 3 段都齐了')),

    share: flow('分享时带上声音', { cases: ['share'], start: '/voice', state: { ui: { ...providerReady(), voiceOpen: false, voice: 'off', voiceIcon: '🔇', genStatus: '2/3 已生成 · 第 2 段过期', siteHint: true }, inputs: profileInputs }, expected: '照常 joplo share --private --no-review，生成好的声音随分享上传；观众打开声音就能听，过期的一段用观众的浏览器读' })
      .card('把带旁白的演示发给小周', { sub: '小周没来开会，林舟把演示分享给他' })
      .type('t_in', 'npx joplo share --private --no-review', '林舟像平时一样分享')
      .press('Enter', '声音跟着一起打包', set($.inputs.t_in, ''), set(ui.tShare, true), shot('t_term'), uses('share_bundle'))
      .system('过期的一段', '过期的那段不卡分享，只提醒', highlight('t_stale'), uses('fallback_browser'))
      .system('上传完成', '只传新文件，Key 不上传', set(ui.tShared, true), highlight('t_upload'))
      .system('音频进了分享', '音频和页面放在一起', trace('files', 'r2'), shot('arch'))
      .card('现在是小周', { role: 'zhou', sub: '他打开林舟发来的链接' })
      .click('s_play', '小周点播放：先只有字幕', ...inner.s1(), set(ui.playLabel, '⏸ 暂停'), callout('s_voice', '有旁白，点这里开声音'))
      .click('s_voice', '打开声音：读分享里的音频', set(ui.voiceIcon, '🔊'), set(ui.siteHint, false), ...speak(50, '作者生成的声音'))
      .system('第 2 步', '过期的这段用小周的浏览器读', ...inner.s2(), set(ui.voice, 'fallback'), set(ui.voicePct, 40), shot('s_root'), spotlight('s_sub'))
      .system('第 3 步', '读完第 3 步，播放结束', ...inner.s3(), ...speak(100, '作者生成的声音'), set(ui.playLabel, '▶ 重播'),
        done('小周打开链接就能听，不需要 Key')),
  },
}), designRecords.voice), 'voice');
