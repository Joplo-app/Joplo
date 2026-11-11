# 写法 v2 提案：行为放回界面，接入产品自己的组件

状态：**提案；第一步（元素 onClick + 本地层跳页面）与第二步（mock / response）已实现，见 DECISIONS.md D109**（2026-11-11）。其余部分未实现；`authoring-v2/invite/` 是按新写法改写的 `examples/invite`，用的 API 还不存在，不能编译。

背景：Joplo 的重点收到“TSX 代码 → 可交互 / 互动的演示”，视频方向冻结。对照裸 HTML、Storybook 这类做法，现在的写法有两个根上的问题：观众接管时能做的事很少，也用不了产品自己的组件。

## 1. 现在的问题

1. **行为写在剧本里，不在界面上。** 按钮自己没有行为，点下去会怎样写在每个切片的步骤里：`.click('btn_invite', '…', set($.ui.inviteOpen, true))`。
   - 同一次点击要在每个切片里重写一遍效果，靠 `fillAndSend`、`sent` 这类辅助函数去重。
   - 观众接管时，只能做剧本的下一步，或者 `work.free` 里另外声明过的反应。`free` 只能用 set / push / toast，不能跳页面。`examples/invite` 没写 `free`，所以接管后除了剧本的下一步，别的都点不了。
   - 技能里专门有一条坑："scripted action 和 free reaction 要共用同一个 state patch"。
2. **用不了产品自己的组件。** 作品里只能放插件组件。作者写的函数只在编译时展开成 IR 节点，不会作为真组件运行。要用产品的 `Button` 就得包成插件：`definePlugin`、运行时、单独打包、启用，而插件接口还在实验阶段。演示因此不像自己的产品，方案定下来以后界面也带不进实现。
3. **一个画面散在两处，靠字符串拼。** 页面留出 `<Slot name="header.actions" />`，作品写 `on['/members']['header.actions']`，IDE 跳不过去，拼错只能等 `check` 报。作品也不能自己写一个 `routes/` 里已有的路径（`ROUTE_EXISTS`，`packages/core/src/compile.ts:166`）。
4. **同一件事写好几遍。** 功能的 `constraints` 和 `rules` 内容重复（invite 里 admin_only、revocable、role_cap 各写两遍）；一个待定问题要写在 `cases`、`questions` 和每个方案的 `coverage.undecided` 三处。

## 2. 不变量（实现时按这些自检）

- **I1** 跳步、深链、截图、视频、`stateAt` 只读 IR，**绝不运行**用户组件代码或事件处理函数。
- **I2** 同一个元素的同一个事件，在剧本里和在接管时产生**同一组**业务效果，只有一个来源。
- **I3** 接管造成的变化只在本地层；播放、跳步、换切片、重置之后完全消失，时间线状态不变。
- **I4** 剧本操作的每个元素在 IR 里都有 id。用户组件没把 id 转发到 DOM 时有诊断，不会悄悄失效。
- **I5** 剧本里每调用一次 mock，恰好展开成一个系统步骤。结果按切片的 `api` 选项依次取，次数不够时报错，不会悄悄重复使用最后一个结果。

## 3. 作者看到的变化

| | 现在 | 提案 |
|---|---|---|
| 行为 | 写在步骤效果里，另外再写 `work.free` | 写在元素的事件上（`onClick={[…]}`）；步骤只写动作和旁白；作者 API 去掉 `free` |
| 系统响应 | 手写 `.system()`，靠共享数组去重 | `mock()` / `response()` 只写一次；元素事件里引用；切片用 `api: { sendInvite: ['timeout', 'ok'] }` 挑结果 |
| 产品组件 | 只能包成插件 | `adopt(Component, { as })` 登记，写进 `config.components`；`config.wrapper` 放 Provider |
| 页面拼装 | 往 `routes/` 的页面里填字符串插槽（`on`） | **作品拥有整页**：`routes: { '/members': page({…}, <MembersPage actions={…} />) }`。共用的骨架写成普通函数组件，按参数传入（kit 现在就会在编译期展开）。作者 API 去掉 `on` 和 `<Slot>` |
| 功能 | `constraints` + `rules`；`cases` + `questions` + `coverage.undecided` | 只有 `rules`；待定问题写成情况上的 `open: '…'`，所有方案自动算作 undecided |
| 引用 | 字符串 `cases: ['happy']` | 作品里写 `invite.cases.happy`，有类型；功能文件内部仍用字符串，由 `check` 校验 |
| 切片的 `expected` | 必写 | 可省略，缺省继承情况。情况写需求，切片写这个方案的具体结果，两者层级不同，所以仍然允许写 |

剧本步骤仍然可以写效果，用于镜头、旁白、`done()`、跳页面，也作为逃生口。如果某个元素的事件里已经写了同一个路径，再在步骤里写就警告。

