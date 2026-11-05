# Joplo 看板、发布站与截图

本文说明 `packages/web`（看板界面、发布站界面、低保真渲染器、演示运行时）和 `packages/server`（`startDev`、`buildSite`、`renderStep`）。接口定义见 `packages/server/src/contract.ts`，CLI 只依赖这三个函数。

## 启动

```bash
pnpm install
pnpm web:serve                          # 用 startDev 打开 examples/invite：http://127.0.0.1:4790/#/<项目>
pnpm web:serve path/to/project --port 4800 --open
```

`joplo dev` / `joplo build` / `joplo render` 由 CLI 调用同一组函数。

## `startDev`：一个进程，多个项目（D39）

同一台机器（同一个 `JOPLO_HOME`）只运行一个看板进程。

- **再次 `joplo dev`**：读 `<JOPLO_HOME>/server.json`（`{ port, pid, token }`，权限 0600）。pid 存活且 `GET /__joplo/ping` 返回同一个 pid 时，用令牌调用 `POST /__joplo/projects` 注册项目，打印项目链接后退出，退出码 0，不启动第二个进程。pid 已死或 ping 不通时清掉 server.json，按原来的方式启动；两个 `joplo dev` 同时启动、端口被抢时，后者改为加入前者。
- **记住项目**：`<JOPLO_HOME>/projects.json`（`{ version: 1, projects: [{ dir, name, lastOpened }] }`，临时文件 + rename 原子写入），首页按最近打开排序。编译成功后用 config 的名称更新 `name`。移除只删记录，不碰项目目录。`JOPLO_HOME` 缺省为 `~/.joplo`；vitest、Playwright 与 `release:smoke` 都把它指向临时目录。
- **看板界面**：一个 Vite 开发服务，root 是 `packages/web`（或 `@tokenroll/joplo-web` 的 dist），React + Tailwind，界面本身也支持 HMR。
- **项目编译（按需）**：每个项目一个不监听端口的 Vite 加载器（middlewareMode，不开 HMR / WebSocket）。首页选中、打开演示页或注册时才启动。项目源文件用 `ssrLoadModule` 载入，插件 `joplo:project` 用 automatic JSX、`jsxImportSource: '@tokenroll/joplo-kit'`、development 模式转译，因此 jsxDEV 能拿到 `文件:行:列`，随后交给 core 的 `loadAuthoring` + `compile(…, 'dev')`。
- **热更新**：界面服务的文件监听覆盖所有已启动的项目目录（`.joplo/`、`dist/`、`node_modules/`、`.git/` 除外）。某个项目的文件变化只重新编译这个项目，并通过 HMR 自定义事件 `joplo:ir`（带 `projectId`）推送，看板只接收当前项目的事件。页面不刷新，保持方案、场景、位置（越界时夹到合法范围）和选中。编译是串行的，编译过程中又有变化时，结束后再编一次。项目列表变化通过 `joplo:projects` 推送。

- **Tailwind**：所有已启动的项目目录都追加为 `index.css` 的 `@source`，项目源文件里出现的 `className` 能被编译，并随文件变化热更新。build 同样如此。
- **编译出错**：首页显示错误数和 `文件:行:列 + 说明` 列表；演示页顶部显示错误列表，画面继续显示上一次成功的结果和当前位置，不会白屏。修好并保存后自动恢复。
- **安全**（沿用 M0）：
  - 只监听 `127.0.0.1`；
  - 每个 HTTP 请求校验 Host（`127.0.0.1:端口` / `localhost:端口`），否则返回 403；
  - 写接口校验 Origin（存在时必须是本服务）、`Content-Type: application/json`、本地令牌 `x-joplo-token`（注入在看板 HTML 的 meta 里，与 server.json 中的相同），并限制请求体大小。令牌错误时注册、移除、导出、打开编辑器返回 403，选中返回 401（沿用）。
  - Vite 自带的 `/__open-in-editor` 只能经由 `POST /__joplo/p/<id>/open`（校验令牌，且只接受项目内的源文件）进入，直接访问返回 403。
- **端口**：缺省 4790，被占用（且不是 Joplo 看板）时直接报错 `端口 N 已被占用`（strictPort），不静默换端口。传 `port: 0` 使用随机端口（测试用）。

接口（`<id>` 是项目标识：目录名 + 绝对路径的短哈希）：

