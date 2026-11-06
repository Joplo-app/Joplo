import { $, done, flow, uses } from '@joplo-app/kit';

import { Cmd } from '../../shared/term.tsx';
import { run } from '../../shared/steps.ts';

/** 两个方案共用的异常：Node 过低、缺浏览器、目录非空。p 是元素 ID 前缀。 */
export const errorLines = (p: string) => [
  <Cmd
    id={`${p}_node_err`}
    when={$.ui.nodeErr}
    cmd="npx joplo@latest init my-demo"
    tone="error"
    out={'✗ Joplo 需要 Node.js 22 或更高版本，当前是 20.11.0。\n  升级：nvm install 22，或从 https://nodejs.org 下载。'}
  />,
  <Cmd
    id={`${p}_dir_err`}
    when={$.ui.dirErr}
    cmd="npx joplo@latest init my-demo"
    tone="error"
    out={'✗ my-demo/ 不是空目录（已有 3 个文件），没有写入任何内容。\n  换一个目录名，或进入它后运行 npx joplo init . --keep 只补缺失的文件。'}
  />,
  <Cmd
    id={`${p}_render_err`}
    when={$.ui.renderErr}
    cmd="npx joplo render --scenario login.a.success --out shot.png"
    tone="warn"
    out={'EXPORT_COMPONENT_MISSING  截图需要导出组件（Playwright + Chromium，约 100 MB），当前没有安装。\n  运行：npx joplo setup export（装在 ~/.joplo，不改项目）\n  写演示、dev、check、build、share 不需要它。'}
  />,
];

export const errorScenarios = () => ({
  node_old: run(
    flow('Node.js 版本过低', { cases: ['node_old'], outcome: 'failure', mock: '模拟 Node.js 20.11.0', start: '/terminal' }),
    'npx joplo@latest init my-demo',
    $.ui.nodeErr,
    '入口先检查 Node 版本，直接说明要求和升级方法',
    uses('node_check'),
  ),
  dir_not_empty: run(
    flow('目标目录已有文件', { cases: ['dir_not_empty'], outcome: 'failure', mock: '模拟 my-demo/ 已存在', start: '/terminal' }),
    'npx joplo@latest init my-demo',
    $.ui.dirErr,
    '不覆盖任何文件，告诉用户两种做法',
    uses('never_overwrite'),
  ),
  no_browser: run(
    flow('截图时没有浏览器', { cases: ['no_browser'], outcome: 'other', mock: '模拟未安装 Chromium', start: '/terminal' }),
    'npx joplo render --scenario login.a.success --out shot.png',
    $.ui.renderErr,
    '只有 render 需要浏览器，给出安装命令',
    uses('browser_optional'),
  ).system('结束', done('其他命令照常可用', 'failure')),
});

export const errorState = { nodeErr: false, dirErr: false, renderErr: false };
