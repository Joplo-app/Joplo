import { $, done, flow, missing, option, rule, set, uses } from '@joplo-app/kit';

import { Cmd } from '../../../shared/distribution/term.tsx';
import { run } from '../../../shared/distribution/steps.ts';
import { askLogin, browseScenario, LOGIN_ASK, ReplyMsg, skillLines, skillState, ToolMsg, typoScenario, UserMsg } from '../common.tsx';

export default option({
  name: 'C · 完整拷贝到项目',
  idea: 'joplo skill install 把全部主题写成 .claude/skills/joplo/ 下的多个 Markdown 文件，由 Claude Code 自己按需打开',
  focus: 'Agent 怎样知道 Joplo：把用法全文放进项目',
  tradeoffs: [
    'Agent 直接读文件，不用运行命令，离线也能读',
    'joplo 升级后文件会过期，需要重新 install；用户改过的文件更难合并',
    '只适配 Claude Code 的 skill 目录，其他 Agent 要另想办法',
  ],

  on: {
    '/distribution/terminal': {
      lines: [
        ...skillLines('sc', '用法：npx joplo skill <主题>    拷贝到项目：npx joplo skill install'),
        <Cmd
          id="sc_install"
          when={$.ui.installed}
          cmd="npx joplo skill install"
          tone="ok"
          out={'✓ 已写入 .claude/skills/joplo/（7 个文件，共 434 行）\n  SKILL.md、authoring.md、components.md、cases.md、check.md、selection.md、publish.md'}
        />,
        <Cmd id="sc_upgrade" when={$.ui.upgraded} cmd="npm i -D joplo@0.2.0" out="changed 1 package in 2s" />,
        <Cmd
          id="sc_stale"
          when={$.ui.stale}
          cmd="npx joplo check"
          tone="warn"
          out={'! .claude/skills/joplo/ 是 0.1.0 生成的，当前是 0.2.0，组件目录有变化。\n  更新：npx joplo skill install --force（会覆盖你改过的内容）\n0 error, 1 warning'}
        />,
      ],
    },
    '/distribution/agent': {
      conversation: [
        <UserMsg id="sc_user" text={LOGIN_ASK} />,
        <ToolMsg id="sc_read" when={$.ui.read} title="Read" body={'.claude/skills/joplo/SKILL.md\n.claude/skills/joplo/authoring.md\n.claude/skills/joplo/cases.md\n共 192 行'} />,
        <ReplyMsg id="sc_reply" text={'按情况清单过了一遍，有 3 个问题想先确认：\n1. 连续输错几次锁定？锁多久？\n2. 锁定后能否通过邮件解锁？\n3. 要不要做「记住我」？'} />,
      ],
    },
  },

  state: { ui: { ...skillState, installed: false, upgraded: false, stale: false, asked: false, read: false, reply: false } },

  rules: {
    stale_check: rule('joplo check 发现 skill 文件的版本与 CLI 不同时给出警告', { cases: ['version_drift'], elements: ['sc_stale'] }),
  },

  coverage: {
    existing_file: missing('用户改过文件后再升级，怎样合并还没有设计'),
    other_agents: missing('只生成 Claude Code 的 skill 目录'),
  },

  scenarios: {
    install: run(
      flow('拷贝到项目', { cases: ['discover'], start: '/distribution/terminal' }),
      'npx joplo skill install',
      $.ui.installed,
      '把 7 个主题文件全部写进项目',
    ).system('结束', done('安装完成')),
    auto: askLogin('用户没提醒，Agent 自己发现 Joplo', ['auto_discover', 'on_demand'], { state: { ui: { installed: true } } })
      .system('Claude Code 打开需要的文件', '直接读文件，不运行命令', set($.ui.read, true))
      .system('Agent 按情况维度提问', set($.ui.reply, true), done('用正确写法开工')),
    drift: run(
      run(
        flow('升级后用法过期', { cases: ['version_drift'], outcome: 'other', mock: '模拟升级到 0.2.0', start: '/distribution/terminal', state: { ui: { installed: true } } }),
        'npm i -D joplo@0.2.0',
        $.ui.upgraded,
        '升级 joplo，项目里的 skill 文件仍是旧版本',
      ),
      'npx joplo check',
      $.ui.stale,
      'check 发现 skill 文件过期，提示重新安装',
      uses('stale_check'),
    ),
    browse: browseScenario(['on_demand']),
    typo: typoScenario(),
  },
});
