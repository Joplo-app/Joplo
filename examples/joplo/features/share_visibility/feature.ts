import { feature, role, rule } from '@joplo-app/kit';
export default feature({
  order: 17,
  name: '发布前选择公开还是私密',
  goal: '每次发布都知道谁能看到作品，是否同时给评审者一条包含所有方案的私密链接；公开作品能被搜索和发现，保密范围不会意外公开',
  roles: { author: role('创作者', { desc: '在看板或通过 Agent 发布演示' }) },
  cases: {
    public: { title: '公开整个项目', dimension: 'main', priority: 'high', expected: '默认公开，明确说明作品集和搜索引擎，成功后给出作品入口' },
    review: { title: '私密并同时发评审版', dimension: 'main', priority: 'high', expected: '主分享与评审版是两条独立链接，评审版始终私密' },
    scoped: { title: '只分享保密范围', dimension: 'permission', priority: 'high', expected: '公开不可选，说明保密原因' },
    update: { title: '更新已有私密链接', dimension: 'lifecycle', expected: '默认沿用当前私密，不因为新建默认公开而改变可见性' },
  },
  rules: {
    explicit: rule('CLI 每次强制选择可见性和评审版，不读默认值或上次记录；非交互缺项退出 2', { origin: 'user', status: 'confirmed', cases: ['public', 'review'] }),
    discovery: rule('公开进入作品集并被搜索引擎收录；看板新建整项目默认公开，更新沿用当前可见性', { origin: 'user', status: 'confirmed', cases: ['public', 'update'] }),
    private: rule('评审版、PR 预览与按场景保密分享一律私密，评审版是独立链接', { origin: 'user', status: 'confirmed', cases: ['review', 'scoped'] }),
  },
  pick: 'a-explicit',
});
