# Joplo 方案工作区（M0）：web 与本地服务

本文说明 `packages/web`（方案工作区、低保真渲染、演示运行时）和 `packages/server`（本地服务、渲染截图）。

## 启动

```bash
pnpm install
pnpm web:serve                       # 打开 examples/invite，地址 http://127.0.0.1:4790/
pnpm web:serve path/to/project --port 4800 --open
```

- 服务启动时会检查 `packages/web/dist`。产物缺失、或比 `packages/web/src` / `packages/core/src` 旧时，自动执行 `vite build`（约 1 秒）。构建失败会给出明确报错和手动命令 `pnpm --filter @joplo/web build`。
- CLI（`joplo serve`、`joplo render`）直接调用 `@joplo/server` 导出的 `startServer` / `renderStep`，签名与脚手架桩保持兼容，只追加了可选字段：
  - `ServeOptions`：`skipBuild`、`log`；
  - `RenderOptions`：`overwrite`、`scale`。
- 开发界面时可用 `pnpm web:dev`。Vite 会把 `/api` 代理到 `JOPLO_API`（缺省 `http://127.0.0.1:4790`）。dev 页面拿不到本地令牌，所以“选中”无法写回，会显示提示。

## 界面与交互

| 区域 | 内容 |
| --- | --- |
| 顶栏 | 项目名 / 功能名 / 方案选择 / `rev_N`（绿点表示实时刷新已连接）；**审阅 / 演示**模式切换，旁边文字说明点击的含义；手绘 / 线框主题；常驻“概念原型 · 非正式实现”。 |
| 左栏 | 场景列表，每个场景带模拟标签（“模拟成功”“模拟失败后重试成功”……）和步数。情况覆盖分五种芯片：已表达、待决定、缺失、不适用、已排除。缺失和待决定的情况用色块标出并显示原因（没写原因时也会明说）；点“已表达”的情况会跳到对应场景。说明文字强调“已表达 ≠ 业务已确认”。 |
| 舞台 | desktop 画框 1280×800、mobile 手机外框 390×844，都按比例缩放。覆盖层包含：鼠标指针、点击波纹、下一步目标的橙色虚线聚焦框、步骤字幕、“系统事件”标记、“示例输入”标记，以及就地提示气泡。审阅模式下画框外圈为紫色。 |
| 步骤栏 | 重置 / 上一步 / 自动播放·暂停·继续 / 下一步；当前步骤字幕与“下一步：…”；模拟结果标签。步骤芯片中，圆角实线是用户动作，虚线方角是系统事件，橙色表示下一步。场景完成后显示完成横幅（结果 + 文案 + “这是模拟结果”）。 |
| 检查器 | **未选中**：功能目标、角色、硬约束、方案核心思路、设计决策和取舍、规则（来源 + 确认状态；AI 假设用虚线琥珀色框和 ⚠ 标出）、未关闭的问题。**审阅模式选中元素后**：类型、标签、`scene#node` 引用（可复制）、当前可见或禁用、是否未建模、设计说明、禁用原因、关联规则（`rule.elementRefs`）、以它为目标的步骤（本方案所有场景）、关联情况。 |

**审阅模式**

- 点击元素只选中，同时 `PUT /api/selection` 写入 `.joplo/selection.json`，并提示“已选中「X」，可以在 Agent 会话里说要改什么”（D15）。
- 点击步骤芯片会跳到该步之后，并选中这个步骤（`nodeId: null`）。

选中内容格式如下：

```json
{ "optionId": "opt_a", "scenarioId": "sc_a_success", "position": 1, "stepId": "a_s1_open",
  "sceneId": "scene_a_members", "nodeId": "sel_role", "at": "2026-11-05T…Z" }
```

`stepId` 是产生当前画面的步骤（`steps[position-1]`），初始状态为 `null`。它与 `renderStep({ stepId })` 的语义一致，Agent 可以据此复现用户看到的画面。

**演示模式**

点击的含义完全由 core 的 `explainClick` 决定：

- `advance`：执行这一步，带波纹和动画。type/select 步骤会把步骤里的示例值逐字填入，并标“示例输入”。紧跟在用户动作后面的系统事件会自动执行（停留约 0.9 秒，显示“系统事件”标记）。
- `disabled`：就地气泡显示 `disabledReason`。
- `unmodeled` / `not_covered`：提示“当前演示未覆盖此操作：「X」”，并提供“回到演示”按钮。
- `out_of_order`：提示“按当前场景，下一步是：…”。
- `static`：不响应。

**自动播放**

