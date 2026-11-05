import { $, done, flow, notApplicable, option, set, uses } from '@tokenroll/joplo-kit';

import { ask } from '../../../shared/steps.ts';
import { askLogin, browseScenario, LOGIN_ASK, ReplyMsg, skillLines, skillState, ToolMsg, typoScenario, UserMsg } from '../common.tsx';

export default option({
  name: 'A · 只打印',
  idea: 'joplo skill <主题> 把用法打印到终端，不往项目里写任何文件；要用的时候，由用户在会话里告诉 Agent 先运行它',
  focus: 'Agent 怎样知道 Joplo：靠用户提醒',
  tradeoffs: ['实现最简单，不碰用户项目里的任何文件', '对任何 Agent 都一样有效', 'Agent 不会自己发现：用户忘了提醒，它就会按自己的习惯写 React'],

  on: {
    '/terminal': { lines: skillLines('sa', '用法：npx joplo skill <主题>') },
    '/agent': {
      conversation: [
        <UserMsg id="sa_user" text={LOGIN_ASK} />,
        <ToolMsg id="sa_wrong" when={$.ui.wrong} title="Write src/components/Login.tsx" body={'export function Login() {\n  const [pwd, setPwd] = useState("") …\n  <button onClick={submit}>登录</button>'} />,
        <ToolMsg id="sa_hinted" when={$.ui.hinted} title="Bash" body={'$ npx joplo skill authoring\n$ npx joplo skill cases\n共 182 行'} />,
        <ReplyMsg id="sa_reply" text={'按情况清单过了一遍，有 3 个问题想先确认：\n1. 连续输错几次锁定？锁多久？\n2. 锁定后能否通过邮件解锁？\n3. 要不要做「记住我」？\n确认后我在 features/login/ 下写两个方案：A 单页表单、B 分步登录。'} />,
      ],
    },
  },

  state: { ui: { ...skillState, asked: false, wrong: false, hinted: false, reply: false } },

  coverage: {
    existing_file: notApplicable('不写入任何文件'),
    version_drift: notApplicable('每次都从项目安装的 CLI 读取'),
    other_agents: notApplicable('不依赖任何 Agent 的配置目录，所有 Agent 都一样'),
  },

  scenarios: {
    browse: browseScenario(['discover', 'on_demand']),
    no_hint: askLogin('用户没提醒，Agent 按习惯写 React', ['auto_discover'], { outcome: 'failure', mock: '模拟一个没读过 Joplo 用法的 Agent' })
      .system('Agent 直接写 React 组件', 'Agent 不知道用 Joplo，写成了 React', set($.ui.wrong, true))
      .system('结束', done('产出不是 Joplo 原型，看板里看不到', 'failure')),
    hinted: ask(
      flow('用户提醒后，Agent 按需读取用法', { cases: ['discover', 'on_demand'], start: '/agent' }),
      `${LOGIN_ASK}。先运行 npx joplo skill authoring 和 cases 看用法`,
      $.ui.asked,
      '用户在要求里加上了“先看用法”',
    )
      .system('Agent 读取两个主题', '只读写页面和列情况需要的两个主题，约 180 行', set($.ui.hinted, true), uses('short_topics'))
      .system('Agent 按情况维度提问', set($.ui.reply, true), done('用正确写法开工，并先问了 3 个问题')),
    typo: typoScenario(),
  },
});
