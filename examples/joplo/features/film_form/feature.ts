import { feature, question, rule } from '@joplo-app/kit';

/**
 * 影片形态（2026-11-09 原型，待确认）：Joplo 原来只为功能演示设计（功能 → 方案 → 情况 × 场景），
 * 现在还要支持对标视频创作的内容。这里画的是提议，不是已经实现的界面。
 */
export default feature({
  order: 20,
  name: '影片形态：像做视频一样创作',
  goal: '写一支影片只写影片、章节、步骤；看板、检查和发布站都按影片来呈现，功能演示保持原样',
  roles: ['让 Agent 做讲解片、产品片的作者', '在看板里审片的人', '发布站上的观众'],
  cases: {
    write: { title: '作者写一支影片', dimension: 'main', priority: 'high', expected: '一个文件，只有影片、章节、步骤；不出现功能、方案、情况和占位页' },
    board: { title: '在看板里审片', dimension: 'main', priority: 'high', expected: '看到每一章的时长和总时长；没有方案、情况和覆盖缺口' },
    check: { title: '检查只说和影片有关的', dimension: 'main', priority: 'high', expected: '不再提示“只有顺利路径”；写错章节时错误指到那一行并给出可用的键' },
    mixed: { title: '一个项目里既有影片也有功能演示', dimension: 'consistency', priority: 'high', expected: '看板按打开的是哪一种换左栏；功能演示的呈现不变' },
    recut: { title: '重做一版，和旧版对比', dimension: 'lifecycle', priority: 'medium', expected: '两版都能在看板打开；发布只带没有标草稿的那一版' },
    publish: { title: '观众看到什么', dimension: 'main', priority: 'medium', expected: '卡片写章节数和时长；电脑和手机都叫“章节”' },
    empty: { title: '只写了标题，还没有章节', dimension: 'input', priority: 'low', expected: '看板和 check 告诉作者下一步写什么，不报错' },
  },
  rules: {
    form: rule('影片是一种形态：作者写 film() 和 chapter()，编译成现有的 IR 再加一个 kind 标记；引擎的步骤、状态、镜头、朗读、配乐、发布都不改。功能演示（feature / option / case）保持原样。', { origin: 'user', status: 'confirmed', cases: ['write', 'board'] }),
    no_option: rule('影片没有“方案”这一层：影片下面直接是切片（章节），和功能演示里的场景是同一种东西——可以单独打开、单独分享、单独导出，只是不再挂在某个方案下面。', { origin: 'user', status: 'confirmed', cases: ['write', 'board', 'recut'] }),
    continue_default: rule("章节按声明顺序播放，每一章默认接着上一章结尾的画面；from: null 从干净的画面开始，from: '章节键' 接指定的章节。", { cases: ['write', 'board'] }),
    no_route: rule('影片不需要 routes/ 下的页面：画面写在 stage（一个画面）或 layers（多个视角）里。', { cases: ['write'] }),
    numbering: rule('章节编号由看板和发布站按顺序自动加，作者不在标题里手写 00、01。', { cases: ['write', 'board', 'publish'] }),
    checks: rule('影片不做情况覆盖与“只有顺利路径”检查；章节过长、配乐空档、接续写错这些和影片有关的检查保留，并改用“章节”来说。', { cases: ['check', 'empty'] }),
    mixed_project: rule('一个项目可以同时有影片和功能演示；看板、outline 按形态分组，功能演示的左栏、检查和发布规则不变。', { cases: ['mixed'] }),
    draft: rule('一支影片只有一个版本。重做时新建另一支影片，把旧的写上 draft: true；草稿只在本地看板里，不进发布与分享。', { cases: ['recut'] }),
    wording: rule('发布站在电脑和手机上都把影片的段落叫“章节”，卡片写章节数和总时长；功能演示仍叫“场景”。', { cases: ['publish'] }),
  },
  questions: {
    cuts: question('影片没有方案这一层（已定）。那么重做一版时，旧版怎么留：原型里画的是“另一支影片 + draft: true（不发布）”；另一种是不提供 draft，旧版只留在 Git 历史里。', { severity: 'major', refs: ['recut'] }),
    migrate: question('现有的内容示例（llm-explainer、midterms-2026、manus-voice、button-40-years、code-change、media-upload）是否全部迁到 film()？midterms-2026 现在用两个方案对比两版，迁移后旧版会变成草稿影片。', { severity: 'major', refs: ['recut', 'write'] }),
    review_tools: question('看板里要不要直接放分镜和胶片条的入口？现在它们只有命令行（render --sheet / --film），原型里只放了“复制命令”。', { severity: 'minor', refs: ['board'] }),
    starter: question('joplo init 要不要让作者在“功能演示”和“影片”之间选一个起步模板？', { severity: 'minor', refs: ['write'] }),
  },
});