- 每步先用 Motion 把指针移到目标中心（按 `data-jid` 测量），再出现波纹，输入动作逐字出现，然后调用 `applyStep`。
- 时长来自固定逻辑时钟（`runtime/demo.ts` 的 `TIMING`），暂停期间不计时。
- 在 `prefers-reduced-motion` 下不移动指针、不逐字输入，直接切换状态。

**快捷键**：`←` / `→` 逐步，空格键播放或暂停（焦点在舞台内时不生效）。

**状态来源唯一**：手动、逐步、自动三种方式都只通过 `initialState` / `stateAt` / `applyStep` 推进（`runtime/demo.ts` 中只有 `commit()` 一处调用 `applyStep`）。“上一步”使用 `stateAt(position-1)`。动画被取消时不会推进状态；动画还没结束时如果再次操作，会先把那一步提交完。

**切换场景**会重置到该场景的初始数据，并提示“已切换到「X」，数据已重置”。

**实时刷新**

- 收到 SSE 推送的修订后重新拉取项目。场景仍然存在时保留场景和位置，越界时夹到合法范围；选中保留，元素不存在时检查器会说明。
- 项目文件不合法时，显示红色横幅和前 5 条 schema 问题，同时继续显示上一个有效修订，不会白屏。
- 回放失败时显示橙色横幅，并停在能到达的最后位置。

## 渲染器

`src/renderer/components.tsx` 为目录中 32 个组件各提供一个实现：

- 根 DOM 带 `data-jid`、`data-jtype`、`data-jlabel`；可交互组件还带 `data-jinteractive`，禁用时带 `data-jdisabled` 和 `aria-disabled`。
- 属性用 `resolveProps` 解析，可见性用 `isSelfVisible`，禁用用 `isNodeDisabled`。输入类组件显示 `state.inputs[id]`。
- Button、Badge、Input、Textarea、Checkbox、Switch、Progress、Avatar、Table 基于 shadcn/ui；Select 只画出闭合状态，并列出可选值，不弹出下拉。
- Dialog 通过 React portal 渲染到**舞台内**的弹窗层，带遮罩，不挂到 `document.body`。
- Toast 放在舞台内的 Toast 层；如果与下一步目标重叠，会依次换到右上、底部居中、左下、左上。
- Custom 渲染成虚线占位框：“自定义组件：{kind}（演示占位）”。
- 手绘主题：Rough.js 描边，种子为 `FNV-1a(node.id)`；字体为 Excalifont + 小赖（本地 woff2 子集，按 unicode-range 按需加载，不访问 CDN）。线框主题：1px 边框和系统字体。
- 所有文本都通过 React 文本节点渲染，不使用 `dangerouslySetInnerHTML`。

## 渲染专用路由与 renderStep

- `/?render=1&scenario=…&position=…&theme=sketch|clean`：只渲染舞台，固定尺寸，不播放动画。等 `document.fonts.load/ready` 完成、所有 rough 图形首次绘制完成后，才设置 `window.__JOPLO_READY__ = true`，同时暴露 `window.__JOPLO_STATE__`。出错时设置 `__JOPLO_ERROR__`。工作区页面也会暴露 `__JOPLO_STATE__` 和 `__JOPLO_UI__`，供测试使用。
- `renderStep(opts)` 的流程：
  1. 用 `positionAfterStep` 换算位置，用 `stateAt` 校验回放；
  2. 在临时端口启动服务，用 Playwright chromium 截取 `[data-joplo-stage]`；chromium 不可用时退回系统 Chrome；
  3. 返回元素索引：DOM 中的元素都有 box；场景树中没有渲染的节点也会列出，`visible: false`。
- 渲染告警：
  - 可见的可交互元素中心点被其他元素覆盖（弹窗遮罩覆盖背景属于预期层次，不报）；
  - 超出画框；
  - 标签文字溢出（`scrollWidth > clientWidth`）；
  - Toast 与下一步目标重叠；
  - 手写字体未加载或字体文件加载失败；
  - 下一步目标没有显示。
- 目标文件已存在且没有传 `overwrite: true` 时拒绝写入。

## 本地服务安全

- 只绑定 `127.0.0.1`，传其他 host 会直接报错。
- 每个请求都校验 `Host`（`127.0.0.1:端口` 或 `localhost:端口`），防止 DNS 重绑定。
- 写接口 `PUT /api/selection` 要求：
  - 带 Origin 时，Origin 必须是本服务；
  - `Content-Type: application/json`；
  - `x-joplo-token` 与启动时生成的令牌一致（以 `<meta name="joplo-token">` 注入 index.html，用常量时间比较）；
  - 请求体不超过 64KB，并通过 zod 严格校验。
