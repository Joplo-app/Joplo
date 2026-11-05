import { $, done, flow, notApplicable, option, rule, set, uses } from '@joplo/kit';

import { Cmd } from '../../../shared/term.tsx';
import { run } from '../../../shared/steps.ts';
import { askLogin, browseScenario, LOGIN_ASK, ReplyMsg, skillLines, skillState, ToolMsg, typoScenario, UserMsg } from '../common.tsx';

const SKILL_MD =
  '---\n' +
  'name: joplo\n' +
  'description: 在 Joplo 项目（有 joplo.config.ts）里设计功能原型、方案和演示时使用\n' +
  '---\n' +
  '这个项目用 Joplo 描述功能原型。不要凭记忆写，先按需读取用法：\n' +
  '- npx joplo skill authoring   写页面、方案、场景\n' +
  '- npx joplo skill components  可用组件和属性\n' +
  '- npx joplo skill cases       开工前用情况清单主动提问\n' +
  '改完运行 npx joplo check，按 文件:行 修改。\n' +
  '用户在看板选中元素后，运行 npx joplo selection，只改那一处。';

export default option({
  name: 'B · 打印 + 安装一个“指针” skill',
  idea: 'joplo skill install 只写一个十几行的 SKILL.md：告诉 Agent 何时用 Joplo、该运行哪条命令；详细内容每次从 CLI 按需读取',
  focus: 'Agent 怎样知道 Joplo：项目里放一个很小的入口，内容留在 CLI',
  tradeoffs: [
    'Agent 自己发现 Joplo，用户不用每次提醒',
    '入口只有十几行，详细内容按需读取，最省 token；内容随 CLI 版本，不会过期',
    '多一个写入步骤，要处理已存在的文件；Agent 每次读取都要运行一次 npx（项目内约 0.3 秒）',
  ],

  on: {
    '/terminal': {
      lines: [
        ...skillLines('sb', '用法：npx joplo skill <主题>    安装到 Agent：npx joplo skill install'),
        <Cmd
          id="sb_install"
          when={$.ui.installed}
          cmd="npx joplo skill install"
          tone="ok"
          out={'✓ 已写入 .claude/skills/joplo/SKILL.md（10 行，只是入口）\n✓ 已在 AGENTS.md 末尾追加 Joplo 段落（Codex 等 Agent 读取）\n提示：把这两个文件提交到 Git，团队成员的 Agent 也能用。'}
        />,
        <Cmd id="sb_cat" when={$.ui.cat} cmd="cat .claude/skills/joplo/SKILL.md" out={SKILL_MD} />,
        <Cmd
          id="sb_exists"
          when={$.ui.exists}
          cmd="npx joplo skill install"
          tone="warn"
          out={'! .claude/skills/joplo/SKILL.md 已存在，并且被修改过，没有覆盖。\n  查看差异：npx joplo skill install --diff\n  覆盖：npx joplo skill install --force'}
        />,
      ],
    },
    '/agent': {
      conversation: [
        <UserMsg id="sb_user" text={LOGIN_ASK} />,
        <ToolMsg id="sb_skill" when={$.ui.found} title="Skill · joplo" body="已加载 .claude/skills/joplo/SKILL.md（10 行）" />,
        <ToolMsg id="sb_read" when={$.ui.read} title="Bash" body={'$ npx joplo skill authoring\n$ npx joplo skill cases\n共 182 行'} />,
        <ReplyMsg id="sb_reply" text={'按情况清单过了一遍，有 3 个问题想先确认：\n1. 连续输错几次锁定？锁多久？\n2. 锁定后能否通过邮件解锁？\n3. 要不要做「记住我」？\n确认后我在 features/login/ 下写两个方案：A 单页表单、B 分步登录。'} />,
      ],
    },
  },

  state: { ui: { ...skillState, installed: false, cat: false, exists: false, asked: false, found: false, read: false, reply: false } },

  rules: {
    pointer_only: rule('SKILL.md 只写何时使用和该运行的命令，不复制用法正文', { cases: ['auto_discover', 'version_drift'], elements: ['sb_cat'] }),
    no_overwrite: rule('已存在且被修改过的文件不覆盖；--diff 查看差异，--force 覆盖', { cases: ['existing_file'], elements: ['sb_exists'] }),
  },

  coverage: {
    version_drift: notApplicable('SKILL.md 只是入口，正文每次由项目安装的 CLI 输出，不会过期'),
  },

  scenarios: {
    install: run(
      run(
        flow('安装到 Agent', { cases: ['other_agents'], start: '/terminal', expected: 'Claude Code 和 Codex 都能发现 Joplo' }),
        'npx joplo skill install',
        $.ui.installed,
        '写入 Claude Code 的 skill 入口，并给 AGENTS.md 追加一段',
      ),
      'cat .claude/skills/joplo/SKILL.md',
      $.ui.cat,
      '入口只有十几行：何时使用、运行哪条命令',
      uses('pointer_only'),
    ).system('结束', done('安装完成')),
    auto: askLogin('用户没提醒，Agent 自己发现 Joplo', ['auto_discover', 'discover', 'on_demand'], { state: { ui: { installed: true } } })
      .system('Claude Code 匹配到 joplo skill', '项目里有 joplo.config.ts，Agent 加载 10 行的入口', set($.ui.found, true), uses('pointer_only'))
      .system('Agent 按需读取两个主题', '只读写页面和列情况需要的两个主题，约 180 行', set($.ui.read, true), uses('short_topics', 'same_version'))
      .system('Agent 按情况维度提问', set($.ui.reply, true), done('用正确写法开工，并先问了 3 个问题')),
    exists: run(
      flow('已有被修改过的 SKILL.md', { cases: ['existing_file'], outcome: 'other', mock: '模拟用户改过 SKILL.md', start: '/terminal' }),
      'npx joplo skill install',
      $.ui.exists,
      '不覆盖用户改过的文件，给出查看差异和强制覆盖两种做法',
      uses('no_overwrite'),
    ),
    browse: browseScenario(['discover', 'on_demand']),
    typo: typoScenario(),
  },
});
