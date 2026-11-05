import { COMPONENT_TYPES, GATED_CONTAINERS, INTERACTIVE_TYPES, JOPLO_PROPS, VALUE_TYPES } from './catalog.ts';
import { JoploError } from './result.ts';

export const SKILL_TOPICS = [
  { name: 'authoring', description: '目录约定；page / layout / option / flow 的写法' },
  { name: 'demo', description: '层级、镜头、调用链与字幕：怎样做一个好演示' },
  { name: 'components', description: '当前版本的组件目录与属性' },
  { name: 'cases', description: '情况维度清单：开工前主动向用户提问' },
  { name: 'check', description: '读懂诊断，按文件和行号局部修改' },
  { name: 'selection', description: '用户在看板选中元素后，只改那一处' },
  { name: 'publish', description: 'pick、build、静态站部署' },
] as const;
export type SkillTopic = (typeof SKILL_TOPICS)[number]['name'];

const related: Record<SkillTopic, readonly SkillTopic[]> = {
  authoring: ['demo', 'components', 'cases', 'check', 'selection', 'publish'],
  demo: ['authoring', 'components', 'check', 'publish'],
  components: ['authoring', 'demo', 'check'],
  cases: ['authoring', 'check'],
  check: ['authoring', 'selection'],
  selection: ['check', 'authoring'],
  publish: ['demo', 'authoring', 'check'],
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
    '从 @joplo-app/kit/ui 导入组件；下面的名称取自当前编译器目录，不能任意添加组件。',
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
先读需要的主题，通常一次只需一两个。组件查 components，开工前的提问查 cases，演示的组织与讲法读 demo。

## 目录约定
- joplo.config.ts：export default config({ name, layout: 'app', home: '/' })。
- layouts/app.tsx：export default layout(<AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm' }}><AppShell.Navbar>…</AppShell.Navbar><AppShell.Main><Outlet/></AppShell.Main><Slot name="overlay"/></AppShell>)。
- routes/page.tsx → /；routes/members/page.tsx → /members。只支持静态路径，不支持 [id]。
- features/<f>/feature.ts：功能目标、情况、共享规则、待决问题、pick。
- features/<f>/options/<o>.tsx：一个方案、路径堆叠、初始状态和场景。
- 功能目录内可自由组织复用数据或模块，供上述文件 import。
- 数据 API 从 @joplo-app/kit 导入，组件从 @joplo-app/kit/ui 导入。
- tsconfig 使用 jsx: 'react-jsxdev'、jsxImportSource: '@joplo-app/kit'、allowImportingTsExtensions: true。

## 数据 API
- config({ name, description?, theme?: 主题名（内置 9 个或 themes/<name>.css，见 demo）, layout?, home? })。
- layout(tree)；Outlet 放当前页面，<Slot name="actions"/> 声明可堆叠的插槽。
- page({ title, layout?: string|false, viewport?: 'desktop'|'mobile' }, tree)。设备与演示画面的安排读 demo。
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
  demo: `# Joplo 好演示：demo

一步只讲一件事：用独立的层级分开视角，用镜头放大细节，用短字幕点出本步发生了什么。
基础目录、状态与 flow 语法读 authoring；这里的 layer、shot、trace、explain 从 @joplo-app/kit 导入。

## 层级是独立页面
- 在 option 中声明 layers: { client: layer('客户端视角', <ClientView/>), backend: layer('后端流转', <Diagram>…</Diagram>) }。
- layer(title, <tree/>) 带自己的 JSX 树，单独渲染并占满画面，不从同一张大页面里裁切。
- 各层共享 ui / data / inputs，切层不改变步骤；声明 layers 后演示显示这些独立页面。
- 没有自动的全景层；需要全景时自己声明 overview: layer('全景', <Overview/>)。
- 长说明放进单独的说明层，如 why: layer('设计理由', <Why/>)，再用镜头切过去讲。

## 镜头与导演
- 在步骤里写 shot(...ids)；目标可为组件、卡片、按钮或 Diagram 的节点、分组、连线。
- 每个 id 在包含它的层里解析，同名 id 可影响多个层；第一个 shot 所在的层就是导演层。
- 例：.click('app_send', shot('msg_user'), shot('app', 'biz')) 先跟随客户端视角，再给后端设置镜头。
- shot() 让当前导演层回到整层；没写镜头时沿用上一步，普通点击可跟到按钮所在层。
- 导演播放时自动切层、推近并高亮；手动切层会暂停跟随，可恢复导演或只重放某一层。
- 观众可滚轮/捏合缩放、拖动平移，用适应画面回到整体；下一步导演镜头会重新接管。

## Diagram 与调用链
- 在 <Diagram> 中用 <Diagram.Group label>、<Diagram.Node id label kind/>、<Diagram.Edge id from to label async/> 声明结构。
- Diagram.Edge 的 from/to 必须是同一张 Diagram 内的节点 id；布局自动生成，逐段出现时已有元素不移动。
- 用 trace('a','b','c') 表达 a→b→c 的调用链；不要手写节点/连线的 state 和 set 来模拟调用状态。
- 本步经过的是 active，先前经过的自动变为 ok；trace.fail('a','b') 标记失败，之后走通可恢复。
- trace.skip('a','b') 标记本次未调用的部分为 dim，不要求相连，也不移动镜头。
- trace 参数可用节点或连线 id；每段都需有对应的边，允许反向经过；同向多条边时直接写连线 id。
- trace 同时充当镜头目标，可与同一步的 shot 合并；在同一 Diagram 聚焦两个及以上节点时，自动排成紧凑的小图。
- 逐段出现用 when={$.ui.show_billing}；步骤 set($.ui.show_billing, true) 只控制出现，不替代 trace 的调用状态。

## 字幕与一屏放下
- 说明建议约 24 字以内，explain('补充说明') 约 48 字以内（英文按半个字算），超出时 check 会警告。
- 说明与 explain 显示在画面下方的字幕区，不叠在画面上；每一步只讲一件事，长内容移到说明层。
- 自动播放按文字长度停留，至少 3 秒，等镜头与连线动画完成；可选 0.5× / 1× / 1.5×。
- 不要写很长的页面再让观众滚动阅读；一屏放下，靠镜头推近看细节。
- 每个页面只有一种设备，默认电脑；page({ viewport: 'mobile' }, tree) 固定用 Phone 外框和 390 宽显示。
- 层级需要手机画面时用 layer('手机版', <MobileView/>, { viewport: 'mobile' })；需要手机版就单独做页面或演示（D44）。

## 写主题
- 主题就是一个 CSS 文件：项目根目录 themes/<name>.css，在 joplo.config.ts 写 theme: '<name>' 作为默认主题；与内置主题同名时用你的。
- 内置主题：sketch（手绘，默认）、clean、blueprint、nord、dracula、solarized-light、terminal、kraft、contrast；看板「设置 · 主题」里可以切换预览。
- 只写变量即可，自动限定在舞台里，不影响看板：--jp-font、--jp-font-mono、--jp-font-size、--jp-ink、--jp-bg、--jp-surface、--jp-subtle、--jp-muted、--jp-faint、--jp-line、--jp-line-strong、--jp-border、--jp-accent（高光）、--jp-select、--jp-info（Diagram active）、--jp-ok、--jp-warn、--jp-danger、--jp-radius、--jp-shadow、--jp-stroke（rough 手绘描边 / clean 细线）。
- 也可以写普通选择器细调（.jbox、h1 等，同样只作用于舞台）。深色主题注意 --jp-info / --jp-ok / --jp-danger / --jp-accent 与底色的对比度。
- 示例 themes/brand.css：
    :root {
      --jp-font: "Inter", system-ui, sans-serif;
      --jp-ink: #14213d;
      --jp-bg: #f7f7fb;
      --jp-surface: #ffffff;
      --jp-accent: #fca311;
      --jp-info: #2563eb;
      --jp-radius: 10px;
      --jp-stroke: clean;
    }

## 完整示例：examples/agent-arch
看 shared/arch.tsx 的 layersFor/Diagram，与 features/agent/options/a-hybrid.tsx 的 flow。
下面摘出 plan 的关键片段，省略业务规则关联；start 已在同一文件中组织用户输入与发送：
\`\`\`tsx
const plan = (f: ReturnType<typeof start>) =>
  f
    .system('Billing 额度预检', '调用模型之前，先预检额度', trace('biz', 'billing'), shot('blk_billing'))
    .system('取工具定义', '按客户端实现的版本取工具定义', trace('biz', 'registry'), shot('blk_tools'), explain('定义与实现分离'))
    .system('任务交给大脑', '任务 + 工具定义交给大脑', trace('biz', 'brain'), shot('blk_brain'))
    .system('大脑推理', '大脑调用 Bedrock 规划下一步', trace('brain', 'llm'));
\`\`\`
同一示例还包含额度不足、危险工具确认、端侧掉线与计费重试；按需求选场景，不只演示顺利路径。`,
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

## 按产品类型的预设
开工前先按产品类型挑出相关情况来问用户，不要照单全收；下面是提问种子，不是已经确认的产品规则。

### 表单 / CRUD / 权限（来源：examples/invite）
- no_permission · permission · 非管理员操作时怎样阻止并解释。
- invalid_input · input · 输入为空或格式无效时就地提示。
- revoked · lifecycle · 撤销后再次打开时如何处理。
- expired · lifecycle · 过期后访问时展示什么。
- already_exists · conflict · 对象已存在时如何反馈。
- duplicate_submit · conflict · 连续点击提交时避免重复创建。
- request_failed · async · 请求失败后保留输入并允许重试。

### Agent / AI 产品（来源：examples/agent-arch）
- quota · permission · 额度不足时在调模型之前拦下。
- dangerous_tool · permission · 危险工具执行前由用户确认。
- hand_offline · async · 执行工具的一端掉线或超时时如实处理失败。
- local_data · main · 需要访问用户本机数据时如何执行。
- tool_version · consistency · 工具定义升级但实现仍为旧版本时怎么办。
- usage_retry · async · 计费事件投递失败后重试并保证幂等。
- model_failed · async · 模型调用失败或超时时怎样反馈和恢复。

### CLI / 开发者工具（来源：examples/joplo-dist）
- first_run · main · 从零开始，三条命令内跑通。
- env_old · input · 运行环境版本过低时给出修复方法。
- version_skew · consistency · 全局与项目内版本不一致时提示对齐。
- optional_dep · async · 可选依赖缺失时只影响相关命令。
- dir_not_empty · conflict · 目标目录已有文件时不直接覆盖。
- typo · input · 子命令或参数拼错时提示最接近的那个。
- user_modified · conflict · 不覆盖用户改过的文件。
- offline · async · 没有网络时如何说明限制和恢复。

### 本地工具 / 多项目（来源：examples/joplo-board）
- first_open · main · 第一次打开且没有任何数据时给出开始入口。
- single_instance · conflict · 已有实例在运行时不再起第二个。
- stale_resource · lifecycle · 记住的目录或资源已不存在时如何清理记录。
- one_broken · consistency · 某个项目出错时其他项目照常使用。
- public_view · consistency · 公开视图隐藏私有路径、缺口和错误。
- recent · main · 打开过多个项目时能在首页切换。

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

flow 和 rule 的具体写法读 authoring；怎样定位覆盖诊断读 check。
移动端暂无示例；需要手机版时单独做演示（D44）。`,
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
- NOT_PICKED：功能未选方案所以不会发布；比较后为 feature.pick 填写选定方案文件名。
- ROUTE_EXISTS：方案 routes 与已有路径重复；改用 on 堆叠或选择新路径。
- BAD_ROUTE：路径没有以 / 开头；改为绝对的静态产品路径。
- DUPLICATE_ELEMENT：同一画面内元素 id 重复；只改冲突 id 并同步相关引用。
- CAPTION_TOO_LONG：本步说明过长；缩到约 24 字以内，一步一件事，长内容放说明层，见 demo。
- EXPLAIN_TOO_LONG：explain 过长；缩到约 48 字以内，详细理由放独立说明层，见 demo。
- SHOT_UNKNOWN：镜头目标不在本步画面或任何层级里；核对目标 id 和所属层，见 demo。
- LAYER_UNKNOWN：层级键不合法或 layer 缺少内容；键用字母/数字/下划线/连字符且不以 @ 开头，并提供非空 JSX。
- TRACE_UNKNOWN：调用链为空、id 不存在、跨 Diagram 或路径不连通；使用同一张 Diagram 中已连接的节点/连线 id。
- TRACE_AMBIGUOUS：两个节点间有多条候选连线；在 trace 中改写为具体的连线 id。
- THEME_UNKNOWN：config({ theme }) 写的主题既不是内置主题也没有 themes/<name>.css；改成内置主题名，或补上这个 CSS 文件，见 demo 的“写主题”。
- UNKNOWN_DIAGRAM_NODE：Diagram.Edge 的 from/to 不指向本图节点；修正端点为该 Diagram 内的节点 id。
- ELEMENT_PROP：组件属性传入了 JSX 元素；图标改成字符串如 leftSection="+"，内容放到子节点。
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

## 发布站怎样演示
- 发布站和本地看板布局相同，只去掉规则、缺口、源码位置等创作侧信息。
- 层级切换、导演跟随、只重放某一层、镜头聚焦与字幕在发布站都可用；具体写法读 demo。
- 发布站也支持全屏：F 进入/切换全屏，空格播放/暂停，←/→ 上一步/下一步，Esc 退出。
- 全屏只保留画面和字幕，播放控制浮在下方并自动隐藏。
- 本地和发布站均可导出图片；导出视频只在本地，依赖本机 Playwright/Chromium。

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
