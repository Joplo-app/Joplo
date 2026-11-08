import { $, done, flow, uses, type Bind, type CondExpr } from '@joplo-app/kit';
import { ChatMessage, ToolCall } from '@joplo-app/kit/ui';

import { Cmd } from '../../shared/distribution/term.tsx';
import { ask, run } from '../../shared/distribution/steps.ts';

export const TOPICS =
  '  authoring   目录约定；page / layout / option / flow 的写法     118 行\n' +
  '  components  组件目录与属性                                     136 行\n' +
  '  cases       情况维度清单：开工前用它主动向用户提问              64 行\n' +
  '  check       读懂 joplo check 的输出，按 文件:行 局部修改        41 行\n' +
  '  selection   用户在看板选中元素后，只改那一处                    28 行\n' +
  '  publish     pick、build、部署到 Cloudflare                      37 行';

/** 三个方案共用的终端输出。p 是元素 ID 前缀；footer 是列表末尾的提示行。 */
export const skillLines = (p: string, footer: string) => [
  <Cmd id={`${p}_list`} when={$.ui.list} cmd="npx joplo skill" out={`Joplo 0.1.0 · Agent 用法（按需读取）\n${TOPICS}\n${footer}`} />,
  <Cmd
    id={`${p}_topic`}
    when={$.ui.topic}
    cmd="npx joplo skill authoring"
    out={'# Joplo 创作：authoring（0.1.0）\n目录约定\n  routes/<path>/page.tsx → 页面路径；features/<f>/options/<o>.tsx → 方案\n…（共 118 行）\n相关主题：components、cases'}
  />,
  <Cmd
    id={`${p}_typo`}
    when={$.ui.typo}
    cmd="npx joplo skill authring"
    tone="error"
    out={'✗ 没有主题「authring」。你是不是要找 authoring？\n  运行 npx joplo skill 查看全部主题。'}
  />,
];

export const skillState = { list: false, topic: false, typo: false };

/** 用户在终端里自己看用法。 */
export const browseScenario = (cases: string[]) =>
  run(
    run(flow('在终端查看用法', { cases, start: '/distribution/terminal' }), 'npx joplo skill', $.ui.list, '列出全部主题和每个主题的行数'),
    'npx joplo skill authoring',
    $.ui.topic,
    '只读一个主题，末尾指向相关主题',
    uses('short_topics', 'guide_merged'),
  ).system('结束', done('知道有哪些主题，每次只读需要的那个'));

export const typoScenario = () =>
  run(
    flow('主题名拼错', { cases: ['typo'], outcome: 'failure', start: '/distribution/terminal' }),
    'npx joplo skill authring',
    $.ui.typo,
    '提示最接近的主题名，退出码 2',
    uses('typo_hint'),
  );

/** Claude Code 会话里的消息：用户一句话 + 若干工具调用 + 回复。 */
export const UserMsg = (p: { id: string; text: string }) => (
  <ChatMessage id={p.id} from="user" when={$.ui.asked}>
    {p.text}
  </ChatMessage>
);

export const ToolMsg = (p: { id: string; when: Bind | CondExpr; title: string; body: string; state?: 'running' | 'done' | 'error' }) => (
  <ChatMessage id={p.id} from="assistant" when={p.when}>
    <ToolCall title={p.title} state={p.state ?? 'done'}>
      {p.body}
    </ToolCall>
  </ChatMessage>
);

export const ReplyMsg = (p: { id: string; text: string }) => (
  <ChatMessage id={p.id} from="assistant" when={$.ui.reply}>
    {p.text}
  </ChatMessage>
);

export const LOGIN_ASK = '用 Joplo 帮我设计一个登录功能，要考虑密码错误和账号锁定';

export const askLogin = (name: string, cases: string[], opts: Parameters<typeof flow>[1] = {}) =>
  ask(flow(name, { cases, start: '/distribution/agent', ...opts }), LOGIN_ASK, $.ui.asked, '用户只说要做什么，没有提用法');