## 4. `adopt()` 契约

```ts
export const TextField = adopt(ds.TextField, { as: 'input', text: ['label', 'placeholder', 'hint'] });
```

`as` 决定三件事：接受哪些动作，回放时引擎怎么驱动它，哪个 prop 是值、哪个是事件。

| as | 状态进 | 事件出 | 对应动作 |
|---|---|---|---|
| `button` | `disabled` | `onClick` | click |
| `input` | `value`（绑定 `$` 路径） | `onChange(value)`：自动写回绑定路径，作者写的 onChange 效果附加在后面 | type |
| `select` | `value`、`options` | 同上 | select |
| `toggle` | `checked` | `onChange(checked)` | click / toggle |
| `dialog` | `open` | `onClose` | close（点遮罩、Esc） |
| `custom` | 作者列出的 props | `events: { onPick: { value: 'string' } }` | 插件动作 `app:<组件>.<事件>`，剧本里写 `.act(id, 'onPick', { value })` |

- **回放时**引擎只按 IR 状态给组件传 props，不调用组件的回调（I1）。**接管时**组件调用回调，引擎把它送进现有的仲裁器（剧本的下一步 → 同一舞台上能到达的其他切片 → 本地层），再按事件上写的效果执行。
- 组件要把 `id`（以及其余 `data-*`）转发到根 DOM。不转发时，引擎包一层带 `data-jid` 的容器并给出诊断（I4）。
- 组件内部的 `useState`（悬停、展开动画）可以保留，但只算本地状态，跳步时丢掉。要让剧本和检查用到的状态必须走 props。
- 节点类型的 prop（例如 `footer`、`children`）由宿主渲染成 React 节点后再传入，沿用插件的 `ctx.renderChildren`。
- `text` 列出要翻译、要进大纲的文字 prop；`children` 里的文字缺省就算。
- 组件里直接发请求、读全局 store 的，不在支持范围；用 `wrapper` 注入模拟的客户端。

## 5. 编译到 IR：字段从写入到消费

除了路由（E7），尽量不改 IR。`FreeReaction.effects` 在 schema 里本来就允许任意效果，只能用 set / push / toast 是运行时的限制。

| 作者写的 | 编译成 | IR 位置 | 读取方 / 消费者 |
|---|---|---|---|
| 元素事件 `onClick={[…]}` | 每个（元素, 事件）一条本地反应；剧本中针对这个元素的步骤，效果 = 事件效果 + 步骤自己写的效果 | `Work.free`、`Step.effects`（已有） | 舞台仲裁器（接管）、`stateAt`（回放与深链） |
| `api.x`（mock） | 剧本里：在调用它的步骤后面插一个系统步骤；本地层：缺省结果 | `Step`（已有）、`Work.free[…].effects` | 同上 |
| `adopt()` 组件 | 节点类型 `app:<名字>`；由 config 合成一份插件清单 `project.plugins.app`（组件特性、动作） | 节点树、`project.plugins`（已有） | `PluginHost` 用 React 渲染（已有路径），编译器做 id 与动作校验 |
| 作品的整页 `routes['/members']` | 按作品区分的路由：同一路径在不同作品里各有一份；作品没写的路径用 `routes/` 里的项目页面 | `Route` 现在以路径为键、只有一个 `addedBy`（`schema.ts:265`），**要改**，公开 IR 升 `SCHEMA_VERSION` | 舞台按当前作品选页面；`go()`、导航、深链按作品解析路径 |
| `case.open` | 问题，加上每个方案的 `coverage: undecided`（basis: derived） | 已有字段 | 看板覆盖、`check` |
| `rules` 合并 `constraints` | `Feature.constraints` 由 `confirmed` 规则推出，或者直接删掉 | 删掉的话，公开 IR 升 `SCHEMA_VERSION`，joplo-cloud 跟着改 | 看板、发布站 |

## 6. 引擎要改的地方