| 接口 | 说明 |
| --- | --- |
| `GET /__joplo/ping` | `{ joplo: true, pid }`，供再次 `joplo dev` 判断看板是否存活。 |
| `GET /__joplo/projects` | 首页列表：`[{ id, dir, name, lastOpened, status: idle\|compiling\|ok\|error\|missing, errors, version }]`。 |
| `POST /__joplo/projects` | 注册项目 `{ dir }`（绝对路径）→ `{ id, url }`，并开始编译。 |
| `DELETE /__joplo/projects/<id>` | 从列表移除（只删记录）。 |
| `GET /__joplo/p/<id>/ir` | `{ projectId, version, ok, project, diagnostics, home }`。`project` 始终是最近一次成功的 IR。 |
| `GET` / `PUT /__joplo/p/<id>/selection` | 读 / 写该项目的 `.joplo/selection.json`；PUT 请求体为 `{ selection: { optionId, scenarioId, position, sceneId, nodeId, stepId? } \| null }`。 |
| `POST /__joplo/p/<id>/open` | `{ at }`：在编辑器中打开项目内的 `文件:行:列`。 |
| `POST /__joplo/p/<id>/export/image` | `{ scenarioId, position, device, theme }` → PNG（见“导出”）。 |
| `POST /__joplo/p/<id>/export/video` | `{ scenarioId, device, theme }` → 202 `{ jobId }`；同一项目已有任务时 409。 |
| `GET /__joplo/p/<id>/export/video` / `…/events` | 当前任务状态 / SSE 进度（带令牌）。 |

### 选中：`.joplo/selection.json`

内容为 core 的 `Selection` 类型，取消选中时为 `null`。`source` / `at` 的端到端流向：

1. kit 的 jsxDEV / callsite 写入绝对源位置；
2. `compile` 转成相对路径，写到 IR 节点、步骤、规则的 `source`；
3. 渲染器把它写到每个节点根 DOM 的 `data-jat`（同时还有 `data-jid`、`data-jtype`）；
4. 浏览器只提交“选中了谁”。服务端对照当前 IR 校验，并**重新计算** `at`、`label`（取 Mantine 组件的 `label` / `title` / `aria-label` 等属性，其次是文字）、`route`、`featureId`、`stepId`，然后原子写入 `.joplo/selection.json`；
5. `joplo selection`（T-cli）读取文件，输出 `文件:行号` 和源码片段。

不变量：每次写接口返回后，界面显示的选中与文件内容一致。

- 写入被拒绝（409，例如场景已变、元素已不存在）时，服务端把文件写成 `null`，并在响应里返回 `current: null`。看板随之清除选中，并提示“选中未能同步给 Agent：…，已取消选中”。这修复了上一轮复审的问题：之前文件保留旧选中，界面却显示新选中。
- 网络失败或令牌错误时，服务端没有写入，看板回滚到上一次确认的选中。
- 热更新后：选中的元素仍在画面里时保留选中；行号或标签变了会重新写入新的 `at`。元素被删除时取消选中并写入 `null`。

## 看板界面（D39，原型见 `examples/joplo-board`）

取代 D32 的“演示 / 审阅”双模式和拥挤的顶栏。所有界面状态都在 URL 的 hash 里（`runtime/route.ts`），复制链接就能回到同一个项目 / 功能 / 方案 / 情况 / 场景 / 步骤 / 设备：

- `#/`、`#/<项目>`：首页；
- `#/<项目>/f/<功能>?o=<方案>&c=<情况>&s=<场景>&step=<位置>&l=<层级>`：演示页（`l` 只在手动选层级、导演关闭时出现）。

**首页**（`board/Home.tsx`）

- 左栏“最近打开”：项目名和路径；编译出错显示“N 个错误”，目录不存在显示“找不到目录”。
- 右侧：所选项目的功能行（名称、目标、方案数、选定方案、“缺失 N · 待决定 M”、「查看」）。编译出错时列出 `文件:行` 与说明；目录不存在时可以“从列表移除”（只删记录）。
- 没有任何项目时显示三条开始命令。

**演示页**（`player/PlayerPage.tsx`，发布站共用）

