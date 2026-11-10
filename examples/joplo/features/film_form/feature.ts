import { feature, rule } from '@joplo-app/kit';

/** D102 设计记录：作品、切片与能力；选定左栏章节清单；D103 同步统一作品入口与内部容器。 */
export default feature({
  order: 20,
  pick: 'a-chapters',
  name: '独立作品：像做视频一样创作',
  goal: '写一支影片只写作品、章节、步骤；看板、检查和发布站都按影片来呈现，功能演示保持原样',
  roles: ['让 Agent 做讲解片、产品片的作者', '在看板里审片的人', '发布站上的观众'],
  cases: {
    write: { title: '作者写一支影片', dimension: 'main', priority: 'high', expected: '一个文件，只有作品、章节、步骤；不出现功能、方案、情况和占位页' },
    board: { title: '在看板里审片', dimension: 'main', priority: 'high', expected: '看到每一章的时长和总时长；没有方案、情况和覆盖缺口' },
    check: { title: '检查只说和影片有关的', dimension: 'main', priority: 'high', expected: '不再提示“只有顺利路径”；写错章节时错误指到那一行并给出可用的键' },
    mixed: { title: '一个项目里既有影片也有功能演示', dimension: 'consistency', priority: 'high', expected: '看板按打开的是哪一种换左栏；功能演示的呈现不变' },
    recut: { title: '重做一件作品，保留旧稿', dimension: 'lifecycle', priority: 'medium', expected: '两件作品都能在看板打开；发布只带没有标草稿的作品' },
    publish: { title: '观众看到什么', dimension: 'main', priority: 'medium', expected: '卡片写章节数和时长；电脑和手机都叫“章节”' },
    empty: { title: '只写了标题，还没有章节', dimension: 'input', priority: 'low', expected: '看板和 check 告诉作者下一步写什么，不报错' },
  },
  rules: {
    form: rule('核心是作品 → 切片 → 步骤；功能评审、章节接续与草稿是可组合的能力。独立作品在 works/ 写 work() 和 chapter()，创作与 IR 都按这个模型呈现；功能是作品上的评审层，独立作品不合成假的功能或隐藏作品。', { origin: 'user', status: 'confirmed', cases: ['write', 'board'] }),
    no_option: rule('作者创作独立作品时没有“方案”这一层；作品下面直接是切片，可以用 chapter() 或 flow()，不混用。功能下面的方案同样在 features/<f>/works/<key>.tsx 用 work({ title, summary })，也可叠加章节接续能力；两种位置共用编译路径。', { origin: 'user', status: 'confirmed', cases: ['write', 'board', 'recut'] }),
    continue_default: rule("章节按声明顺序播放，每一章默认接着上一章结尾的画面；from: null 从干净的画面开始，from: '章节键' 接指定的章节。", { cases: ['write', 'board'] }),
    no_route: rule('影片不需要 routes/ 下的页面：画面写在 stage（一个画面）或 layers（多个视角）里。', { cases: ['write'] }),
    numbering: rule('章节编号由看板和发布站按顺序自动加，作者不在标题里手写 00、01。', { cases: ['write', 'board', 'publish'] }),
    checks: rule('影片不做情况覆盖与“只有顺利路径”检查；章节过长、配乐空档、接续写错这些和影片有关的检查保留，并改用“章节”来说。', { cases: ['check', 'empty'] }),
    mixed_project: rule('一个项目可以同时有影片和功能演示；看板、outline 按条目与能力呈现，功能演示的左栏、检查和发布规则不变。', { cases: ['mixed'] }),
    draft: rule('一支影片只有一个版本。重做时新建另一支影片，把旧的写上 draft: true；草稿只在本地看板里，不进发布与分享。', { cases: ['recut'] }),
    wording: rule('发布站在电脑和手机上都把影片的段落叫“章节”，卡片写章节数和总时长；独立切片叫“场景”，功能的方案用 chapter() 时同样叫“章节”。', { cases: ['publish'] }),
  },
  // 原型中的旧稿、示例迁移、审片入口与模板问题已在 D102 修订中落定。
  questions: {},
});
