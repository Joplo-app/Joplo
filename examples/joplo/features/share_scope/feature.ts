import { feature, role, rule } from '@joplo-app/kit';

export default feature({
  order: 11,
  name: '按场景保密分享',
  pick: 'a-prune',
  goal: '作者只把一个场景（或一个功能）分享给外部的人，对方看不到、也从源码里找不到项目里的其他功能',
  roles: {
    lin: role('林舟', { desc: '「团队空间」的作者，账单的新定价还没公布' }),
    zhou: role('小周', { desc: '外部合作方，只该看到邀请成员' }),
  },
  cases: {
    deep_link: { title: '现在：发场景深链接', dimension: 'permission', priority: 'high', expected: '（现状）链接停在这个场景，但对方能切到其他功能，源码里也能搜到账单的新定价' },
    scenario: { title: '只分享一个场景', dimension: 'main', priority: 'high', expected: 'joplo share --private --no-review --scenario 后，分享里只有这个场景；打开直接进演示，没有功能切换，源码里搜不到其他功能' },
    feature: { title: '只分享一个功能', dimension: 'main', expected: 'joplo share --private --no-review --feature 后，分享里是这个功能选定方案的全部场景，其他功能都不在' },
    borrowed: { title: '场景用到了别的功能堆进来的元素', dimension: 'consistency', priority: 'high', expected: '只带上被引用的那个元素，不带那个功能的名字、场景和其他元素；终端写明带了什么，作者自己判断' },
    reshare: { title: '改了之后重新分享', dimension: 'lifecycle', expected: '同一个范围更新原来的链接，主链接和评审链接不变' },
    bad_id: { title: '场景 id 写错', dimension: 'input', expected: '报错并列出可选的场景 id，什么都不上传' },
  },
  rules: {
    prune_build: rule('保密靠构建时裁剪 IR，不靠隐藏导航：分享的所有文件（内联 IR 的 index.html、voice/、preview.png）和评审清单里，都不出现范围外的功能、方案、场景的 id、名字、目标、角色和步骤文字', { origin: 'user', status: 'confirmed', cases: ['scenario', 'feature', 'deep_link'], elements: ['s_nohit', 's_srcnone', 'in_features'] }),
    deep_link_not_secret: rule('深链接 #/f/<功能>?s=<场景> 和嵌入的 scenario= 只决定从哪里开始看，观众仍然能看到整个项目，所以不算保密', { origin: 'code_observed', status: 'confirmed', cases: ['deep_link'], elements: ['t_deeplink', 's_feat', 's_hits'] }),
    keep_reachable: rule('只留范围内场景用得到的画面：起始画面、navigate 能到的画面、方案的层级画面；路径表只留这些路径；范围外的分叉去掉；音频只带范围内步骤用到的；预览图用范围内第一个场景', { origin: 'user', status: 'confirmed', cases: ['scenario', 'feature'], elements: ['in_pages', 'in_files'] }),
    borrow_referenced: rule('别的功能堆进来的元素默认去掉（when 隐藏的也算）；范围内步骤引用到它（操作目标、镜头、标注、焦点提示、trace）时，只保留那一条贡献子树，并去掉 from、addedBy 这类会暴露方案 id 的字段', { origin: 'user', status: 'confirmed', cases: ['borrowed'], elements: ['i_e_seat', 't_borrow', 's_seat'] }),
    report_borrowed: rule('share / build 的输出写明带上了哪些别的功能的元素（JSON 在 data.scope.borrowed），由作者判断能不能分享', { origin: 'user', status: 'confirmed', cases: ['borrowed'], elements: ['t_borrow'] }),
    own_link: rule('每个范围是单独的分享，不覆盖主链接和评审链接；.joplo/cloud.json 新增 scoped，范围键是排序后的场景 id；Pro 重新分享同一范围时更新原链接，--new 新建', { origin: 'user', status: 'confirmed', cases: ['reshare'], elements: ['a_cloud_after', 't_fix'] }),
    straight_in: rule('范围里只有一个功能时，打开分享页直接进演示，不经过首页；没有功能下拉', { origin: 'user', status: 'confirmed', cases: ['scenario', 'feature'], elements: ['s_scope_title', 's_side'] }),
    fail_closed: rule('场景 id 写错、功能没有选定方案、范围里一个场景也没有时报错退出，不上传任何文件', { origin: 'user', status: 'confirmed', cases: ['bad_id'], elements: ['t_bad'] }),
    borrow_warn_only: rule('借用元素只在终端提醒、照常发布，不加 --allow-borrow；范围键用场景 id，改名后再分享是新链接；作者 CSS 先不裁剪（已知边界）', { origin: 'user', status: 'confirmed', cases: ['borrowed', 'reshare'] }),
    no_cloud_change: rule('joplo-cloud 不改：分享仍然是一组文件加可选的评审清单，控制台里靠标题（项目名 · 场景名）区分', { origin: 'user', status: 'confirmed', cases: ['reshare'] }),
  },
});