- **顶栏**只有：Joplo、面包屑（项目 / 功能 / 方案 / 场景，前两段回到首页）。没有设备切换（D44）：每个页面只有一种设备，由 page 的 `viewport` 决定；需要手机版就单独做一个手机版的页面或演示。
- **左栏**（`board/CaseNav.tsx`，方案 B“按情况分组”）：顶部切换当前方案（情况保持不变）；每条情况标出各方案的状态（✓ / 缺失 / 待决定 / 不适用）。点一条情况就播放当前方案里覆盖它的场景；当前方案没有表达它时，画面上方说明这是缺口，并给出 `npx joplo check --option <方案>`，画面静态展示方案的页面。没有关联情况的场景列在“其他场景”。底部是当前方案的缺口总数。
- **中间**是画面，按比例缩放尽量占满；`viewport: 'mobile'` 的页面固定 390 宽并套上手机外框（与 `Phone` 组件同一个 `PhoneFrame`）。右下角有低调的提示“⌥ + 单击：检查元素”。
- **层级栏**（方案声明了两个以上 `layers` 时，画面上方）：分段控件（作者声明的各层级，没有自动全景）、“导演跟随 / 已暂停”开关、“↻ 只重放这一层”。
- **一屏放下**（D43，硬性）：顶栏、左栏、层级栏、画面、播放控制、步骤条（一行步骤 + 一行说明）在 1280×800、1440×900 下都不出现页面滚动；画面高度 = 视口减去其余部分，作者页面再长也缩进画面，细节靠聚焦。发布站同样适用。

**视角层级与导演镜头**（D43，`renderer/camera.tsx`、`player/cameraFor.ts`）

- 每个层级是**完全独立的画面**（T-layers）：作者写 `layers: { client: layer('客户端视角', <ClientView/>), overview: layer('全景', <Overview/>) }`，每层单独编译成一个 Scene（id `<方案>~<层级>`，带 `layer` 键），按自己的布局占满整个舞台，不再从共用页面里裁切。`Option.layers` 是 `{ title, sceneId }`。各层共享同一份 `PlayState`（ui / data / inputs），`state.sceneId` 仍是路径画面；步骤目标在各层画面里解析（`sceneOfTarget`，优先可见的那一层），`explainClick` 用用户正在看的画面。没有声明 layers 的方案显示原来的路径页面，行为不变（伪层级 `@page`）。不保留自动全景层：作者需要全景时自己声明一层。
- 步骤里的 `shot(...ids)`：每个 id 在包含它的层里解析（多层有同名 id 时各层都生效），编译成 `Step.shots: { layer, targets }[]`；第一个 shot 所在的层是 `Step.directorLayer`；没写 shot 的操作步骤，导演层取操作目标所在的层；`shot()` 编译成 `@director`，让当时的导演层回到整层。id 不在任何层里报 `SHOT_UNKNOWN`，层的树为空或层键不合法报 `LAYER_UNKNOWN`。check 的绑定检查也在各层画面里找步骤目标。
- core 的 `cameraAt(project, scenarioId, position)` 是纯函数：初始导演层是第一个声明的层，没有 shot 的步骤沿用上一步，不写进 ui / data / inputs；`displaySceneId` 给出某一步用户看到的画面。手动、逐步、自动播放、回放、renderStep、视频录制、发布站都用它们（web 的 `cameraFor` 汇总为 `{ layers, viewLayer, sceneId, spec }`）。
- 导演开启时每一步自动切到导演层并按镜头聚焦；下一步的操作目标不在当前层里时，演示控制器先切到它所在的层（`leadLayer`，约 650ms），鼠标再移过去。手动切层级时导演关闭（URL 记 `l`），步骤与产品状态不变；再打开导演回到导演层。“只重放这一层”从第 0 步开始只用这一层的镜头，这一层没有变化的步骤约 300ms 快速带过（`DemoController.play({ fromStart, fast })`）。换层时新画面淡入。
- 镜头：在这一层自己的坐标里，把内容与弹窗层一起平移缩放（Motion，约 600ms）到焦点包围盒，四周留 28px，并在不破坏内边距的前提下尽量不露出内容以外的空白；整层只缩小不放大；聚焦最多推近 2 倍，对准 Diagram 节点时至少推近到节点主标签在屏幕上 ≥ 16px。焦点用元素**实际可见**的矩形：与裁切它的祖先（overflow 不是 visible 的容器）求交，滚动区里的目标先滚到可见处（`camera-math` 的 `visibleRect` / `revealScroll`）。不用遮罩：焦点外的内容沿焦点的祖先链逐层把兄弟元素调暗（`filter: opacity(.32)`，不覆盖逐段出现的透明度）；高光框画在镜头容器里、贴着焦点的可见矩形（误差 ≤ 2px），随镜头一起移动，sketch 用 Rough 描边、clean 用柔和光晕，出现时脉冲一次。Toast 与鼠标、聚焦框等覆盖层在镜头之外，⌥+单击按屏幕位置命中，变换后照样点中。
- 在镜头之下 Diagram 让位：不用最小缩放与图内滚动，整体放进容器，细节靠镜头推近。
- 静态截图（renderStep）用这一步导演层的画面与镜头、没有动画（渲染路由等镜头稳定后才截图），设备取这个画面的设置；视频录制（record 模式）有切层与聚焦过渡，与演示页一样先切层再移动鼠标。
- **画面下方一行**：⟲、上一步、播放 / 暂停、下一步；右侧「…」菜单：导出图片、导出视频、线框风格、复制当前步骤链接、在编辑器中打开（当前步骤的源位置）。
- **最底下是步骤条**：当前步高亮（点任一步跳过去），下面是本步说明和下一步说明，右侧是模拟标签。

