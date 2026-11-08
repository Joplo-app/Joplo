import { feature, role, rule } from '@joplo-app/kit';

export default feature({
  order: 14,
  name: '作者内容多语言',
  pick: 'a-locales',
  goal: '作者用一种语言写原型，让 Agent 补上其他语言的译文和旁白；观众打开同一个分享链接，就看到、听到自己语言的版本',
  roles: {
    lin: role('林舟', { desc: '「团队邀请」的作者，用中文写原型，要给海外客户演示' }),
    yuki: role('佐藤由纪', { desc: '日本客户，浏览器语言是日语' }),
    lucas: role('Lucas', { desc: '巴西的合作方，浏览器语言是葡萄牙语，项目里没有葡萄牙语' }),
  },
  cases: {
    add_locale: { title: '给项目加一种语言', dimension: 'main', priority: 'high', expected: 'Agent 运行 joplo i18n add ja，按清单填好译文，check 通过；看板切到日本語，原型、字幕和旁白都是日语，旁白自动用日语音色' },
    viewer_auto: { title: '观众打开链接，自动是自己的语言', dimension: 'main', priority: 'high', expected: '照常 joplo share --private --no-review；日语浏览器打开同一个链接，界面、内容、旁白都是日语，不用选' },
    fallback: { title: '观众的语言项目里没有', dimension: 'consistency', priority: 'high', expected: '界面用观众的语言（葡萄牙语），内容退回默认语言（中文）并说明；语言菜单列出全部语言，有内容的打 ✓' },
    stale: { title: '改了原文，译文没跟上', dimension: 'lifecycle', priority: 'high', expected: 'check 报出过期的译文并给出最接近的旧条目；看板的语言菜单显示过期条数；Agent 更新后 check 通过；分享照常，只提醒' },
    cloud_cache: { title: '换一台电脑重新发布', dimension: 'consistency', priority: 'high', expected: '这台电脑没配语音供应商，也没有本地音频：重新发布同一个分享时，分享里已有的各语言音频直接沿用，一段都不用重新生成或上传' },
    no_audio: { title: '某种语言还没有生成声音', dimension: 'async', expected: '这种语言用观众的浏览器朗读；观众关掉声音就完全静音' },
  },
  rules: {
    source_default: rule('源文件照常用默认语言写；译文放在项目里的 locales/<语言>.json，不在源码里写 t()，也不内联多语言对象', { origin: 'user', status: 'confirmed', cases: ['add_locale'], elements: ['a_json'] }),
    source_key: rule('原文作为 key：locales/ja.json 写成「原文 → 译文」，相同的句子只翻一次；同一句话要不同译法时加上下文标注', { origin: 'user', status: 'confirmed', cases: ['add_locale', 'stale'], elements: ['a_json'] }),
    config_locales: rule('config 声明内容语言和默认语言；不写时项目只有一种语言，行为与现在完全一样', { origin: 'user', status: 'confirmed', cases: ['add_locale'], elements: ['a_config'] }),
    agent_translates: rule('初稿由当前的 Agent 翻：joplo i18n add 生成待翻译清单，Agent 填写，check 检查是否填完；不新增翻译供应商，看板没有一键翻译', { origin: 'user', status: 'confirmed', cases: ['add_locale'], elements: ['t_add', 't_fill'] }),
    ui_follows_viewer: rule('界面跟随观众的语言（D57）；内容在项目声明的语言里匹配，匹配不到就退回，可能出现葡萄牙语界面配中文内容', { origin: 'user', status: 'confirmed', cases: ['viewer_auto', 'fallback'], elements: ['s_lang', 's_fallback'] }),
    viewer_order: rule('观众语言的来源：链接 ?lang= > 观众手动选择 > 浏览器语言 > 默认语言；嵌入同样支持 lang=', { cases: ['viewer_auto', 'fallback'], elements: ['t_links', 's_url'] }),
    check_stale: rule('原文改动后旧译文算过期：check 报 I18N_STALE，给出最接近的旧条目；没人用的条目也报出来；过期不阻止分享，那几句显示原文', { origin: 'user', status: 'confirmed', cases: ['stale'], elements: ['t_stale', 'b_m_ja'] }),
    voice_per_locale: rule('每种内容语言默认都有旁白，自动选同语言母语口音的预设音色，作者可以按语言覆盖；音频按「语言 + 文字 + 音色 + profile」缓存', { origin: 'user', status: 'confirmed', cases: ['add_locale', 'viewer_auto'], elements: ['b_vstate', 'a_config'] }),
    cloud_cache: rule('Cloud 像 YouTube，只存分享出去的作品，不另设缓存：音频随分享发布后才在云上；重新发布同一个分享时，缓存键相同的音频直接沿用。没分享过的音频只在本机，由作者自己管理（要不要进 Git 自己定）', { origin: 'user', status: 'confirmed', cases: ['cloud_cache'], elements: ['t_cache', 'share_audio'] }),
    browser_fallback: rule('没有生成音频的语言用观众的浏览器朗读；观众关掉声音就静音', { origin: 'user', status: 'confirmed', cases: ['no_audio'], elements: ['s_vstate', 's_voice'] }),
    fallback_default: rule('观众的语言不在项目里时，内容退回默认语言（config 里的第一个），不按英文优先', { origin: 'user', status: 'confirmed', cases: ['fallback'], elements: ['s_fallback'] }),
    menu_all: rule('观众的语言菜单列出全部 10 种界面语言，有作者内容的打 ✓', { origin: 'user', status: 'confirmed', cases: ['fallback'], elements: ['s_lang', 's_m_has'] }),
    reuse_index: rule('分享清单里记「缓存键 → 音频哈希」，重新发布时据此沿用分享里已有的音频', { origin: 'user', status: 'confirmed', cases: ['cloud_cache'], elements: ['t_cache'] }),
    language_only: rule('第一版只按语言区分；按国家区分内容、货币放到第二期，数字和日期按语言格式化', { origin: 'user', status: 'confirmed', cases: ['viewer_auto'] }),
  },
});
