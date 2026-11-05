import { COMPONENT_TYPES, GATED_CONTAINERS, INTERACTIVE_TYPES, JOPLO_PROPS, VALUE_TYPES } from './catalog.ts';
import { JoploError } from './result.ts';

export const SKILL_TOPICS = [
  { name: 'authoring', description: '目录约定；page / layout / option / flow 的写法' },
  { name: 'components', description: '当前版本的组件目录与属性' },
  { name: 'cases', description: '情况维度清单：开工前主动向用户提问' },
  { name: 'check', description: '读懂诊断，按文件和行号局部修改' },
  { name: 'selection', description: '用户在看板选中元素后，只改那一处' },
  { name: 'publish', description: 'pick、build、静态站部署' },
] as const;
export type SkillTopic = (typeof SKILL_TOPICS)[number]['name'];

const related: Record<SkillTopic, readonly SkillTopic[]> = {
  authoring: ['components', 'cases', 'check', 'selection', 'publish'],
  components: ['authoring', 'check'],
  cases: ['authoring', 'check'],
  check: ['authoring', 'selection'],
  selection: ['check', 'authoring'],
  publish: ['authoring', 'check'],
};

/** CLI 传入其 package.json 版本；行数来自同一次生成的主题正文。 */
export function skillIndex(version: string, docs?: Readonly<Record<string, string>> | null): string {
  return [
    `Joplo ${version} · Agent 用法（按需读取）`,
    ...SKILL_TOPICS.map(t => `  ${t.name.padEnd(11)} ${t.description}  ${skillTopic(t.name, docs).trimEnd().split('\n').length} 行`),
    '用法：npx joplo skill <主题>    安装到 Agent：npx joplo skill install',
    '',
  ].join('\n');
}

export function nearestSkillTopic(input: string): SkillTopic {
  const value = input.toLowerCase();
  return [...SKILL_TOPICS].sort((a, b) => distance(value, a.name) - distance(value, b.name))[0]!.name;
}

/** docs 是组件目录提供的可选一行提示，不在这里维护另一份组件或属性清单。 */
export function skillTopic(topic: string, docs?: Readonly<Record<string, string>> | null): string {
  if (!SKILL_TOPICS.some(t => t.name === topic)) throw new JoploError('USAGE', `没有主题「${topic}」。你是不是要找 ${nearestSkillTopic(String(topic))}？\n运行 npx joplo skill 查看全部主题。`);
  const name = topic as SkillTopic;
  const body = name === 'components' ? componentTopic(docs ?? undefined) : CONTENT[name];
  return `${body.trimEnd()}\n\n相关主题：${related[name].join('、')}\n`;
}

/** 兼容旧入口：与 joplo skill authoring 输出完全相同。 */
export function guide(): string { return skillTopic('authoring'); }

function componentTopic(docs: Readonly<Record<string, string>> = {}): string {
  const names = COMPONENT_TYPES.filter(name => !name.startsWith('#'));
  const listed = (set: ReadonlySet<string>) => names.filter(name => set.has(name)).join('、');
  return [
    '# Joplo 组件：components',
    '',
    '从 @tokenroll/joplo-kit/ui 导入组件；下面的名称取自当前编译器目录，不能任意添加组件。',
    '有属性提示时附在名称后；没有提示时仅列名称。HTML 标签直接写 JSX，不从 ui 导入。',
    '',
    '## 组件目录',
    ...names.map(name => `- ${name}${Object.hasOwn(docs, name) && docs[name]?.trim() ? `：${docs[name]!.replace(/\s+/g, ' ').trim()}` : ''}`),
    '',
    '## 行为分类（由目录生成）',
    `- 可操作，必须给 id 并声明行为：${listed(INTERACTIVE_TYPES)}。`,
    `- 接收输入，type/select/toggle 写入 inputs：${listed(VALUE_TYPES)}。`,
    `- 展开状态控制子元素可见性的容器：${listed(GATED_CONTAINERS)}。`,
    '',
    `Joplo 专用属性：${JOPLO_PROPS.join('、')}；disabled 为组件禁用属性。`,
    'when 控制出现条件；disabledReason 解释禁用；unmodeled 标记本版未建模；note 是创作备注。',
    '可操作元素应有 flow 步骤，或 disabled=true 且说明原因，或显式 unmodeled。',
    '绑定、条件和步骤语法见 authoring；组件错误的修复见 check。',
  ].join('\n');
}