**检查元素**（`board/InspectDrawer.tsx`）：普通单击保持原来的手动推进；**⌥+单击**只检查，不操作原型：写入 selection（服务端计算 at / label，409 时清空并提示），右侧弹出抽屉，显示规则（来源与确认状态）、覆盖的情况、`文件:行`（可复制、可在编辑器中打开）和“Agent 运行 npx joplo selection”的提示。按住 ⌥ 时悬停的元素显示虚线框。

**导出**（`server/src/export.ts`）

- 图片：本机看板调用服务端，Playwright 打开本看板的渲染路由（与 `renderStep` 同一渲染路径），截取当前步骤；尺寸跟随页面自己的 viewport（手机页面带外框），不再选择设备（D44）。视频同样跟随场景起始页面的 viewport。发布站在浏览器里用 `modern-screenshot`（web 的 devDependency）截取舞台。
- 视频（只在本机）：Playwright `recordVideo` 录制渲染路由的自动播放（与看板同一个演示控制器：鼠标、波纹、逐字输入、系统事件、字幕），保存为 `<项目>/exports/<场景>-<时间>.webm`；SSE 报告进度；同一项目同时只有一个任务；没有 Playwright / Chromium 时错误里带 `npx playwright install chromium`。`joplo init` 生成的 `.gitignore` 包含 `exports/`。

**推进状态**：手动、逐步、自动播放都只通过 core 的 `applyStep` / `stateAt` / `explainClick` 推进（`runtime/demo.ts`）。

- 点击的含义由 `explainClick` 决定：推进、禁用原因、“演示未覆盖”、越序提示。
- 点到按钮里的文字也算点按钮；⌥+单击取最内层的元素。
- 快捷键：`←` / `→` 逐步，空格播放或暂停。

## 渲染器（`packages/web/src/renderer`）

组件词汇对齐 Mantine（D35），但运行时不引入 Mantine：每个目录类型都有一个 Joplo 自己的低保真实现。

