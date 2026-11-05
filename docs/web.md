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
- **层级栏**（方案声明了两个以上 `layers` 时，画面上方）：分段控件（作者声明的各层级，没有自动全景）、“导演跟随 / 已暂停”开关、“↻ 只重放这一层”。导演跟随时分段控件不高亮任何一项，旁边小字显示“导演：<当前层>”；点任一层就转为手动并选中它（T-director2）。
- **缩放栏**（画面右上角）：「− / + / 适应画面」。任何层级（也包括没有层级的页面）都能滚轮、触控板捏合缩放（以鼠标位置为中心，0.25–4 倍）和拖动平移（移动超过 4px 才算拖动，之后的单击不触发元素）；内容至少留 80px 在画面里。导演跟随时手动缩放只维持到下一步，镜头重新接管；手动选层时保持用户的缩放平移，直到换层或点「适应画面」。⌥+单击在任何缩放下都按屏幕位置命中。实现在 `Stage` 的 `zoom` 属性与 `camera.tsx` 的 `user` 视图，纯计算 `zoomAt` / `clampPan` / `wheelFactor` 在 `camera-math.ts`。静态截图与视频没有缩放。
- **一屏放下**（D43，硬性）：顶栏、左栏、层级栏、画面、播放控制、步骤条（一行步骤 + 一行说明）在 1280×800、1440×900 下都不出现页面滚动；画面高度 = 视口减去其余部分，作者页面再长也缩进画面，细节靠聚焦。发布站同样适用。

**视角层级与导演镜头**（D43，`renderer/camera.tsx`、`player/cameraFor.ts`）

