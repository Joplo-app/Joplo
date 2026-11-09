import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, done, flow, notApplicable, option, rule, undecided, uses } from '@joplo-app/kit';
import { Card, DataTable, Stack, Text, Title } from '@joplo-app/plugin-ui';

import { Cmd } from '../../../shared/distribution/term.tsx';
import { run } from '../../../shared/distribution/steps.ts';
import { errorLines, errorScenarios, errorState } from '../common.tsx';

export default withDesignRecord(option({
  name: 'B · joplo 入口 + @joplo-app/* 作用域包',
  idea: 'joplo 只是一个很小的命令入口，转发到 @joplo-app/cli；作者项目依赖轻量的 @joplo-app/kit。与仓库现有的包结构一一对应',
  focus: '包的组织方式：按职责拆分，作者项目只装需要的部分',
  tradeoffs: [
    '作者项目运行时只依赖约 40 KB 的 @joplo-app/kit；看板资源只在运行 CLI 时下载',
    '现有示例和文档无需迁移（仍是 @joplo-app/kit、jsxImportSource "@joplo-app/kit"）',
    '6 个包要一起发版；项目里的 kit 与 CLI 版本可能错配，需要检查并提示',
  ],

  on: {
    '/distribution/terminal': {
      lines: [
        <Cmd
          id="b_init"
          when={$.ui.init}
          cmd="npx joplo@latest init my-demo"
          tone="ok"
          out={
            'Need to install the following packages: joplo@0.1.0  Ok to proceed? (y) y\n' +
            '✓ 已创建 my-demo/：joplo.config.ts、layouts/、routes/、features/\n' +
            '✓ package.json  devDependencies: { "joplo": "0.1.0", "@joplo-app/kit": "0.1.0" }（锁定同一版本）\n' +
            '✓ tsconfig.json jsxImportSource: "@joplo-app/kit"\n' +
            '下一步：cd my-demo && npm install && npx joplo dev'
          }
        />,
        <Cmd id="b_install" when={$.ui.install} cmd="cd my-demo && npm install" out="added 94 packages in 7s" />,
        <Cmd
          id="b_dev"
          when={$.ui.dev}
          cmd="npx joplo dev"
          tone="ok"
          out={'[joplo] 使用项目内的 joplo 0.1.0（@joplo-app/kit 0.1.0）\n[joplo] 看板：http://127.0.0.1:4790/'}
        />,
        <Cmd
          id="b_skew"
          when={$.ui.skew}
          cmd="npx joplo@latest check"
          tone="warn"
          out={
            '! 项目里的 @joplo-app/kit 是 0.1.0，当前 CLI 是 0.2.0，两者的 IR 版本不同。\n' +
            '  已改用项目内的 joplo 0.1.0 执行。要升级：npm i -D joplo@0.2.0 @joplo-app/kit@0.2.0\n' +
            '0 error, 2 warning'
          }
        />,
        ...errorLines('b'),
      ],
    },
    '/distribution/npm': {
      package: (
        <Card id="b_pkgs" withBorder>
          <Stack gap="sm">
            <Title order={3}>@joplo-app/*（6 个包，版本同步）</Title>
            <Text c="dimmed">用户只需要记住 npx joplo；作者项目依赖 @joplo-app/kit</Text>
            <DataTable
              id="tbl_pkgs"
              note="体积为估算"
              columns={[{ accessor: 'name', title: '包' }, { accessor: 'role', title: '作用' }, { accessor: 'size', title: '体积' }]}
              records={[
                { name: 'joplo', role: '命令入口，转发到 @joplo-app/cli', size: '约 5 KB' },
                { name: '@joplo-app/kit', role: '创作 SDK 与 JSX 运行时（作者项目依赖）', size: '约 40 KB' },
                { name: '@joplo-app/cli', role: '命令实现', size: '约 60 KB' },
                { name: '@joplo-app/core', role: '编译、校验、播放器', size: '约 200 KB' },
                { name: '@joplo-app/server', role: 'dev / build / render', size: '约 100 KB' },
                { name: '@joplo-app/web', role: '看板与发布站资源、手绘字体', size: '约 14 MB' },
              ]}
            />
          </Stack>
        </Card>
      ),
    },
  },

  state: { ui: { init: false, install: false, dev: false, skew: false, ...errorState } },

  rules: {
    lockstep: rule('所有 @joplo-app/* 包与 joplo 使用同一版本号，一起发布；init 写入精确版本而不是 ^ 范围', { cases: ['version_skew', 'release'] }),
    skew_warn: rule('CLI 发现项目内 @joplo-app/kit 版本不同时，改用项目内的 CLI 执行，并打印对齐命令', { cases: ['version_skew'], elements: ['b_skew'] }),
  },

  coverage: {
    pm_variants: undecided('init 是否检测 pnpm/bun/yarn 并打印对应命令'),
    offline: notApplicable('npx 在下载阶段就会失败，Joplo 的代码还没运行'),
    release: undecided('发布流程（changesets 统一版本、CI、provenance）在实现 ADR 中确定'),
  },

  scenarios: {
    first_run: run(
      run(
        run(
          flow('新用户从零打开看板', { cases: ['first_run'], start: '/distribution/terminal', expected: '三条命令内打开看板' }),
          'npx joplo@latest init my-demo',
          $.ui.init,
          '只下载小入口，生成项目并锁定版本',
          uses('one_command_start', 'lockstep'),
        ),
        'cd my-demo && npm install',
        $.ui.install,
        '安装依赖：joplo 与 @joplo-app/kit 两个包',
      ),
      'npx joplo dev',
      $.ui.dev,
      '项目内的 npx 使用本地安装的 joplo，看板启动',
      uses('prefer_local'),
    ).system('看板已打开', done('从零到看板：三条命令')),

    version_skew: run(
      flow('npx 拉到更新的 CLI', { cases: ['version_skew'], outcome: 'other', mock: '模拟项目内为 0.1.0，最新版为 0.2.0', start: '/distribution/terminal' }),
      'npx joplo@latest check',
      $.ui.skew,
      '版本不同：改用项目内版本并提示',
      uses('skew_warn', 'prefer_local'),
    ).system('结束', done('结果仍然可信，用户知道怎样升级')),

    ...errorScenarios(),
  },
}), designRecords.npm);
