import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  name: '首页：项目与功能',
  goal: '一个本地看板进程记住并列出打开过的所有项目；选中项目后看到它的功能，点「查看」进入演示',
  roles: ['作者（驱动 Agent 的用户）', '观众（打开发布站的人）'],
  cases: {
    recent: { title: '打开过多个项目，在首页切换', dimension: 'main', priority: 'high', expected: '左栏是项目，右侧是该项目的功能、方案数、缺口数和「查看」' },
    first_open: { title: '第一次运行，还没有记住任何项目', dimension: 'main', priority: 'high', expected: '空状态直接给出三条开始命令' },
    second_dev: { title: '看板已在运行时，又在另一个目录运行 joplo dev', dimension: 'conflict', priority: 'high', expected: '不启动第二个进程，把项目加入正在运行的看板并打开' },
    stale: { title: '记住的项目目录已被移动或删除', dimension: 'lifecycle', expected: '标为“找不到目录”，可以移除，不影响其他项目' },
    compile_error: { title: '某个项目编译出错', dimension: 'consistency', expected: '项目列表上显示错误数；进入后看到 文件:行 和修复提示' },
    publish_home: { title: '观众打开发布站首页', dimension: 'consistency', priority: 'high', expected: '只有一个项目，左栏列功能；不显示缺口、错误和本机路径' },
  },
  rules: {
    one_process: rule('同一台机器只运行一个看板进程；再次运行 joplo dev 时把项目注册到已运行的进程并打开浏览器，然后退出', { origin: 'user', status: 'confirmed', cases: ['second_dev'] }),
    remember: rule('打开过的项目记在 ~/.joplo/projects.json（路径 + 名称 + 最后打开时间），按最近打开排序', { origin: 'user', status: 'confirmed', cases: ['recent'] }),
    no_local_info_on_site: rule('发布站不出现项目列表、缺口、错误和本机路径', { origin: 'user', status: 'confirmed', cases: ['publish_home'] }),
  },
  questions: {
    remove_scope: question('「从列表移除」只删记录，还是也提供“在 Finder 中显示”？', { severity: 'minor', refs: ['stale'] }),
  },
  pick: 'a-recent',
});