const CONTENT: Record<Exclude<SkillTopic, 'components'>, string> = {
  authoring: `# Joplo 创作：authoring

用 TS/TSX 描述设计，源文件是权威源，Git 管理版本；看板和发布站消费编译后的 IR。
先读需要的主题，通常一次只需一两个。组件与属性读 components，开工前的提问读 cases。

## 目录约定
- joplo.config.ts：export default config({ name, layout: 'app', home: '/' })。
- layouts/app.tsx：export default layout(<AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm' }}><AppShell.Navbar>…</AppShell.Navbar><AppShell.Main><Outlet/></AppShell.Main><Slot name="overlay"/></AppShell>)。
- routes/page.tsx → /；routes/members/page.tsx → /members。只支持静态路径，不支持 [id]。
- features/<f>/feature.ts：功能目标、情况、共享规则、待决问题、pick。
- features/<f>/options/<o>.tsx：一个方案、路径堆叠、初始状态和场景。
- 功能目录内可自由组织复用数据或模块，供上述文件 import。
- 数据 API 从 @tokenroll/joplo-kit 导入，组件从 @tokenroll/joplo-kit/ui 导入。
- tsconfig 使用 jsx: 'react-jsxdev'、jsxImportSource: '@tokenroll/joplo-kit'、allowImportingTsExtensions: true。

## 数据 API
- config({ name, description?, theme?: 'sketch'|'clean', layout?, home? })。
- layout(tree)；Outlet 放当前页面，<Slot name="actions"/> 声明可堆叠的插槽。
- page({ title, layout?: string|false, viewport?: 'desktop'|'mobile' }, tree)。每个页面只有一种设备：缺省电脑；写 viewport: 'mobile' 时固定用手机外框和 390 宽显示。需要手机版就单独做一个手机版的页面或演示，不要让一个页面同时兼容电脑和手机。
- feature({ name, goal, cases, roles?, constraints?, rules?, questions?, pick? })。
- option({ name, idea, on?, routes?, state?, rules?, questions?, coverage?, scenarios })。
- on: { '/members': { actions: <Button id="invite">邀请</Button> } }：往已有路径的插槽加元素。
- routes: { '/members/new': page({ title: '新增' }, <Stack>…</Stack>) }：为方案新增路径。
- state: { ui: { ready: false }, data: {}, inputs: {} }：方案初始状态。
- scenarios: { happy: flow('成功', { cases: ['happy'], start: '/members' }).click('invite', done('已完成')) }。
- flow 的选项还可写 state、description、expected、mock、outcome，覆盖初始状态或说明模拟结果。
- 情况与 coverage 的声明读 cases；选择和发布 pick 读 publish。

## flow：行为只写在步骤里
- .click(id, ...args)；.type(id, value, ...args)；.select(id, value, ...args)。
- .toggle(id, boolean, ...args)；.back(...args)；.system('模拟事件', ...args)。
- args 的字符串是字幕，可省略；其余参数是效果。所有方法可链式调用。
- set($.ui.ready, true)：替换状态；push($.data.rows, row)：追加数组项。
- toast('提示') / toast.success/error/info('提示')：当前步骤提示。
- go('/members')：在当前方案上下文里切换路径；back 返回前一路径。
- done('结果', 'success'|'failure'|'cancelled')：结束场景，默认 success。
- uses('rule_key', ...)：关联本方案或本功能的规则。

## 绑定与条件
- $.ui.x / $.data.x / $.inputs.x 是整值绑定，不求值任意表达式。
- when={$.ui.ready}；disabled={not($.ui.isAdmin)}。
- not(x)、eq(x, value)、neq(x, value)、empty(x)、notEmpty(x)、oneOf(x, values)、and(...xs)、or(...xs)。
- 浮层：<Modal id="dlg" opened={$.ui.open} title="…">；Drawer 同理，可见性只看 opened。

## 布局与适配（组件与 Mantine 同名同参，不写 className）
- 用 Stack / Group / SimpleGrid / Grid 的属性排版：<Group justify="space-between">、<SimpleGrid cols={{ base: 1, md: 3 }}>。
- 响应式写成对象 { base, xs, sm, md, lg, xl }，或 visibleFrom="sm" / hiddenFrom="sm"；AppShell 在窄于 navbar.breakpoint 时自动收起导航。
- 输入组件直接写 label：<TextInput id="email" label="邮箱"/>，自动字幕会用它。

## 视角层级与导演镜头：一屏讲清客户端与后端
- 每个层级是一个完全独立的画面：layers: { client: layer('客户端视角', <ClientView/>), backend: layer('后端流转', <Arch/>) }；layer 的第二个参数是这一层自己的 JSX 树，按自己的布局占满整个舞台，不从路径页面里裁切。
- 各层共享同一份状态（ui / data / inputs），切层不改变步骤；声明了 layers 的方案在演示页只显示各层画面。没有自动“全景”层：需要全景就自己声明一个，如 overview: layer('全景', <Overview/>)。
- 较长的讲解写 explain('…')：.system('额度预检', '调用模型之前先预检额度', shot('billing'), explain('额度不足时在这里就拦下，不会产生模型费用'))。导演模式下焦点旁会弹出解说卡，大字显示这一步的说明，explain 显示在说明下方；手动选层时只显示底部字幕。自动播放每一步停留约 60ms/字（说明加解说，至少 3 秒），所以说明写完整的一句话即可，不必拆成很多步。
- 步骤里写镜头：.click('app_send', shot('msg_user'), shot('app', 'biz'))；每个 id 在包含它的层里解析，多层有同名 id 时各层都生效；第一个 shot 所在的层是导演层；shot() 让当时的导演层回到整层；没写 shot 的步骤沿用上一步，没写 shot 的点击会切到按钮所在的层。
- 镜头可以对准任何带 id 的元素（组件、卡片、按钮、Diagram 节点 / 分组 / 连线）。播放时导演自动切层并推近焦点，观众也能手动切层或“只重放这一层”。
- 不要为了“看得清”写很长的层：整层会缩进画面，细节靠 shot 推近。shot 的 id 不在任何层里时 check 报 SHOT_UNKNOWN；layer 的树为空时报 LAYER_UNKNOWN。

## 架构图：用 flow 驱动调用链
- <Diagram>里放 <Diagram.Group label>、<Diagram.Node id label kind state={$.ui.n_x}/>、<Diagram.Edge from to label async state={$.ui.e1}/>；布局自动生成，播放时不移动。
- 演示调用链就是改 state：.system('客户端发出消息', set($.ui.e1, 'active'))，下一步 set($.ui.e1, 'ok')、set($.ui.n_brain, 'active')；出错用 'error'，无关部分用 'dim'。
- 常与前端画面分成两个层级（客户端 / 后端），同一个 flow 一步步同时推进两边；Node / Edge 不需要 flow 也不用 unmodeled，⌥+单击可检查。
- 逐段出现（像幻灯片一样一段一段加内容）：给 Group / Node / Edge 写 when={$.ui.show_billing}，步骤里 set($.ui.show_billing, true)；布局一开始就按全部元素算好，出现时已有元素不移动。
- 节点多、容器不宽时用 direction="down"；整图总是放进容器，看细节靠 shot 推近，观众也可以滚轮 / 捏合缩放、拖动平移。

## 规则与边界
- rule('约束', { origin?, status?, cases?: ['happy'], elements?: ['invite'] })。
- origin: user/project_material/ai_assumption/code_observed/feedback，默认 ai_assumption。
- status: pending/confirmed/conflict/out_of_scope，默认 pending。
- AI 假设不能标为已确认；用户确认后再如实记录 origin/status。
- question('待决定的问题', { severity?: 'blocker'|'major'|'minor', refs?: ['happy'] })。
- 不写 onClick 或其他函数属性。作者复用组件在收集时展开，交互由 flow 驱动。
- 作者模块会在本机加载/检查/构建时执行，只运行可信项目。

改文件后运行 npx joplo check；在看板上看，用 npx joplo selection 读取用户指向的位置。
诊断的修复流程读 check；只改选中位置的流程读 selection。`,
  cases: `# Joplo 情况清单：cases

开工前先读用户需求和项目材料，再用下面的维度寻找遗漏；只问会改变设计的关键问题。
用户未回答的内容写 question 或保留待确认规则，不替用户把 AI 假设确认为决定。

## 八个维度：每项选一两个与功能相关的问题
- \`main\` 主流程：谁要完成什么？完成后用户应该看见什么？
- \`input\` 输入：为空、格式无效或达到上限时怎么办？能否保留输入并就地修正？
- \`permission\` 权限：谁能看、谁能操作？没有权限时隐藏入口还是禁用并说明原因？
- \`lifecycle\` 生命周期：过期、撤销、删除后再打开会怎样？是否允许恢复？
- \`async\` 异步：等待、超时、失败分别显示什么？重试是否保留输入？
- \`interrupt\` 中断：关闭弹窗、返回或离开页面时保留什么？需不需要确认未保存内容？
- \`conflict\` 冲突：重复点击或多人同时修改时怎么办？如何避免重复提交？
- \`consistency\` 一致性：一个路径改完，其他路径何时更新？部分成功时如何保持结果可解释？

## 从回答落到情况与场景
- feature.cases: { happy: '正常完成', denied: { title: '没有权限', dimension: 'permission', priority: 'high', expected: '解释原因' } }。
- dimension 用上面的键；priority 为 high/medium/low；expected 说明预期结果。
- 每个方案的 flow(..., { cases: ['happy'] }) 引用同一份情况清单，便于比较不同方案。
- 有场景的情况自动标为 expressed；尚无场景、也无声明的情况自动 missing。
- 新增 case 后再 check：每个方案都应重新审视这个情况。

## 没有场景时声明 coverage
- option.coverage: { case_key: undecided('尚未决定的原因') }。
- missing('尚缺什么')：明确留着缺口；不能伪装成已表达。
- notApplicable('不适用的原因') / excluded('本次排除的原因')：必须有非空 reason。
- 显式声明优先于自动推导；确实需要演示的情况用场景表达。
- 不为“全部覆盖”编造业务规则。开工时没决定的行为继续提问。

flow 和 rule 的具体写法读 authoring；怎样定位覆盖诊断读 check。`,
  check: `# Joplo 检查：check

运行 npx joplo check [dir]；用 --option feature.option 缩小结构和回放范围，用 --format json 取得机器结果。
整个项目仍需编译，方案过滤不会隐藏项目级编译错误。源文件会在本机加载。

## 读输出
\`文件:行:列  级别  代码  说明\`
例如：features/invite/options/a.tsx:12:5  warning  UNBOUND_INTERACTIVE  可操作元素没有演示步骤。
- 文件与行列是修改入口；先读附近源码，只改诊断指向的那一处，不重写整页。
- error 退出 1；用法错误退出 2；只有 warning/info 时退出 0。
- 最后一行汇总 error、warning、info。修复后再次 check 验证。

## 常见代码 → 修复
- UNKNOWN_COMPONENT：从 components 选当前版本支持的名称，不自行发明组件。
- MISSING_ID / DUPLICATE_ID：给可操作元素稳定且在画面内唯一的 id，并更新相关步骤引用。
- FUNCTION_PROP：把 onClick 等回调改为 flow 步骤和状态效果。
- UNKNOWN_CASE / UNKNOWN_RULE / INVALID_REFERENCE：核对情况、规则和引用对象的键与所属方案。
- UNKNOWN_SLOT / UNKNOWN_ROUTE / UNKNOWN_LAYOUT：核对路径、布局和 Slot 声明，堆叠到确实存在的位置。
- UNKNOWN_PICK：pick 必须是本功能 options/ 下的方案文件名。
- ASSUMPTION_CONFIRMED：AI 假设保留 pending；用户确认后如实填写来源，不能只改状态。
- UNBOUND_INTERACTIVE：增加相关场景的步骤，或明确禁用并说明原因，或标记 unmodeled。
- DISABLED_WITHOUT_REASON：补充 disabledReason，说明为何不可操作。
- CASE_NOT_COVERED：补场景或如实声明覆盖状态，先问清缺失行为。
- EXPRESSED_WITHOUT_SCENARIO / COVERAGE_WITHOUT_REASON：补场景或适用/排除原因。
- RULE_ELEMENT_NOT_FOUND：核对 rule.elements 与相关方案画面里的元素 id。
- PENDING_AI_ASSUMPTION：向用户确认该假设；没有确认就保留 pending。
- EMPTY_SCENARIO：确认是否需要演示动作；只展示权限等初始状态时可保留 0 步。
- MISSING_TARGET / MISSING_SCENE：核对步骤目标及起始路径、go 跳转后的画面。
- TARGET_HIDDEN / TARGET_DISABLED：检查初始状态与前序 set 效果，确保动作在当前步骤可执行。
- NOT_INTERACTIVE / NOT_A_FIELD：选择合适组件或动作，输入动作用可接收值的组件。
- ALREADY_COMPLETED / NOTHING_TO_GO_BACK：修正 done 后的步骤，或补足返回前的路径跳转。
- LOAD_FAILED / WRONG_EXPORT / INVALID_SCHEMA：按说明修复导入、默认导出或字段结构。

用户指着某个画面元素时，先读 selection 得到精确位置。`,
  selection: `# Joplo 选中定位：selection

用户在看板指着某个元素或步骤提出修改时，运行 npx joplo selection [dir]。
它直接读取 .joplo/selection.json，不重新编译项目，省去整页搜索。

## 读结果并局部修改
- 输出 at（项目相对 文件:行:列）、标签，以及该行前后各三行带行号的源码。
- 按位置打开对应文件，只改用户指向的那一处；结合标签确认修改对象。
- 行内容已变化时，先核对当前位置；源文件或该行不存在时回到看板重新选中。
- 没有文件或内容为 null 时输出“当前没有选中”，退出 0。请用户先在看板里按住 ⌥（Alt）单击要改的元素。
- 没有 at 的对象不能靠猜测定位；在看板中选中具体元素或步骤。
- --format json 的 data.selection 保留 Selection，data.lines 给出 number/text。

## 完整工作流
改文件 → npx joplo check → npx joplo dev 在看板上看（看板已在运行时只会把项目加进去） → 用户 ⌥+单击选中 → npx joplo selection → 只改那一处。
改后再 check，保留其他方案、页面和已有用户决定。
.joplo/ 是本地运行状态，不作为设计权威源，也不提交 Git。`,
  publish: `# Joplo 发布：publish

先在看板比较情况与方案，再决定每个功能要发布哪一个。

## pick
- 在 features/<f>/feature.ts 中设置 pick: 'a'，对应 options/a.tsx；不是带功能前缀的限定 ID。
- 每个功能只发布选定的一个方案；没有 pick 的功能不发布。
- 页面与布局组成整体产品，各选定方案往路径上堆叠元素或新增路径。

## build
- 在作者项目内运行 npx joplo check，再运行 npx joplo build。
- 默认输出 dist/；用 --out-dir <dir> 指定输出位置。
- 非空输出目录会被拒绝。确认可丢弃原产物后，显式加 --overwrite 清空并重建。
- 发布站只含功能名、目标、场景演示、步骤字幕与整体布局。
- 规则来源、AI 假设、缺口、待决问题和源文件位置只属于本地创作侧。
- 这是纯静态只读演示，没有真实业务数据或后端。

## 部署
在项目目录使用自己的 Wrangler 环境和账号：
\`npx wrangler deploy --assets dist\`
按 Wrangler 的项目配置提供站点名与兼容日期；访问控制由部署侧处理。
只部署 dist 产物，不上传作者源文件。MCP、评论、协作与云端能力留到产品 V2。`,
};

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length]!;
}