- 写入方式是临时文件 + rename。
- 服务**不写** `project.joplo.json`：`PUT /api/project` 返回 405。
- 静态文件限制在 `dist` 目录内（会解析 realpath）。响应带 CSP（`script-src 'self'`）、`nosniff`、`X-Frame-Options: DENY`。

API：`GET /api/project` → `{ revision, project }`（不合法时 422，包含 `issues`）；`GET /api/events`（SSE，监听项目目录，120ms 防抖，事件 `revision`）；`GET` / `PUT /api/selection`。

## 测试

```bash
pnpm test         # vitest：core 播放器 + server 单元测试（loadProjectFile / SelectionSchema / 原子写入）
pnpm test:e2e     # Playwright：全部浏览器测试，每个测试都使用 examples/invite 的临时副本
pnpm docs:screenshots   # 重新生成 docs/screenshots/
```

浏览器测试覆盖：

- AC-02、03、04、05/19、20；
- 越序点击、静态元素；
- 审阅选中写入 selection.json；
- 实时刷新与不合法文件；
- 没有方案时的空状态；
- 主题切换；
- reduced-motion；
- AC-22 渲染告警为空（3 个位置 × 2 种主题）；
- 文字溢出告警；
- 拒绝覆盖已有文件；
- 安全：错误 Host、无令牌、错误令牌、跨源请求、非法请求体、路径穿越、不写项目文件；
- 只监听 127.0.0.1。

## 截图清单（docs/screenshots/）

| 文件 | 内容 |
| --- | --- |
| `success-0-initial.{sketch,clean}.png` | 成员页初始状态（AC-22） |
| `success-1-dialog-open.{sketch,clean}.png` | 邀请弹窗打开，背景有遮罩（AC-22） |
| `success-3-filled.{sketch,clean}.png` | 邮箱和权限已填 |
| `success-5-toast.{sketch,clean}.png` | 成功 Toast，待接受列表多一行（AC-22） |
| `failure-5-error.{sketch,clean}.png` | 发送失败，显示行内错误，输入保留 |
| `denied-initial.{sketch,clean}.png` | 普通成员：禁用入口和说明 |
| `workspace-demo-initial.png` | 工作区全貌（演示模式） |
| `workspace-demo-autoplay-typing.png` | 自动播放中：指针、字幕、“示例输入”逐字填入 |
| `workspace-demo-success-complete.png` | 场景完成横幅 + Toast |
| `workspace-demo-failure-error.png` | 失败场景中的系统事件结果 |
| `workspace-demo-denied-disabled-reason.png` | 点击禁用按钮，就地显示原因（AC-05） |
| `workspace-demo-uncovered.png` | 点击未建模的“空间设置”：当前演示未覆盖 + 回到演示（AC-19） |
| `workspace-review-selected.png` | 审阅模式选中“发送邀请”，检查器显示引用、规则、步骤、情况 |

## 已知限制

- 舞台是固定尺寸的画框，内容超出画框高度时会被裁掉，并在渲染时报“超出画框”告警（只针对可交互元素），不支持滚动。
- Select 只显示闭合状态和可选值，不弹出下拉；Tabs、Radio、Checkbox、Switch 的值只由步骤写入，手动点击它们时按 `explainClick` 的结果处理。
- 弹窗打开时，背景被遮罩挡住，不能点击：审阅模式下要选背景元素，需要先回到弹窗打开前的步骤。
- 演示模式下，用户动作后面紧跟的系统事件会自动执行，用来模拟请求返回。场景以系统事件开头时，需要按“下一步”或“自动播放”。
- Switch 和 Spinner 在手绘主题下仍使用 shadcn 或 CSS 的外观，没有 rough 描边。
- 字体文件约 12MB（205 个 Xiaolai 子集 + 7 个 Excalifont 子集），直接提交在 `packages/web/src/fonts/`，运行时只加载用到的子集。重新生成方法：`node packages/web/scripts/extract-fonts.mjs <@excalidraw/excalidraw 0.18.1 解包后的 package 目录>`。
- 渲染专用路由每次截图都会启动一个临时服务和一个浏览器（约 0.3 秒/张），还没有做复用。
- 服务端对项目只做 zod schema 校验，不做引用完整性校验（那是 core validate 的职责）；回放失败会在界面上提示。
- 产品地图、多方案比较、评论线程、导出、Decision 本轮都没有实现，也没有放假入口。
