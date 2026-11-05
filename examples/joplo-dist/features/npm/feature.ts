import { feature, question, rule } from '@joplo/kit';

export default feature({
  name: 'npm 包发布',
  goal: '仓库外的用户和他们的 Agent 用一条 npx 命令就能开始，不需要克隆 Joplo 仓库或链接本地包',
  roles: ['新用户', '作者的编码 Agent', 'Joplo 维护者'],
  cases: {
    first_run: { title: '新用户从零开始：init → 安装 → 打开看板', dimension: 'main', priority: 'high', expected: '三条命令内看到看板，每一步都告诉下一步做什么' },
    node_old: { title: 'Node.js 版本低于 22', dimension: 'input', priority: 'high', expected: '立刻说明要求和升级方法，不出现看不懂的堆栈' },
    version_skew: { title: 'npx 拉到的 CLI 与项目里安装的版本不一致', dimension: 'consistency', priority: 'high', expected: '使用项目内的版本，或明确提示怎样对齐' },
    no_browser: { title: '截图（render）需要浏览器，但没有安装', dimension: 'async', expected: '只有 render 受影响，并给出安装命令' },
    dir_not_empty: { title: 'init 的目标目录已有文件', dimension: 'conflict', expected: '不覆盖任何文件，说明怎么办' },
    pm_variants: { title: '用户用 pnpm、bun 或 yarn', expected: 'init 结尾打印的命令与用户的包管理器一致' },
    offline: { title: '没有网络或 npm 仓库不可用', dimension: 'async' },
    release: { title: '维护者发布新版本', dimension: 'lifecycle', expected: '所有包版本一致；发布前自动构建看板资源；带来源证明（provenance）' },
  },
  rules: {
    node_check: rule('命令入口先检查 Node 版本，低于 22 时打印要求与升级方法并退出 1，不加载其他模块', { cases: ['node_old'] }),
    prefer_local: rule('在项目目录里运行 npx joplo 时，使用项目 node_modules 中安装的版本', { cases: ['first_run', 'version_skew'] }),
    browser_optional: rule('Playwright 不是必需依赖：只有 render 需要，缺失时给出安装命令，dev/check/build 不受影响', { cases: ['no_browser'] }),
    one_command_start: rule('init 结尾打印接下来要运行的命令，从零到看板不超过三条命令', { cases: ['first_run'] }),
    never_overwrite: rule('init 不覆盖已有文件', { cases: ['dir_not_empty'] }),
  },
  questions: {
    first_version: question('首个版本用 0.1.0 并打 beta 标签，还是直接作为 latest？', { severity: 'minor', refs: ['release'] }),
    mantine_first: question('先完成 Mantine 词汇切换（D35）再发布，避免第一版的创作 API 很快作废？', { severity: 'blocker', refs: ['release'] }),
  },
  pick: 'b-scoped',
});
