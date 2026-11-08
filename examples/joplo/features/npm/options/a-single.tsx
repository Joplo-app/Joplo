import { $, done, flow, notApplicable, option, undecided, uses } from '@joplo-app/kit';
import { Badge, Card, Code, Group, Stack, Text, Title } from '@joplo-app/kit/ui';

import { Cmd } from '../../../shared/distribution/term.tsx';
import { run } from '../../../shared/distribution/steps.ts';
import { errorLines, errorScenarios, errorState } from '../common.tsx';


export default option({
  name: 'A · 单包 joplo',
  idea: '只发布一个 joplo 包：CLI、编译器、看板资源和创作 SDK 都在里面；作者项目只依赖 joplo，写 import { option } from "joplo"',
  focus: '包的组织方式：一个名字、一个版本',
  tradeoffs: [
    '用户只需要记住一个名字，项目里不会出现 CLI 与 SDK 版本错配',
    '包体积约 14 MB（大部分是中文手写字体），作者项目安装时一并下载',
    '现有示例要把 @joplo-app/kit 改成 joplo、jsxImportSource 改成 "joplo"',
  ],

  on: {
    '/distribution/terminal': {
      lines: [
        <Cmd
          id="a_init"
          when={$.ui.init}
          cmd="npx joplo@latest init my-demo"
          tone="ok"
          out={
            'Need to install the following packages: joplo@0.1.0  Ok to proceed? (y) y\n' +
            '✓ 已创建 my-demo/：joplo.config.ts、layouts/、routes/、features/\n' +
            '✓ package.json  devDependencies: { "joplo": "^0.1.0" }\n' +
            '✓ tsconfig.json jsxImportSource: "joplo"\n' +
            '下一步：cd my-demo && npm install && npx joplo dev'
          }
        />,
        <Cmd id="a_install" when={$.ui.install} cmd="cd my-demo && npm install" out="added 92 packages in 7s" />,
        <Cmd
          id="a_dev"
          when={$.ui.dev}
          cmd="npx joplo dev"
          tone="ok"
          out={'[joplo] 使用项目内的 joplo 0.1.0\n[joplo] 看板：http://127.0.0.1:4790/'}
        />,
        ...errorLines('a'),
      ],
    },
    '/distribution/npm': {
      package: (
        <Card id="a_pkg" withBorder>
          <Stack gap="sm">
            <Title order={3}>joplo</Title>
            <Text c="dimmed">面向编码 Agent 的功能设计与演示工具</Text>
            <Group gap="xs">
              <Badge>0.1.0</Badge>
              <Badge variant="outline">bin: joplo</Badge>
              <Badge variant="outline">约 14 MB</Badge>
            </Group>
            <Code>npm i -D joplo</Code>
            <Text size="sm">入口：joplo（创作 API）、joplo/ui（组件）、joplo/jsx-runtime、命令 joplo</Text>
            <Text size="sm" note="体积为估算：字体约 12 MB">内含：CLI、编译器与校验器、看板与发布站资源、手绘字体</Text>
          </Stack>
        </Card>
      ),
    },
  },

  state: { ui: { init: false, install: false, dev: false, ...errorState } },

  coverage: {
    version_skew: notApplicable('只有一个包；在项目里 npx joplo 总是使用项目安装的那一个版本'),
    pm_variants: undecided('init 是否检测 pnpm/bun/yarn 并打印对应命令'),
    offline: notApplicable('npx 在下载阶段就会失败，Joplo 的代码还没运行'),
    release: undecided('发布流程（版本工具、CI、provenance）在实现 ADR 中确定'),
  },

  scenarios: {
    first_run: run(
      run(
        run(
          flow('新用户从零打开看板', { cases: ['first_run'], start: '/distribution/terminal', expected: '三条命令内打开看板' }),
          'npx joplo@latest init my-demo',
          $.ui.init,
          'npx 下载 joplo 并生成项目，结尾打印下一步',
          uses('one_command_start'),
        ),
        'cd my-demo && npm install',
        $.ui.install,
        '安装依赖：只有一个 joplo 包',
      ),
      'npx joplo dev',
      $.ui.dev,
      '项目内的 npx 使用本地安装的 joplo，看板启动',
      uses('prefer_local'),
    ).system('看板已打开', done('从零到看板：三条命令')),
    ...errorScenarios(),
  },
});
