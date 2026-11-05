import { COMPONENT_TYPES } from './catalog.ts';
import { OperationSchemas, Patch } from './ops.ts';
const props: Record<(typeof COMPONENT_TYPES)[number], string> = {
  Page: 'title',
  Header: 'title',
  Sidebar: 'title',
  Stack: 'direction(row|col), gap(number), align, justify, wrap(boolean)',
  Card: 'title',
  Section: 'title',
  Tabs: 'items(string[]), active(string)',
  Divider: '无',
  Heading: 'text, level(1|2|3)',
  Text: 'text, tone(default|muted|danger|success), size(sm|md|lg)',
  Image: 'label, height(number)',
  List: 'items(string[] | $绑定)',
  Table: 'columns({key,label}[]), rows(object[] | $绑定), empty',
  Badge: 'text, tone',
  Avatar: 'name',
  Button: 'label, variant(primary|secondary|ghost|danger)',
  Link: 'label',
  Input: 'label, placeholder, inputType(text|email|password)',
  Textarea: 'label, placeholder',
  Select: 'label, options(string[]), placeholder',
  Checkbox: 'label',
  Radio: 'label, options(string[])',
  Switch: 'label',
  Dialog: 'title, open(boolean | $绑定)',
  Alert: 'text, tone(info|error|success|warning)',
  Spinner: 'label',
  EmptyState: 'title, text',
  Progress: 'value(0-100), label',
  ChatMessage: 'role(user|assistant), text',
  ToolCall: 'name, status(running|done|error), detail',
  PromptInput: 'placeholder',
  Custom: 'kind(string，必填), 其他受控 props；占位框，不执行代码',
};
export const componentGuide = COMPONENT_TYPES.map((type) => ({
  type,
  props: props[type],
}));
const protocol = [
  '读取目标与现有内容（get project/feature/option；局部修改先 get selection）',
  '确定方案差异，按情况维度主动提问；核心目标、权限、不可逆操作与安全未知项必须突出显示',
  '写入有边界的草案；AI 补充规则使用 origin=ai_assumption、confirmation=pending',
  '组件选自目录，稳定 ID；情况用基础画面加初始状态覆盖，不执行任意代码',
  'render 关键画面并检查图像',
  'validate --mode all 检查结构与回放，修正诊断',
  '呈现预览、取舍和未决问题；回放通过不表示业务正确或软件已实现',
];
const dimensions = [
  ['main', '主任务', '正常完成需要哪些入口、步骤和反馈？'],
  ['input', '输入', '空值、无效、重复、长度或容量超限如何处理？'],
  ['permission', '权限与角色', '无权限、权限变化、身份失效看到什么？'],
  [
    'lifecycle',
    '数据与生命周期',
    '空列表、已有数据、过期、撤销、被删除、已完成如何表现？',
  ],
  ['async', '异步与失败', '加载、超时、失败、重试、部分成功如何表现？'],
  ['interrupt', '中断与恢复', '取消、关闭、离开、重新进入是否丢失输入？'],
  ['conflict', '重复与冲突', '双击、重复加入、他人先修改怎样解释？'],
  ['consistency', '跨步骤一致性', '前面的输入、权限和选择在后续是否仍成立？'],
].map(([id, name, question]) => ({ id, name, question }));
const boundaries = [
  '不能确认规则。已有 confirmed 规则仅在 confirmation 以外所有字段不变时可保持；更改后回到 pending。',
  '不能创建或修改 decisions，不能把评论设为 resolved。评论作者只能是 agent；不能将 issue 标为 accepted/resolved，除非保持已有状态。恢复不能删除评论或重新打开已解决评论。',
  '不能修改 schemaVersion、项目 id 或 revision；revision 只由存储提交递增。',
  '不调用真实业务 API、发送邮件或付款；所有步骤只做模拟。',
  '不声称情况已穷尽；不适用或排除要说明原因，新 Case 需要重新检查旧方案。',
];
/** 每个示例可单独在 init 后的项目上运行，setup/cleanup 属同一事务。 */
export function guide(format?: 'json' | 'text') {
  const feature = {
    op: 'upsertFeature',
    value: {
      id: 'feat_demo',
      name: '示例',
      goal: '演示',
      caseIds: ['case_demo'],
      optionIds: ['opt_demo'],
    },
  };
  const c = {
    op: 'upsertCase',
    value: {
      id: 'case_demo',
      featureId: 'feat_demo',
      title: '正常',
      dimension: 'main',
    },
  };
  const option = {
    op: 'upsertOption',
    value: {
      id: 'opt_demo',
      featureId: 'feat_demo',
      name: '方案',
      idea: '明确反馈',
    },
  };
  const scene = {
    op: 'upsertScene',
    value: {
      id: 'scene_demo',
      optionId: 'opt_demo',
      name: '页面',
      root: {
        id: 'page',
        type: 'Page',
        children: [
          {
            id: 'button',
            type: 'Button',
            props: { label: '开始' },
            unmodeled: true,
          },
        ],
      },
    },
  };
  const scenario = {
    op: 'upsertScenario',
    value: {
      id: 'sc_demo',
      optionId: 'opt_demo',
      name: '演示',
      mock: { label: '模拟', outcome: 'other' },
      initial: { sceneId: 'scene_demo' },
      steps: [],
    },
  };
  const rule = {
    op: 'upsertRule',
    value: {
      id: 'rule_demo',
      featureId: 'feat_demo',
      text: '示例规则待确认',
      origin: 'ai_assumption',
      confirmation: 'pending',
    },
  };
  const issue = {
    op: 'upsertIssue',
    value: {
      id: 'issue_demo',
      featureId: 'feat_demo',
      text: '请确认',
      severity: 'minor',
      source: 'ai',
    },
  };
  const comment = {
    op: 'addComment',
    value: {
      id: 'comment_demo',
      target: { kind: 'element', id: 'scene_demo#button' },
      text: '待检查',
      author: 'agent',
      revision: 0,
      createdAt: '2026-11-05T00:00:00Z',
    },
  };
  const setup = [feature, c, option, scene, scenario];
  const operations: Record<string, unknown[]> = {
    upsertFeature: setup,
    upsertCase: setup,
    upsertOption: setup,
    upsertScene: setup,
    upsertScenario: setup,
    upsertRule: [...setup, rule],
    upsertIssue: [...setup, issue],
    setCoverage: [
      ...setup,
      {
        op: 'setCoverage',
        optionId: 'opt_demo',
        caseId: 'case_demo',
        value: { status: 'expressed', scenarioIds: ['sc_demo'] },
      },
    ],
    updateNode: [
      ...setup,
      {
        op: 'updateNode',
        sceneId: 'scene_demo',
        nodeId: 'button',
        patch: { props: { label: '继续' } },
      },
    ],
    insertNode: [
      ...setup,
      {
        op: 'insertNode',
        sceneId: 'scene_demo',
        parentId: 'page',
        value: { id: 'hint', type: 'Text', props: { text: '说明' } },
      },
    ],
    removeNode: [
      ...setup,
      { op: 'removeNode', sceneId: 'scene_demo', nodeId: 'button' },
    ],
    remove: [
      ...setup,
      issue,
      { op: 'remove', kind: 'issue', id: 'issue_demo' },
    ],
    addComment: [...setup, comment],
    replyComment: [
      ...setup,
      comment,
      { op: 'replyComment', id: 'comment_demo', text: '已调整，请检查' },
    ],
    setCommentStatus: [
      ...setup,
      comment,
      { op: 'setCommentStatus', id: 'comment_demo', status: 'awaiting_user' },
    ],
  };
  const examples = Object.fromEntries(
    Object.keys(OperationSchemas).map((name) => [
      name,
      Patch.parse({
        expectRevision: 0,
        idempotencyKey: `guide_${name}`,
        summary: `示例 ${name}`,
        operations: operations[name],
      }),
    ]),
  );
  const json = {
    protocol,
    dimensions,
    components: componentGuide,
    examples,
    boundaries,
    usage:
      'joplo init ./demo --name 示例；将任一 examples 值保存为 patch.json；joplo apply ./demo --patch patch.json。每个例子用独立新项目。旧项目请先 get，更新 expectRevision 和幂等键。',
  };
  const text = [
    ...protocol.map((s, i) => `${i + 1}. ${s}`),
    '情况维度（按业务相关性选择）：',
    ...dimensions.map((d) => `${d.name}: ${d.question}`),
    '硬性边界：',
    ...boundaries,
    '组件目录：',
    ...componentGuide.map((c) => `${c.type}: ${c.props}`),
    json.usage,
    '操作示例：',
    JSON.stringify(examples, null, 2),
  ].join('\n');
  return format === 'text' ? text : format === 'json' ? json : { json, text };
}
