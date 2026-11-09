import { feature, role, rule } from '@joplo-app/kit';

export default feature({
  order: 16,
  name: '看板里的云端用量与 Joplo Cloud 朗读',
  goal: '创作者在本地看板里就能看到空间和朗读额度还剩多少，不用先去控制台；做朗读时直接用 Joplo Cloud 的声音，试听不花额度，额度用完演示照常播放',
  roles: {
    lin: role('林舟', { desc: '免费账号的创作者，在本地看板里做讲解' }),
    jie: role('阿杰', { desc: 'Pro 会员，朗读用得多' }),
  },
  cases: {
    glance: { title: '在看板里看用量', dimension: 'main', priority: 'high', expected: '空间已用 / 上限、朗读还剩多少字，一眼看到；点一下去控制台的「用量」页' },
    cloud_voice: { title: '用 Joplo Cloud 朗读做旁白', dimension: 'main', priority: 'high', expected: '登录后默认就是它，不用配 Key；显示还剩多少字；音色能先试听，不扣字数' },
    exhausted: { title: '朗读额度用完了', dimension: 'lifecycle', priority: 'high', expected: '没生成的步骤改用浏览器朗读，演示照常播放；说清楚用完了，给买加油包的入口' },
    signed_out: { title: '还没登录', dimension: 'permission', expected: 'Joplo Cloud 朗读写“登录后可用”，给可复制的登录命令；浏览器朗读照常能用' },
  },
  rules: {
    both_places: rule('本地看板和 Cloud 控制台都显示空间与朗读用量；看板里是概览，详细的明细、删除分享、购买在控制台', { origin: 'user', status: 'confirmed', cases: ['glance'] }),
    official_only: rule('声音来源只有浏览器朗读、Joplo Cloud 朗读和官方的 OpenAI、ElevenLabs；不再有 AiHubMix、OpenAI 兼容和自定义接口', { origin: 'user', status: 'confirmed', cases: ['cloud_voice'], elements: ['c_v_source'] }),
    cloud_default: rule('登录后，没设过声音来源的项目默认用 Joplo Cloud 朗读', { origin: 'ai_assumption', status: 'pending', cases: ['cloud_voice'] }),
    preview_free: rule('试听用预先生成的样音，不扣字数，免费账号也能听', { origin: 'user', status: 'confirmed', cases: ['cloud_voice'], elements: ['c_v_list'] }),
    fallback_browser: rule('额度用完或云端连不上时，没有音频的步骤改用浏览器朗读并在字幕区标出，演示不中断', { origin: 'user', status: 'confirmed', cases: ['exhausted'] }),
    live_count: rule('每生成一段就更新剩余字数（来自云端的实时数字，不在本地估算）', { origin: 'ai_assumption', status: 'pending', cases: ['cloud_voice', 'exhausted'], elements: ['c_v_left'] }),
    console_link: rule('看板里的「用量 ↗」和「买加油包 ↗」都在新标签页打开控制台对应位置', { origin: 'ai_assumption', status: 'pending', cases: ['glance', 'exhausted'] }),
  },
  pick: 'a-card',
});