- **E1 本地层**：接管时支持 `go()` 跳页面和 mock 的缺省结果，这样链接、导航、请求在接管时都能用；播放、跳步、重置时照旧丢弃（I3）。这是语义变化：本地层从"零星的反应"变成"一次真正的原型会话"。
- **E2 kit 的 JSX 运行时**：遇到 `adopt()` 登记过的函数时不调用它，生成 `app:` 节点；节点类型的 prop 照样收进树里。
- **E3 打包**：产品组件按 React 的 JSX 编译，作品文件仍按 `@joplo-app/kit` 的 JSX 编译，两者按路径分开。看板走 Vite，发布站走现有的 `bundlePluginRuntimes`；CSS 跟着组件一起打包；`wrapper` 包在舞台外面。路径别名、Tailwind 等产品的构建配置是最大的风险，见待定 Q3。
- **E4 编译器**：合并元素事件和步骤效果；展开 mock；处理 `case.open`、合并后的规则；做类型引用的解析。
- **E7 作品拥有整页**：去掉 `ROUTE_EXISTS`。作品写了与 `routes/` 相同的路径，就整页替换项目页面；没写的路径沿用项目页面（例如 invite 的 `/settings`）。路由在 IR 里按作品区分，`collectSlots` 和插槽堆叠删掉，布局里的 `<Slot>` 一起删。同一功能下的其他方案、选定方案的发布范围，沿用现在 `routesIn` 的规则。
- **E5 新检查**：
  - `STEP_TARGET_DISABLED`：剧本在按钮禁用时点了它。
  - `STEP_NO_EFFECT`：点击了一个既没有事件、步骤里也没写效果的元素。
  - `MOCK_OUTCOME_UNUSED`：某个结果没有任何切片用到，等于有一种情况没演。
  - `MOCK_OUTCOMES_EXHAUSTED`：切片的 `api` 选项不够用（I5）。
  - `STATE_NEVER_SET`：`when` 读的路径从没被写过。
  - `ADOPT_ID_NOT_FORWARDED`：组件没把 id 转发到 DOM，渲染时检查（I4）。
- **E6 ui 插件**：ui 插件的组件也接受同样的事件 props 和 `value` 绑定，跟 `adopt()` 组件写法一致。

## 7. invite 改写对比（`authoring-v2/invite/`）

| 文件 | 现在 | 提案 |
|---|---:|---:|
| joplo.config.ts | 9 | 15 |
| features/invite/feature.ts | 31 | 29 |
| sample.ts → api.ts（样例数据 + mock） | 7 | 35 |
| works/a-modal.tsx | 143 | 131 |
| works/b-batch.tsx | 73 | 66 |
| routes/members/page.tsx → shared/members-page.tsx | 35 | 40 |
| layouts/app.tsx | 23 | 22 |
| components.ts（登记产品组件） | – | 11 |
| **合计** | **321** | **349** |

`design-system/` 模拟产品本来就有的组件，不计入。

**总行数没有变少。** 多出来的是组件登记、mock 和注释。变化在这几处：

- 剧本步骤里的业务效果：a-modal 从 10 处变成 0 处，全部在元素事件和 mock 上（I2）。
- 接管时能用的交互：从"只有剧本的下一步"变成"所有带事件的元素"，包括取消、关闭弹窗、菜单、导航、批量页的跳转。
- 未建模的元素：a-modal 从 5 个变成 3 个。取消按钮、撤销弹窗的取消、导航现在都能点。
- 按钮、输入框、下拉、弹窗来自"产品"自己的组件；表格、版面仍然用 ui 插件，两者可以混用。
- 方案 A 的成员页长什么样，在它自己的 `routes['/members']` 里一处就能看到；共用骨架 `MembersPage` 是普通函数组件，参数有类型，IDE 能跳转。

## 8. 待定

- ~~Q1 页面~~：**已定（2026-11-11）：作品拥有整页**（见 E7）。代价是路由在 IR 里要按作品区分，公开 IR 升版本。
- **Q2 接管时的 mock 结果**：观众自己点「发送邀请」时，没有剧本告诉引擎这次请求成功还是失败，缺省用第一个结果（ok）。要不要在看板和发布站给评审者一个切换下一次请求结果的开关（类似浏览器开发者工具里的网络模拟）？这对评审有用，但它是新界面，要先做设计；不做的话，想看失败就切到「发送失败后重试」那个切片。
- **Q3 构建配置**：复用产品仓库的 `vite.config` 和 tsconfig 的 `paths`，还是在 Joplo 配置里另外写 `vite` 选项？
- **Q4** `as` 的第一批种类是否就按第 4 节那六种。
- **Q5** 内容讲解类作品（已冻结）要不要也迁移，还是只做机械替换、保证能编译？

## 9. 迁移范围

- 全部示例：invite 先迁，其余随后。
- 独立仓库里的模板（`joplo-templates`），要手动更新。
- `packages/core/src/guide.ts` 的 authoring、demo、cases 主题，ui 插件技能，然后运行 `pnpm skills:build`。
- `docs/work-model.md`、README 里的代码片段。
- 公开 IR 升版本（路由按作品区分，可能还有删掉 `Feature.constraints`），joplo-cloud 跟着改。

## 10. 建议的实施顺序

1. **E1 + E2 + E4 元素事件**，先只用 ui 组件；迁移 invite，验证 I1–I3。这一步单独就能让接管变成真原型。
2. mock / response（I5）。
3. `adopt()`、E3 打包、`wrapper`；用 `design-system/` 跑通，验证 I4。
4. 作品拥有整页（E7，含 IR 升版本与 joplo-cloud）、合并功能字段、类型引用。
5. E5 检查；迁移其余示例、技能、模板。