- 注册表 `IMPL` 的类型是 `Record<ComponentType, …>`，漏掉任何类型都会导致类型检查失败。目录、kit 导出与 `COMPONENT_DOCS` 的一致性由 `core/test/catalog.test.ts` 检查。
- 手绘主题用 Rough 描边和 Excalifont / 小赖字体，线框主题使用 1px 边框。
- 每个节点的根 DOM 都带 `data-jid` / `data-jtype` / `data-jat`。可操作的节点另带 `data-jinteractive`、`data-jdisabled`、`data-junmodeled`。输入组件的根包含 label / description / error，真正的控件另带 `data-jcontrol=<id>`，演示光标与高亮对准它。
- 绑定、可见性、禁用全部由 core 计算：`resolveProps` / `isSelfVisible` / `isNodeDisabled` / `appShellLayout` / `choicesOf`。`Modal` / `Drawer` 用 `opened` 门控（兼容旧写法 `open`）。
- **响应式**：`Stage` 把舞台宽度放进 `RenderCtx.width`（页面 viewport：桌面 1280、手机 390；舞台宽度固定，D44 起没有宽度预览切换；`renderStep` 的 `viewport` 只是截图尺寸，舞台按比例放进去）。
  - 所有布局与样式属性都接受 `{ base, xs, sm, md, lg, xl }`，按 Mantine 默认断点 36/48/62/75/88em 取值（`atWidth`）；
  - `visibleFrom` / `hiddenFrom` 在 `isSelfVisible` 里判断；
  - `AppShell` 的 `navbar` / `aside` 在窄于 `breakpoint` 时默认收起（`collapsed.mobile` 写 false 或绑定为假时以覆盖层展开），没有 `Burger` 时在顶栏补一个示意图标。
  - `Phone` 组件内部的宽度固定为手机宽度 390（`childWidth`），断点、`visibleFrom` / `hiddenFrom`、`AppShell` 收起都按它算；`isNodeVisible` 沿祖先链同样切换宽度，回放与渲染一致。外框由 `PhoneFrame` 绘制（大圆角机身、侧键、听筒，不显示文字），舞台在手机宽度时自动套上同一个 `PhoneFrame`。
  - `Terminal`：低保真线框，左上角是 `title` 的圆角窗口；`Terminal.Command`、`Terminal.Output`、`Terminal.Input` 各是一个带边框的圆角块，`tone`（plain / ok / warn / error）只改输出文字的颜色；超出 `h` / `mah` 时窗口内部滚动并停在最新输出；`Terminal.Input` 是值类型（`type` 写入）。
  - `Diagram`（D41）：`Diagram.Group` / `Diagram.Node` / `Diagram.Edge` 组成的架构图。布局在 `renderer/diagram-layout.ts` 里用 @dagrejs/dagre（MIT，复合图，web 的 devDependency，打进预构建包）自动生成：只读原始属性（state、when 等绑定不参与），同一结构总是同一坐标，播放时节点不移动；结构键不变就不重新布局。连线用 dagre 绕开节点的中间点，首末两段改成“横出横进”：每个节点每一侧的出入口按另一端排序均匀分布，转弯在列间空隙里、每条线一条通道，保证不穿过节点。整图缩放到放得下容器宽度与 `h`，但不低于 12/14（节点主标签实际 ≥ 12px、description ≥ 10px）；仍放不下时图内可以滚动、按住拖动平移，不再继续缩小。布局紧凑：连线标签不进 dagre（不单独占一层），布局后沿连线找位置贴在线上，避开节点、分组标题、别的标签和别的连线，并画在连线之上的单独一层（点标签等于点连线）；分组标题在顶部留白里避开连线、画在连线之上；指回“上游所在分组”的连线（如 biz → local，local 与上游 app 同组）按反向分层，避免分组被拉成横跨整图的长条；往返连线在转弯处各占通道（间隔 ≥ 8px）。逐段出现：Group / Node / Edge 都支持 `when`，布局按全部元素计算（隐藏的保留位置）；Diagram 挂载之后才出现的元素播放出现动画（节点淡入并轻微放大，连线用沿路径伸长的遮罩从 from 画到 to，分组框淡入），首次显示、回放与 renderStep 静态截图直接是最终状态。节点按 `kind` 画外形（数据库圆柱、队列管道、用户胶囊、外部服务虚线框）和小图标；`state`（idle / active / ok / error / dim）决定颜色，active 的连线上有 Motion 驱动的小点从 from 移向 to（不做动画时停在 3/4 处），async 与 error 画虚线。sketch 主题用 Rough 描边与手写字体，clean 主题用细线。连线的根是 SVG `<g data-jid>`，带一条透明粗线方便 ⌥+单击；检查抽屉显示 description、state 与 `from → to`。编译期：连线 id 缺省为 `from->to`；`from` / `to` 不是同一个 Diagram 里的节点时报 `UNKNOWN_DIAGRAM_NODE`（带 at）；节点必须有 id、同一画面唯一。
  - 回放与点击解释按**页面自身的 viewport**计算同样的规则：步骤目标在该宽度下被隐藏或导航被收起时报 `TARGET_HIDDEN`。
- 样式属性（`m/p/w/h/c/bg/fz/fw/ta/ff…`）在 `renderer/style.ts` 转成内联样式；间距、字号、圆角用 Mantine 默认刻度，颜色映射到一组柔和的调色板。
- 浮层渲染在舞台内部的弹窗层（不 portal 到 body），截图和遮挡检查只看舞台本身。
- 作者的 `className` / `style` 原样加到根 DOM（逃生口，示例里不使用），其他属性不透传，链接不生成真实 href，图片渲染为带 alt 的占位。

## `buildSite`：静态发布站

1. Vite 以中间件模式（不监听端口）载入项目，执行 `compile(…, 'publish')`，只保留选定方案。这一步已经去掉规则、情况、问题、备注和源路径；`publishPayload` 再去掉约束、角色、取舍、覆盖等创作侧字段（D33）。
2. 对 `packages/web/site.html` 执行 `vite build`（强制 production）。构建时 `@tokenroll/joplo-core` 指向 `site/core-lite.ts`，只打包播放器和目录，不带 zod schema 与编译器。
3. 后处理 HTML：
   - IR 内联为 `<script type="application/json" id="joplo-ir">`（已转义 `<`）；
   - 入口脚本内联为 `<script type="module">`；
   - 去掉 `crossorigin` 和 `modulepreload`。

   这样直接双击 `index.html`（`file://`）也能完全离线运行。CSS 和字体是相对路径的静态文件。
