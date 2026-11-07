import { feature, question, role, rule } from '@joplo-app/kit';

export default feature({
  name: '导演模式朗读',
  goal: '作者自动播放演示时，Joplo 把每一步读出来，观众边看边听；默认不用配置，想要统一音色时在看板里接入供应商，分享时声音一起带上',
  roles: {
    lin: role('林舟', { desc: '演示的作者，在评审会上放演示' }),
    zhou: role('小周', { desc: '在发布站看演示的观众' }),
  },
  cases: {
    browser: { title: '打开声音，边看边读', dimension: 'main', priority: 'high', expected: '不用任何配置，自动播放时每一步一边显示一边朗读' },
    voice_longer: { title: '旁白比字幕长', dimension: 'interrupt', priority: 'high', expected: '画面停留结束也不切走，等声音读完、换气 0.45 秒再进下一步；暂停时声音一起暂停；手动下一步立刻停掉当前声音' },
    profile: { title: '在看板里接入供应商（自定义 Base URL）', dimension: 'main', priority: 'high', expected: '在看板设置里新建 profile，OpenAI 兼容接口可填 Base URL、返回格式；测试通过才能保存；保存后直接播放、边放边生成，Key 只在本机' },
    gen_fail: { title: '生成失败', dimension: 'async', priority: 'high', expected: '失败的那一步改用浏览器朗读，不静音也不卡住；看板和 check 都提示重试' },
    share: { title: '分享时带上声音', dimension: 'consistency', priority: 'high', expected: '照常 joplo share，生成好的声音随分享上传；观众打开声音就能听，不需要 Key；过期的一段用观众的浏览器读' },
    video: { title: '导出带声音的视频', dimension: 'consistency', expected: '视频里有旁白，节奏和网页播放一致' },
  },
  rules: {
    wait_voice: rule('每一步的停留 = max(画面停留, 声音时长 + 0.45 秒换气)：文字放完、声音没读完时，不能切走', { origin: 'user', status: 'confirmed', cases: ['browser', 'voice_longer'], elements: ['b_vwait', 'p_flow'] }),
    read_along_default: rule('默认用浏览器朗读（边看边读），不用配置；外部供应商是音质升级', { origin: 'user', status: 'confirmed', cases: ['browser', 'profile'] }),
    say_separate: rule('字幕、旁白、台词分开存：narrate()（旁白的声音）> say()（角色的声音）> 字幕（旁白的声音）；explain 不读', { origin: 'user', status: 'confirmed', cases: ['voice_longer'], elements: ['a_flow'] }),
    key_local: rule('供应商的 Key 只存在本机（~/.joplo 或环境变量），不写进项目，不随分享上传', { origin: 'user', status: 'confirmed', cases: ['profile', 'share'], elements: ['m_key', 'key'] }),
    profiles_local: rule('供应商保存为 profile（名称、接口类型、Base URL、Key、模型、默认音色、返回内容），在本地看板设置里增删改，存在本机，所有项目共用；内置「浏览器朗读」，并预设 OpenAI、ElevenLabs、AiHubMix（填 Key 就能用）', { origin: 'user', status: 'confirmed', cases: ['profile'], elements: ['b_profiles', 'b_v_profile'] }),
    custom_endpoint: rule('OpenAI 兼容接口可自定义 Base URL；返回内容可选：音频文件、JSON 里的 base64（填字段路径）、JSON 里的音频链接；「自定义 HTTP」类型可写请求体模板', { origin: 'user', status: 'confirmed', cases: ['profile'], elements: ['m_url', 'm_format', 'm_path'] }),
    test_before_save: rule('保存前必须测试通过：试读一句，确认拿到的是能播放的音频；失败时说明收到了什么、该怎么改', { cases: ['profile'], elements: ['m_test', 'm_bad'] }),
    share_bundle: rule('joplo share（以及 build）自动带上选定方案用到的已生成音频，和页面一起按内容去重上传；分享页用 <audio> 播放同一分享里的文件，不联网请求供应商', { origin: 'user', status: 'confirmed', cases: ['share'], elements: ['t_upload', 'r2'] }),
    human_first: rule('人的操作优先：暂停时声音一起暂停；手动上一步 / 下一步、切场景时立刻停掉当前声音', { cases: ['voice_longer'], elements: ['b_play', 'b_next'] }),
    fallback_browser: rule('某一步没有生成好的音频时，改用浏览器朗读，并在字幕区标出来', { cases: ['gen_fail', 'share'], elements: ['b_vfallback', 't_stale'] }),
    web_first: rule('第一期只做网页上的朗读（看板、发布站、嵌入）；视频带声音放第二期', { origin: 'user', status: 'confirmed', cases: ['video'] }),
  },
  questions: {
    speed: question('0.5× / 1.5× 时，声音跟着变速，还是保持原速、只缩放画面停留？原型暂定声音一起变速', { severity: 'major', refs: ['voice_longer'] }),
    site_default: question('发布站点「播放」本身就是一次点击，浏览器允许出声。要不要作者写了旁白就直接出声？原型暂定默认静音、提示观众点 🔊', { severity: 'major', refs: ['share'] }),
    other_locales: question('观众切到其他语言时，自动生成的字幕（如“点击 分享”）首版只按项目语言生成音频，其他语言用浏览器朗读兜底，是否可以？', { severity: 'minor', refs: ['share'] }),
    git_cache: question('生成的音频缓存（项目 .joplo/voice/）要不要提交进 Git？提交后队友不用配 Key 也能分享；不提交则只有生成的人能带上声音。原型暂定不提交', { severity: 'major', refs: ['share'] }),
    profile_in_config: question('项目用哪个 profile 记在哪里：看板里选的记在项目本机状态（.joplo/），还是写进 joplo.config.ts 的 voice.profile 让队友沿用同名 profile？原型暂定两者都支持，config 优先', { severity: 'minor', refs: ['profile'] }),
  },
});
