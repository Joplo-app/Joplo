import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  name: '演示页',
  goal: '打开一个功能后，画面占主要位置：顶栏只有面包屑，左栏放方案、场景和缺口，画面下方是播放控制和步骤条',
  roles: ['作者', '观众'],
  cases: {
    play: { title: '播放、上一步、下一步', dimension: 'main', priority: 'high', expected: '步骤条高亮当前步，下方显示这一步的说明和下一步' },
    switch: { title: '切换方案和场景', dimension: 'main', priority: 'high', expected: '在左栏点一下就换；面包屑同步，回到第 0 步' },
    review: { title: '查看缺口、规则和源码位置', dimension: 'main', priority: 'high', expected: '左栏能看到缺口；检查元素时右侧弹出抽屉，显示规则和 文件:行' },
    export_image: { title: '导出当前步骤的图片', dimension: 'main' },
    export_video: { title: '导出整个场景的视频', dimension: 'async', priority: 'high', expected: '能看到进度；完成后给出文件；失败时说明原因并可重试' },
    publish_play: { title: '观众在发布站上看同一页', dimension: 'consistency', priority: 'high', expected: '布局相同，但没有缺口、规则、源码位置和本机才有的操作' },
  },
  rules: {
    header_minimal: rule('顶栏只放面包屑（项目 / 功能 / 方案 / 场景），其余操作收进画面下方的「…」菜单', { origin: 'user', status: 'confirmed', cases: ['play', 'switch'] }),
    same_layout: rule('本地看板和发布站用同一套布局，发布站只是去掉创作信息', { origin: 'user', status: 'confirmed', cases: ['publish_play'] }),
    review_in_drawer: rule('不再区分演示 / 审阅模式：缺口放在左栏，检查元素时从右侧弹出抽屉', { origin: 'user', status: 'confirmed', cases: ['review'] }),
    video_local: rule('视频由本机 Playwright 录制（与 joplo render 共用），没有 Chromium 时给出安装命令', { cases: ['export_video'] }),
  },
  questions: {
    inspect_gesture: question('不再有审阅模式后，“操作原型”和“检查元素”怎么区分？原型里暂定：单击 = 按场景操作，按住 ⌥ 单击 = 检查', { severity: 'blocker', refs: ['review'] }),
    site_export: question('发布站上要不要提供导出？图片可以在浏览器里生成；视频需要本机 Playwright，发布站上做不了', { severity: 'major', refs: ['export_video', 'publish_play'] }),
  },
  pick: 'b-by-case',
});