4. 目标目录（缺省 `<项目>/dist`）非空且没有 `overwrite` 时拒绝写入。以下情况永远拒绝：目标是项目目录本身或它的上级、目标在 `.joplo/` 里、目标目录里含有 `joplo.config.ts`。编译失败时不写任何文件，并抛出带诊断的 `EXPORT_FAILED`。

**发布站内容**（D39：与本机看板同一套布局）：

- 首页：只有一个项目，左栏列功能，右侧是功能行和「查看」；
- 演示页：同 `PlayerPage`，左栏是选定方案的场景列表；「…」只有导出图片（浏览器内生成）、线框风格、复制链接；
- 没有缺口、规则、源码位置、检查抽屉和“在编辑器中打开”；⌥+单击按普通单击处理；
- 常驻“概念原型 · 非正式实现”。

hash 路由：`#/`、`#/f/<功能>?s=&step=&d=`；旧链接 `#/s/<场景>` 自动换成演示页链接。

**部署**：`npx wrangler deploy --assets ./dist --name <名称> --compatibility-date 2026-11-01`，或上传到任何静态托管。

## `renderStep`：截图

`renderStep` 用随机端口启动一次性的看板进程（不持久化、`watch: false`、只编译一次），Playwright 打开渲染路由 `/?render=1&project=…&scenario=…&position=…&theme=…`，然后截取舞台。页面和元素索引来自同一份 IR。

- `scenarioId` / `stepId` 使用 IR 的限定 ID，例如 `invite.a-modal.success` / `invite.a-modal.success#1`；
- `elements[]` 带 `at`；没有渲染出来的节点也会列出，`visible: false`；文本节点不列入；
- 保留 M0 的渲染告警：遮挡、超出画框、文字溢出、Toast 覆盖可交互元素、字体未加载；
- 不覆盖已有文件（需要传 `overwrite`），不能写到项目源文件或 `.joplo/`。

## 测试

- `pnpm vitest run packages/server/test`：
  - dev：编译、Host / Origin / 令牌 / Content-Type 校验、选中写入与 409 时写 null、热更新与语法错误定位、`.joplo/` 变化不触发重新编译、端口占用、非项目目录、空项目；
  - hub：projects.json 原子写入与排序、server.json 0600、连续两次 `joplo dev` 只有一个端口且两个项目都在首页、注册接口没有令牌 403、按项目的 IR 与选中、删除记录不删文件、目录消失标为 missing、打开编辑器的路径限制、导出图片 / 视频（409、SSE、没有 Chromium 时的安装命令）；
  - build：缺省输出、拒绝覆盖、危险目标、编译失败、没有 pick；HTML 后处理；renderStep。
- 不再有浏览器端到端测试（用户决定，开发更快）。能抽成纯函数的界面逻辑用 vitest 单测：`packages/web/test/`（镜头拟合 `fitCamera`、舞台缩放 `fitStage`、镜头计划 `cameraFor`、URL 解析、架构图布局）。其余（一屏不滚动、⌥+单击命中、浏览器里的动画）在交付前手动在浏览器里检查。
- Playwright 仍是产品功能依赖：`joplo render` / `renderStep`、视频导出、`pnpm docs:screenshots` 用它；`pnpm release:smoke` 不需要浏览器。
- 所有测试都在示例的临时副本上运行，端口随机，`JOPLO_HOME` 指向临时目录。
- `pnpm docs:screenshots` 重新生成 `docs/screenshots/*.png`，这是写入该目录的唯一途径；其中 `prototype-*.png` 是 `examples/joplo-board` 原型里对应场景的渲染，用来与新界面对照。

## 已知限制

- 发布站约 0.55 MB HTML（内联 JS + IR）加上按需加载的字体子集，字体全部打包在 `assets/`，共约 12 MB。
- 看板载入时不再根据 selection.json 自动跳转（URL 决定位置）；多个看板标签页同时打开时，以最后一次写入为准。
- 缺口时展示的静态画面是方案第一个场景的初始画面，只用于看方案长什么样。
- 编译从未成功过的项目，首页显示目录名（还读不到 config 的 name）。
- 发布站浏览器内导出的图片只有舞台，不带手机外框；本机导出带外框。
