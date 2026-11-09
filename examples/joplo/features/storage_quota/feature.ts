import { feature, role, rule } from '@joplo-app/kit';

export default feature({
  order: 15,
  name: '按容量发布：免费 100 MB，链接不过期',
  goal: '创作者发布前就知道自己用了多少空间、快满时提前知道，满了也知道怎么腾地方或升级；免费分享不再 7 天过期，已经发出去的链接永远不会因为容量被下线',
  roles: {
    lin: role('林舟', { desc: '免费账号的创作者，常让 Agent 帮忙发布' }),
    jie: role('阿杰', { desc: 'Pro 会员，发布很多带朗读的讲解' }),
  },
  cases: {
    normal: { title: '发布一个新分享', dimension: 'main', priority: 'high', expected: '发布前看到已用多少；发完显示“永久链接”和这次占了多少' },
    near: { title: '用到八成', dimension: 'lifecycle', priority: 'high', expected: '提前提醒快满了，给出“管理分享”和“升级”两个入口；仍然可以发布' },
    over: { title: '这次发布会超出', dimension: 'conflict', priority: 'high', expected: '说清楚这次要多大、还剩多少；不发布，已有链接不受影响；给出腾空间和升级的入口' },
    update: { title: '更新同一个链接', dimension: 'main', expected: '只按新旧版本的差额算，更新不会把容量算两遍' },
    pro: { title: 'Pro 的容量', dimension: 'permission', expected: '5 GB；不够时可以买扩容包' },
    agent: { title: 'Agent 用 CLI 发布', dimension: 'main', priority: 'high', expected: '输出里有用量；超出时用单独的错误码，写明数字和下一步，Agent 能原样转告用户' },
  },
  rules: {
    raw_size: rule('用量 = 账号所有在线分享当前版本的文件原始大小之和，不按内容去重；历史版本不计；PR 预览、评审版在有效期内计入', { origin: 'user', status: 'confirmed', cases: ['normal', 'update'] }),
    quotas: rule('免费 100 MB，Pro 5 GB；扩容包每份 +20 GB、$2/月，可以叠加', { origin: 'user', status: 'confirmed', cases: ['pro', 'near'] }),
    permanent: rule('免费分享不再过期；已经发出去的链接永远不会因为容量被下线，超出只拦新发布和更新', { origin: 'user', status: 'confirmed', cases: ['normal', 'over'] }),
    warn_80: rule('用到 80% 时提醒，同时给“管理我的分享”和“升级”两个入口', { origin: 'user', status: 'confirmed', cases: ['near'], elements: ['q_warn'] }),
    over_after_build: rule('这次要多大只有构建完才知道：构建完、上传前由 Cloud 判断，超出就不上传，报出这次大小、剩余空间和差多少', { origin: 'ai_assumption', status: 'pending', cases: ['over', 'agent'], elements: ['q_over'] }),
    update_delta: rule('更新同一个链接时，只按新版本减去旧版本的差额判断是否超出', { origin: 'ai_assumption', status: 'pending', cases: ['update'] }),
    free_update_same: rule('免费账号也能更新同一个链接（以前每次都新建）：链接不再过期后，每次新建既浪费容量，也让作品集里堆满重复作品；版本历史仍是 Pro 功能', { origin: 'ai_assumption', status: 'pending', cases: ['update'] }),
    agent_code: rule('CLI 超出容量时以单独的错误码 QUOTA_EXCEEDED 结束，JSON 里带已用、上限、这次大小和两个链接；文本输出说清“已有链接不受影响”', { origin: 'ai_assumption', status: 'pending', cases: ['agent'], elements: ['t_over'] }),
  },
  pick: 'b-quiet',
});