- 每个层级是**完全独立的画面**（T-layers）：作者写 `layers: { client: layer('客户端视角', <ClientView/>), overview: layer('全景', <Overview/>) }`，每层单独编译成一个 Scene（id `<方案>~<层级>`，带 `layer` 键），按自己的布局占满整个舞台，不再从共用页面里裁切。`Option.layers` 是 `{ title, sceneId }`。各层共享同一份 `PlayState`（ui / data / inputs），`state.sceneId` 仍是路径画面；步骤目标在各层画面里解析（`sceneOfTarget`，优先可见的那一层），`explainClick` 用用户正在看的画面。没有声明 layers 的方案显示原来的路径页面，行为不变（伪层级 `@page`）。不保留自动全景层：作者需要全景时自己声明一层。
- 步骤里的 `shot(...ids)`：每个 id 在包含它的层里解析（多层有同名 id 时各层都生效），编译成 `Step.shots: { layer, targets }[]`；第一个 shot 所在的层是 `Step.directorLayer`；没写 shot 的操作步骤，导演层取操作目标所在的层；`shot()` 编译成 `@director`，让当时的导演层回到整层。id 不在任何层里报 `SHOT_UNKNOWN`，层的树为空或层键不合法报 `LAYER_UNKNOWN`。check 的绑定检查也在各层画面里找步骤目标。
- core 的 `cameraAt(project, scenarioId, position)` 是纯函数：初始导演层是第一个声明的层，没有 shot 的步骤沿用上一步，不写进 ui / data / inputs；`displaySceneId` 给出某一步用户看到的画面。手动、逐步、自动播放、回放、renderStep、视频录制、发布站都用它们（web 的 `cameraFor` 汇总为 `{ layers, viewLayer, sceneId, spec }`）。
- 导演开启时每一步自动切到导演层并按镜头聚焦；下一步的操作目标不在当前层里时，演示控制器先切到它所在的层（`leadLayer`，约 650ms），鼠标再移过去（约 1.15 秒，等镜头到位）。手动切层级时导演关闭（URL 记 `l`），步骤与产品状态不变；再打开导演回到导演层。“只重放这一层”从第 0 步开始只用这一层的镜头，这一层没有变化的步骤约 300ms 快速带过（`DemoController.play({ fromStart, fast })`）。换层时新画面淡入。
- 镜头：在这一层自己的坐标里，把内容与弹窗层一起平移缩放（Motion，约 1 秒）到焦点包围盒，四周留 28px，并在不破坏内边距的前提下尽量不露出内容以外的空白；整层只缩小不放大；聚焦最多推近 2 倍，对准 Diagram 节点时至少推近到节点主标签在屏幕上 ≥ 16px。焦点用元素**实际可见**的矩形：与裁切它的祖先（overflow 不是 visible 的容器）求交，滚动区里的目标先滚到可见处（`camera-math` 的 `visibleRect` / `revealScroll`）。不用遮罩：焦点外的内容沿焦点的祖先链逐层把兄弟元素调暗（`filter: opacity(.32)`，不覆盖逐段出现的透明度）；高光框画在镜头容器里、贴着焦点的可见矩形（误差 ≤ 2px），随镜头一起移动，sketch 用 Rough 描边、clean 用柔和光晕，出现时脉冲一次。Toast 与鼠标、聚焦框等覆盖层在镜头之外，⌥+单击按屏幕位置命中，变换后照样点中。
- Diagram 总是整图放进容器、不滚动（T-director2：原来的图内滚动和拖动交给统一的缩放平移），细节靠镜头推近或用户缩放。
- **节奏**（T-director2，`runtime/pace.ts`）：自动播放每一步提交后停留 `max(3000, 60ms × 字数) / 速度`，字数是说明加 `explain` 去掉空白的字符数；同时至少等镜头过渡（1 秒）结束、本步 active 连线上的小点跑完一圈（`[data-jdot-ms]`），这两项不随速度缩短。播放按钮旁的速度选项 0.5× / 1× / 1.5× 记在 URL 的 `speed`（1× 不写），也缩放鼠标移动、逐字输入等动画。视频录制用同一个控制器与节奏（1×）。停留期间字幕仍显示刚执行的一步。
- **调用链 trace**（D48）：步骤里写 `trace('biz', 'billing')` / `trace('brain', 'biz', 'local')` / `trace('e_brain_biz')` / `trace.fail(...)` / `trace.skip(...)`。编译进 IR 的 `Step.traces: { mode, nodes, edges: { id, reverse }[] }[]`：每一段先找同向的 `Diagram.Edge`、没有再找反向的（reverse = true）；找不到或 id 未知报 `TRACE_UNKNOWN`，同一方向有多条连线且没写连线 id 报 `TRACE_AMBIGUOUS`（都带 at）。trace 的节点（trace.skip 除外）按出现顺序与同一步的 shot 合并成镜头目标，参与导演层选择与聚焦布局。core 的 `diagramStateAt(project, scenarioId, position)` 是纯函数（与 cameraAt 同级）：本步 trace 到的 active，之前 trace 过的 ok，trace.fail 的连线与终点节点 error（保持到之后又被 trace 成功），trace.skip 的 dim，其余 idle。Stage 计算它并放进渲染上下文；Diagram.Node / Edge 显式写了 state（字面量或绑定解析后的值）时以显式为准，否则用推算值（`effectiveState`）；逆向的连线上小点从 to 流向 from。回放、renderStep、视频、发布站都走这一条路径；发布站保留 `Step.traces`。旧写法（`state={$.ui.x}` + `set`）结果不变。
- **字幕区**：画面下方、播放控制上方单独一块固定高度（`SUBTITLE_HEIGHT` = 84px）的区域，不叠在画面上（`player/Subtitle.tsx`、`subtitle-content.ts`）。最多两行：第一行大字（22px）是本步说明，系统步骤前面有一个小的“系统”标记；第二行小一号（16px）是 `explain()`，没有就不显示；各一行，超出省略，悬停显示全文；宽度占满画面；字体跟随舞台主题（sketch：Excalifont + 小赖；clean：系统字体）。显示正在播放的一步，否则是刚执行完的一步；第 0 步显示“初始状态”与场景描述。画面上不再有底部字幕、浮动解说卡和顶部的“系统事件”标签，步骤条里只显示“第 n / 共 m 步”、下一步与结果，不重复说明。画面高度相应减少，一屏放下的约束不变；镜头与聚焦布局都在舞台自己的坐标里计算，不受影响。renderStep 截图（`[data-jrender]`，页面高度 = 舞台 + 字幕区）、导出图片与视频（`[data-jexport]`，`EXPORT_SIZE` 加上字幕区）、发布站都带字幕区。字幕只用来点一句：check 对说明超过 24 个字、explain 超过 48 个字（中文 1、英文 0.5，`captionLength`）报 warning `CAPTION_TOO_LONG` / `EXPLAIN_TOO_LONG`（带 at），提示把长内容放进单独的说明层（如 `layer('设计理由', …)`）再用 shot 切过去；不截断、不改写作者的文字。
- **导演第三轮**（T-director3）：
  - 镜头时序：系统步骤一开始播放就用这一步的镜头（`cameraPosition`），与字幕区正在显示的这一步一致；用户操作在提交之后才切。此前系统步骤提交前的停留期间，说明已是这一步、镜头还停在上一步（agent-arch 第 10 步“沙箱执行完成”停在后端的 biz + sandbox 就是这个原因；导演层本身算得对，是客户端）。写了目标但它们这一刻还不在画面上时，镜头保持不动，等它们出现再对准；换层后重新开始。
  - 字体：字幕区与画面内的提示都不写死字体，跟随舞台主题（sketch：Excalifont + 小赖；clean：系统字体）。
  - 连线：聚焦时连着焦点节点的连线、焦点连线、state 为 active / ok / error 的连线保持原色、加粗、画在节点之上（`diagramFocus` / `edgeEmphasized`），其余连线与标签随调暗规则变淡。走线改为完全正交（`renderer/diagram-route.ts`）：同一空隙两侧的出入口一起排布、互相 ≥ 10px，相邻两列能拉直就拉直；每条线在空隙里占一条竖直通道，竖直范围重叠的通道 ≥ 10px；跨多列的线走一条横向轨道，避开途经的节点、其他轨道与出入口；通道不走在分组标题条里。放不下时加大层间距、或把连线多的节点那一侧加长，重新布局。转角用 ≤ 8px 的小圆角。
  - **聚焦布局**：镜头对准同一张 Diagram 里 2 个及以上节点（对准连线时取两端）时，只用这些节点和它们之间的连线，用同一套 dagre + 正交走线排一张紧凑小图放在图的中央（`focusMembers` / `focusLayout`，只由结构 + 聚焦集合决定、缓存、结果确定）；节点用 Motion 约 800ms 从原位置移过去，小图背后有一块浅色底；小图里的连线加粗、标签 14px、active 小点沿方向流动；连向小图外部的连线隐藏；其他节点、分组、无关连线留在原位，降到很低的不透明度、不参与交互。只对准一个节点、对准分组或整张图时不重新布局。回到整层（shot()）或没有镜头时节点移回全图位置。镜头随后框住整张小图（按节点的最终位置 `data-jfinal` 测量，不追着移动中的节点）；用户缩放叠加在上面，「适应画面」回到小图。renderStep 截图直接显示聚焦布局，视频里有动画。逐段出现（when）时已有元素不移动的约定不变。
