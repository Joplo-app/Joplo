import { COMPONENT_TYPES, JOPLO_PROPS } from './catalog.ts';

/** 精简作者协议；组件名直接来自编译器目录，避免 CLI 文档与实际支持范围漂移。 */
export function guide(): string {
  return `Joplo 创作速查（TSX → IR v2 → 本地看板 / 静态站）
目录约定
  joplo.config.ts：export default config({ name, layout: 'app', home: '/' })
  layouts/app.tsx：export default layout(<main><Outlet/><Slot name="overlay"/></main>)
  routes/page.tsx：export default page({ title: '首页' }, <Slot name="actions"/>)
  routes/members/page.tsx → /members；只支持静态路径，不支持 [id]。
  features/<f>/feature.ts：功能、情况、共享规则、问题、pick。
  features/<f>/options/<o>.tsx：方案、堆叠元素、状态、场景。
  功能目录中的其他 TS 模块可自由 import；权威源是文件，版本交给 Git。
导入
  数据 API：@joplo/kit；组件：@joplo/kit/ui。
  tsconfig：jsx: 'react-jsxdev'，jsxImportSource: '@joplo/kit'，allowImportingTsExtensions: true。
kit API
  config({ name, description?, theme?: 'sketch'|'clean', layout?, home? })
  layout(tree)；Outlet 放页面，Slot({ name }) 声明供方案堆叠的插槽。
  page({ title, layout?: string|false, viewport?: 'desktop'|'mobile' }, tree)
  feature({ name, goal, cases, roles?, constraints?, rules?, questions?, pick? })
  cases: { happy: '正常情况', denied: { title, dimension, priority, expected } }
  dimension: main/input/permission/lifecycle/async/interrupt/conflict/consistency。
  pick: 'a' 表示选择 options/a.tsx；build 只发布选定方案，无 pick 的功能不发布。
  option({ name, idea, on?, routes?, state?, rules?, questions?, coverage?, scenarios })
  on: { '/members': { 'header.actions': <Button id="invite">邀请</Button> } }
  routes: { '/members/new': page({ title: '新增' }, <div/> ) } 新增路径。
  state: { ui: { open: false }, data: {}, inputs: {} } 是方案初始状态。
  scenarios: { happy: flow('成功', { cases: ['happy'], start: '/members', state?, mock?, outcome?, expected? })... }
flow 步骤（返回自身，可链式调用）
  .click(id, ...args)；.type(id, value, ...args)；.select(id, value, ...args)
  .toggle(id, boolean, ...args)；.back(...args)；.system('模拟事件', ...args)
  args 中的字符串是字幕，可省略；其余参数是下面的效果。
  set($.ui.open, true)：替换状态；push($.data.rows, row)：追加数组项。
  toast('提示') / toast.success/error/info('提示')：当前步骤提示。
  go('/members')：在当前方案上下文里切换路径；back 回到前一路径。
  done('结果', 'success'|'failure'|'cancelled')：结束场景；默认 success。
  uses('rule_key', ...)：关联本方案或本功能的规则。
绑定与条件
  $.ui.x / $.data.x / $.inputs.x：整值绑定，不做任意表达式求值。
  when={$.ui.open}；disabled={not($.ui.isAdmin)}；open={$.ui.open}。
  not(x)、eq(x, value)、neq(x, value)、empty(x)、notEmpty(x)、oneOf(x, values)、and(...xs)、or(...xs)。
规则、问题和覆盖
  rule('约束', { origin?, status?, cases?: ['happy'], elements?: ['invite'] })
  origin: user/project_material/ai_assumption/code_observed/feedback；默认 ai_assumption。
  status: pending/confirmed/conflict/out_of_scope；默认 pending。
  question('待决定的问题', { severity?: 'blocker'|'major'|'minor', refs?: ['happy'] })
  coverage: { case_key: undecided('原因') / missing('原因') / notApplicable('原因') / excluded('原因') }
  有场景的情况自动 expressed；其余自动 missing；显式 coverage 声明优先。
  notApplicable / excluded 必须说明 reason；新增 case 后立即 check 查看各方案缺口。
组件目录（shadcn 同名同参，含 AI Elements、HTML 和 Joplo 占位组件）
${chunks(COMPONENT_TYPES.filter(n => n !== '#text'), 8).map(names => `  ${names.join(' / ')}`).join('\n')}
Joplo 专用属性
  ${JOPLO_PROPS.join(' / ')}。
  可操作元素必须有 id；when 控制出现条件；disabledReason 解释禁用。
  unmodeled 表示本版未建模；note 记录作者备注；发布时去掉备注与源位置。
硬性边界
  AI 假设不能标为已确认；只有用户确认后才能如实修改 origin/status。
  行为只写在 flow 里，不写 onClick 或其他函数属性；TSX 只收集为数据。
  作者模块会在本机加载/构建时执行；只运行可信项目。
推荐工作流
  改文件 → joplo check [dir] → joplo dev [dir] 在看板上看。
  用户指着元素 → joplo selection [dir] 取得 文件:行:列 与附近源码 → 只改那一处。
  选定 pick → joplo build [dir] → wrangler deploy dist。
  check --option feature.option 缩小诊断；--format json 供机器读取。
`;
}
function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
