# Joplo 插件架构：纯粹的引擎 + 可插拔的内容形态（D87）

> 状态：阶段 0、阶段 1-A/B/C/D/E 与阶段 2 已实现（阶段 2 字段与边界见第 13 节）：API v2 编译钩子、效果快照、元素特性与 React/容器运行时；D89 起引擎不隐式启用任何插件，标准库由版本化 starter 显式声明。阶段 1-A 的接口与数据流见第 10 节，媒体轨道与本机资源见第 11 节，通用属性、插件主题与讲解内容见第 12 节。
> 目标形态：Joplo 只是**构建与调度引擎**，负责把不同形态的内容串成一个可播放、可评审、可发布的作品；
> UI 组件、Diagram、Canvas、3D、Alda BGM、朗读供应商、主题……都是插件。

## 1. 驱动力

| 驱动力 | 具体场景 | 对结构的要求 |
|---|---|---|
| 内容形态会持续增加，而且由别人维护 | 3D、音乐、地图、讲解画布、公司自己的设计系统 | 引擎不认识任何具体形态；新形态不改 core |
| Agent 是主要作者，省 token（D25） | Agent 装一个包、读一份技能就能写 | 每个插件自带技能；`npx joplo skill` 汇总 |
| 演示必须可复现（截图、视频、深链、评审定位） | 同一份 IR、同一步，永远是同一个画面 | 时间线状态只由步骤推进；游玩层不回写时间线 |
| 发布站离线可播放（file://、静态托管） | 观众没有作者的电脑、工具和网络 | 发布物自包含：IR + 编译后的运行时 + 生成好的资源 |
| 私有项目 | 公司组件、私有仓库 | 源码与本机能力不进发布物；私有插件不能误发公开分享 |
| 已有项目不能坏 | 现有示例、已发布的分享 | 作者 TSX 不变；新 IR 使用命名空间，旧分享保留其原运行时 |

## 2. 引擎是什么（内核，不拆）

内核只保留**所有形态共有的东西**。判断标准：换掉任何一种内容形态，它都还在。

1. **故事模型**：项目 → 功能 → 方案 → 情况 → 场景 → 步骤；规则、覆盖、待决问题、评审与反馈。这是 Joplo 的产品视角，也是它和视频工具的区别。
2. **时间线与状态机**：`ui / data / inputs` 状态；步骤的动作（click / type / select / toggle / press / drag / hover / scroll / plugin / back / event / card）与基础效果（set / append / go / done / fork / stream / toast）；`stateAt` 回放、`flow({ from })` 接力。纯函数、确定。
3. **导演与节奏**：层级、镜头目标（shot）、焦点提示（spotlight / highlight / number / callout / mark）、字幕 / explain / narrate / say、停留与阅读时长、过渡卡、自动播放时钟。
4. **寻址与检查**：元素 id、源位置（文件:行）、选中、DOM 锚点（`data-jid`）、评审定位到“第几步的哪个元素”。
5. **输出管线**：看板、截图 / 分镜 / 视频、build / share、多语言、范围分享与脱敏、资源打包。
6. **插件宿主**：载入、契约与版本、能力注册、信任与私有、技能汇总。

内核里**不应该出现任何组件名**（`Button`、`Diagram`、`Canvas`……）。这条可以写成测试守住（第 6 节阶段 2）。

## 3. 插件能贡献什么（扩展点）

把现有内置能力逐个拆开看，它们都落在下面几类扩展点上。插件可以只用其中一部分。

| 扩展点 | 运行在 | 作用 | 现有的例子（迁移后由插件提供） | v1 |
|---|---|---|---|---|
| A 词汇 | Node（创作） | JSX 标记、效果工厂（`trace()`、`camera()`、`bgm.play()`）、属性说明 | `@joplo-app/plugin-ui` 的组件、`trace`、`camera` | ✓ 组件标记 |
| B 技能 | Node | 给 Agent 读的用法、常见坑 | `skill ui/components / diagram / content` | ✓ |
| C 元素特性（数据） | IR | 可操作、接收输入值、门控可见（`opened`）、不言自明、只能在某父组件里 | `INTERACTIVE_TYPES`、`VALUE_TYPES`、`GATED_CONTAINERS` | 部分（可操作、父组件） |
| D 编译钩子 | Node，编译期 | 校验与规范化节点、派生数据（布局）、生成 id、诊断 | ELK 布局、连线 id `a->b`、Menu 抄 `opened`、Image 检查 | ✗ |
| E 效果降级 | Node，编译期 | 插件效果 → 内核原语（状态写入、镜头目标、每步派生数据、媒体事件）+ 校验 | `trace()` → `step.traces` → 每步状态；`camera()` → `ui.__camera` + 导演换层 | ✗ |
| F 渲染 | 浏览器 | 叶子组件（自己画）与容器组件（子元素交给引擎渲染）；镜头目标在容器里怎样取景 | 所有组件；Canvas 的取景；3D 的 focus | 叶子 ✓，容器 ✗ |
| G 通用属性 | IR + 浏览器 | 插件声明能写在任意元素上的属性，并观察步骤之间的 DOM 变化 | `motion` / `motionDelay`（FLIP 飞行） | ✗ |
| H 媒体轨道 | 浏览器，按引擎时钟 | 播放、停止、淡入淡出，受暂停 / 跳转 / 旁白压低控制 | Alda BGM、音效 | ✗ |
| I 本机能力 | Node，只在作者机器 | 文本 → 资源（音频、模型、图片），按内容哈希缓存；build 时打包产物 | Alda → MIDI / 音频；朗读供应商（D74） | ✗ |
| K 动作与原生行为 | IR + 浏览器 | 声明字段/匹配/字幕；运行时识别 ctx.act；按引擎帧演示，原生本机值特性 | drag / hover / scroll、scene3d:rotate、UI 原生控件 | ✗ |
| J 主题与材质 | 浏览器 | CSS 变量包、描边方式（手绘 / 直线 / 玻璃……） | 内置 9 个主题、Rough | ✗ |

### 关键设计：插件只在编译期“降级”，播放器里没有插件代码

- 插件的**语义**（这个效果改了什么状态、镜头对准谁、这一步每个节点什么状态）在编译期由插件的 Node 端代码**降级成 IR 里的数据**：基础效果、镜头目标、每步的派生数据（`step.ext[插件]`）、媒体事件、元素特性。
- 播放器（`stateAt`、`explainClick`、焦点、导演）只读 IR，**不执行任何插件代码**。浏览器端的插件只负责“画”和“发声”。
- 好处：可复现性、`check` 的回放、发布站的播放都不依赖插件运行时；插件出错最多是某块画面画不出来（占位框），演示的步骤与状态不受影响。
- 例：Diagram 的 `diagramStateAt` 今天在浏览器里由 `traces` 推算；迁移后由插件在编译期算好每步每个节点的状态写进 `step.ext.diagram`，播放器和渲染器只取值。

### IR 是 Node 端与浏览器端唯一的桥

- 插件的类型名带命名空间 `插件 id:组件名`；派生数据放在命名空间槽位里：`node.ext[插件]`、`step.ext[插件]`、`project.plugins[插件]`。
- 插件为自己的槽位提供 zod schema，编译时校验；内核只校验信封。
- 发布模式下，内核按同一规则去掉创作侧信息（源位置、技能、本机路径），插件槽位里只能放演示需要的数据。

## 4. 插件包的形态

```
joplo-plugin-x/
  package.json        "joplo": { "api": 2 }，peerDependencies: @joplo-app/kit
  dist/index.js       创作入口（Node）：definePlugin 清单、JSX 标记、效果工厂、编译钩子、技能
  dist/runtime.js     运行时（浏览器）：渲染器、媒体驱动、主题 CSS
  dist/local.js       可选，本机能力（Node，只在作者机器）：资源编译器、需要的本机工具
```

- 作者 / Agent 的用法不变：`npm install` → `config({ plugins: [x] })` → `npx joplo skill x` → `import { X } from 'joplo-plugin-x'`。
- 运行时有两种写法：**框架无关**的 `mount(el, ctx)`（3D、画布、音频），和 **React 写法**（组件函数，使用宿主提供的同一份 React，打包时不重复打进去）。第一方 UI 插件用 React 写法。
- 容器组件通过宿主提供的 `ctx.renderChildren(container, nodes)` 让引擎渲染子元素（宿主用 portal 渲染进插件给的 DOM 位置）。

## 5. 契约（不变量）

1. **时间线状态只由步骤推进**：插件不能改时间线状态；`ctx.click(id)` 与 `ctx.act(id, 数据)` 都交给同一输入仲裁者。自由体验只改本机游玩层或插件本机视图，播放/跳转/重置丢弃（D88，第 14 节）。
2. **可寻址**：能被步骤、镜头、提示、检查引用的东西都是元素：有 id，在 DOM 里有锚点（`node.attrs`），摆在它在画面上的位置。
3. **确定**：同一个 ctx 画出同一个画面；`frame.animate = false` 时直接到终点；资源没准备好时用 `ctx.hold()` 让截图等待。
4. **自包含发布**：播放需要的一切都在站点里（IR、编译后的运行时、生成好的资源）；不依赖作者的电脑、本机工具或网络。
5. **创作信息不外流**：插件源码、技能、本机能力代码、本机路径都不进发布物。编译后的运行时仍可被读懂，真正要保密的逻辑放在本机能力里，只发布它的产物。
6. **版本**：插件声明接口版本（`apiVersion`），宿主只载入兼容的；IR 记录插件版本。已发布的站点自带当时的运行时，不受之后升级影响。

## 6. 迁移路径（每一步都可单独发布，现有示例不坏）

| 阶段 | 内容 | 用什么证明 | 完成标志 |
|---|---|---|---|
| 0（本版） | 叶子组件插件：清单、标记、技能汇总、看板载入、发布站内联、可操作特性 | `scene3d` + 智能家居示例 | 已完成；第三方能写 3D 一类的叶子组件 |
| 1 | 契约 v2：容器组合、元素特性补全（输入值、门控、取景）、编译钩子、效果降级、通用属性、媒体轨道、本机能力、React 写法与共享依赖 | 把 **Diagram**（编译期布局、trace 降级）、**Canvas**（容器、camera 降级、motion）、**Alda BGM**（本机能力 + 媒体轨道）做成仓库内的插件 | 三者从 core 移出，示例与测试照常通过 |
| 2 | 标准库：内置 UI 词汇按族（布局、排版、表单、浮层、导航、数据、AI 交互、设备外框、HTML 兜底）改成第一方插件，一律带命名空间（`ui:Button`），经同一个注册表接入；`COMPONENT_TYPES` / `IMPL` 由注册表生成；旧裸名给改写提示 | 守护测试：core、web 渲染宿主里不出现组件名 | 内核零组件名 |
| 3 | 分发与生态：标准库由 starter 模板显式安装和启用；插件模板（`npx joplo plugin init`）；私有标记与分享检查；第三方插件文档 | 一个仓库外的插件包 | 社区可以独立发布插件 |

阶段 1 用三个真实案例一起逼出接口，不先设计一个“通用插件框架”再找用例；阶段 2 只是搬家，行为不变。

## 7. 已定的选择（2026-11-08）

1. **信任模型**：第三方运行时与 Joplo 同页面运行，像 npm 依赖一样信任；必须在 `config({ plugins })` 里显式启用，分享时列出用了哪些插件。出现插件市场、陌生作者时再评估沙箱 iframe。
2. **命名**：标准库也一律带命名空间（`ui:Button`、`diagram:Diagram`、HTML 兜底标签归入一个第一方插件）。作者在 TSX 里照常写 `<Button>`，类型名由标记决定，命名空间只出现在 IR、check 信息与检查抽屉里。已发布的分享自带当时的运行时，不受影响；迁移时编译器对旧裸名给出改写提示。
3. **标准库归模板**（D89）：starter 显式安装并启用 ui、diagram、content、alda；引擎无默认插件。作者可同时删去 config 项和依赖，再运行 skill install 同步指南。
4. **私有插件（工作假设，待确认）**：内容可以公开，问题只在插件编译后的代码会随站点发布。默认不拦截；插件标了 `private: true` 时，`share` 公开分享前提示一次并要求确认。

## 8. 代价与重新评估的条件

- 代价：阶段 1–2 会改编译器、播放器和渲染器的核心路径（编译器里约 60 处按组件类型的分支、渲染器 3000 多行）；插件接口在阶段 3 之前标为实验性，第三方插件可能需要跟着改。
- 发布站体积：标准库总会打包；第三方插件带自己的依赖（three 约 700 KB）。React 写法共享宿主的 React，避免重复。
- 重新评估：如果标准库很少独立变化，就只保留“内部按插件组织”，不拆成独立的包；如果第三方插件开始来自陌生作者，就引入沙箱。

## 9. v1 的实现位置

- 创作接口：`packages/kit/src/plugin.ts`（`definePlugin`、`pluginComponent`、`defineRuntime`、运行时类型）；`config({ plugins })`。
- 编译：`packages/core/src/compile.ts`（`pluginsOf`、插件组件校验 `UNKNOWN_PLUGIN` / `PLUGIN_PARENT`）；`catalog.ts`（`isPluginType`、`isInteractiveType`）；IR `project.plugins`。
- 渲染宿主：`packages/web/src/renderer/plugins.ts`（注册表、载入）、`components.tsx` 的 `PluginHost`。
- 看板：`packages/server/src/project.ts`（`pluginRuntimesOf`）、`dev.ts`（推送 `/@fs/` 地址、dist 形态放行目录）。
- 发布站：`packages/server/src/build.ts`（`bundlePluginRuntimes`、`injectPluginScripts`）。
- 技能：`npx joplo skill`（`packages/cli/src/plugins.ts`）、`packages/core/src/guide.ts` 的 `plugins` 主题与 `pluginSkillTopic`。
- 示例：`plugins/3d`（three.js）、`examples/smart-home-3d`。

## 10. 阶段 1-A：契约 v2 与第一方 diagram 插件（已实现）

`plugins/diagram` 是可独立发布的 `@joplo-app/plugin-diagram`，与内核统一版本，由项目 config.plugins 显式启用。
`@joplo-app/plugin-ui` 的作者标记仍可导入，IR 类型改成 `diagram:Diagram`、`diagram:StateMachine`、`diagram:Sequence` 及其子组件；`@joplo-app/kit` 的 `trace` 保留兼容标记工厂，与插件效果工厂产生相同信封；语义仍归插件，kit 不反向依赖插件。
ELK、结构校验、连线默认 id、trace 解析与状态推进、状态机转换、绘制实现、diagram 技能和组件提示均归该包所有。Canvas、UI 族和媒体扩展不在 1-A 的范围内。

### 编译契约

`PluginDef.compile` 的四个同步钩子由 Node 宿主调用：

- `node(node, { ids, report })`：验证作者节点并可返回规范化节点。调用时子节点已处理，`ids` 可用于默认 id 去重。显式重复 id 仍由宿主诊断。
- `derive(node, { viewport, options, report })`：输入深冻结；返回 `{ data, framing }`，由宿主校验后只写自己的槽位及子树内的取景元数据，不允许改 id/children 或其他命名空间。diagram 按完整结构布局，隐藏状态不参与布局；错误保留已有的网格降级及 `DIAGRAM_LAYOUT_FAILED` 提示。
- `effect(effect, { roots, data, source, report })`：把 `pluginEffect(id, name, payload)` 降级为命名空间数据、`targets` 和 `references`。宿主把 targets 转成普通 shots、导演层与显式焦点；同一步多个效果按作者顺序合并。
- `frame({ roots, scenes, state, previousState, data, previousData, position, resolveProps, report })`：宿主回放内核效果后，生成第 0 步及各步骤的完整快照。无效作者步骤仍由原有 replay/check 诊断，不能令编译崩溃。

所有钩子的输入均为隔离的深冻结副本，不能污染后续步骤或其他插件。derive 后再次检查舞台内元素身份；frame 通过宿主注入的 resolveProps(node, previous?) 读取绑定值，无需依赖 core 实现。宿主先按属性描述符把四类钩子返回值物化成自己持有的数据，再校验和使用同一份数据；拒绝 getter/setter 和 toJSON 方法，不重复读取返回对象。node 的作者绑定转换为稳定标记。宿主在消费前检查返回值信封；先验证有限、无环、深度不超过 100 的 JSON，再验证插件 schema，最后才剥离创作信息。共享引用展开为独立副本，不复用输出子树；只缓存原对象的属性描述符，避免重复读取原始对象。深度从根 0 开始，按最终展开后的每条路径计算，包含原始值叶子；发布成功前还检查完整 IR（包括 scene/step/ext 外层）的深度。超过上限报 PLUGIN_DATA_INVALID，应压平数据或用字符串 id 表达关联，不能依赖共享对象绕过限制。异步钩子/异步 schema 被拒绝且其 rejection 被接住。

插件写入槽位必须提供 `schemas.node` / `schemas.step`（兼容 zod 的 `safeParse`）；宿主验证最终写入值的对应 schema，并由 IR 信封校验确保是 JSON；frame 返回 undefined 时保留的 effect 数据也必须验证。发布清理只剥离内核来源元数据，不能再改动已验证的插件槽位字段。缺失/失败的 schema 报 `PLUGIN_DATA_INVALID`，钩子或 schema 抛错报 `PLUGIN_HOOK_FAILED`，未注册的效果报 `PLUGIN_EFFECT_UNKNOWN`。源码位置随诊断保留。发布 IR 不保存钩子、schema、技能、运行时路径。

元素声明新增 `needsId` 与 `selfEvident`：编译/检查验证作者 id，焦点系统读取同一份 IR 声明，避免为自行表现变化的内容叠加 reveal。
D89 起不保留旧裸类型、step.traces 或重编译适配分支；图表状态只通过插件命名空间快照进入当前 IR。

### IR 数据流

| 数据 | 写入点 | IR 路径 | 读取点及消费者 |
|---|---|---|---|
| 布局与静态结构 | diagram `derive` | `scene.root…ext.diagram.{layout,structure}` | 插件 `graphView` / `sequenceView` → 绘制坐标与几何取景，浏览器不重新布局 |
| 累积 trace 状态、当前调用、状态机当前值/转换 | diagram `frame` | `scenario.ext.diagram.scenes[sceneId]`（初始）及 `step.ext.diagram.scenes[sceneId].{states,now,machines}` | `Stage` 选取当前槽位 → `PluginHost` 的 `ctx.ext` → diagram React 渲染；前后跳转直接读快照 |
| 解析后的调用记录 | diagram `effect` / `frame` | `step.ext.diagram.scenes[sceneId].traces` | 编译期快照计算；发布后的 feature-diff 比较插件表现差异（trace 类别） |
| 插件镜头目标 | diagram `effect.targets` | 既有 `step.shots`、`step.directorLayer`；新增 `step.focusTargets` | `cameraAt` / 导演 / `focusAt`；均只读内核数据 |
| 插件引用集合 | diagram `effect.references` | `step.references` | `scope.stepElementIds` → 范围发布保留需要的子树，含 skip 引用 |
| 镜头关联、绘制角色 | diagram `derive` | `node.framing.{include,kind}` | `inShotFrame` 读取 include；宿主 DOM `data-jframe*` → 镜头/聚光保留分组标题及消息参与者 |
| 调用所属舞台 | diagram effect → frame | effect 的临时 traceScenes → 最终 `ext.diagram.scenes[sceneId].traces` | frame 按舞台累计调用；scope 在同一 scene 域中投影，不发布独立的 traceScenes 数组 |
| 文本/投影声明 | 插件 data 元数据 | `project.plugins[id].data.{node,step}` | content-i18n 只翻译声明文本；scope 只保留范围内的缓存与快照 |
| 元素特性 | 插件组件声明 → 宿主编译 | `project.plugins[id].components[name].{needsId,selfEvident}` | 编译器与 validate 的 id 检查；focus 的自动 reveal 策略 |

槽位属于公开播放数据，插件作者不得放入本机路径、技能或创作备注。schema 只验证形状，不是保密机制。

### React、容器与共享依赖

v2 运行时组件选择 `{ mount }` 或 `{ react: ({ ctx }) => … }`。React 组件置于宿主 React 树中，拥有错误边界；`ctx.renderChildren()` 由宿主渲染子元素，传 `nodes, container` 时使用 portal。
第一方与第三方运行时均按显式项目配置载入，通过同一注册表和 PluginHost。发布时生成共享模块代理，延迟到宿主 React / ReactDOM / JSX runtime 就绪后求值；看板用 Vite dedupe 保证同一 React。仅接纳 API v2。

浏览器插件负责绘制/动画和 `ctx.click`，不推进业务状态。`stateAt`、`explainClick`、`focusAt` 和导演不调用插件代码。截图/视频的 `frame.animate=false`、资产等待 `ctx.hold()` 与逐段出现机制保留。

### 维护与验证

- 阶段 1 的历史 P2-11（阶段 2 已修，见第 13 节）：源码守护仍整体豁免 plugins 目录，浏览器检查只覆盖两个入口文件的直接依赖；尚不能防止专用语义经宿主目录或传递依赖回流。
- Node 边界、降级、快照与旧 IR：core plugin-v2、trace、diagram-compile、integration-028 测试。
- React 共享打包：server plugin-v2；容器与画面：web plugin-v2、diagram-v2、integration-028。
- diagram 技能的权威正文现在是 `plugins/diagram/src/guide.ts`，core guide 只路由及组合通用主题；仍运行 `pnpm skills:build`，并实际检查 `joplo skill diagram` / `plugins`。
- 验证普通发布前先确认 feature.pick：无 pick 的方案按既有规则不发布。若只检查全部备选，可用看板或 `buildSite({ review: true })` API；CLI 普通 build 仍只发布已选方案。不要把空站点当成图表播放成功。

diagram 的独立包交付已完成；阶段 1 的其他扩展点、其他第一方插件迁移和生态工具仍未完成，v2 在阶段 3 前保持实验性。


### P1-A review 修正：发布、投影与历史输入

- diagram 提供 build、dist、声明与 publishConfig，纳入 release 的七包集合：kit → plugin-diagram → core → web → server → cli → joplo。catalog/guide 仅由项目插件清单和技能命令读取，core 不导入标准插件；插件没有指向 core/web 源码的跨包相对导入。所有 Node 包沿用标准 tsconfig.build 与 build-package.mjs。
- 第一方浏览器代码通过 @joplo-app/kit/renderer 使用宿主注册的共享渲染服务，通过 @joplo-app/kit/renderer-style 使用纯样式常量。服务在调用时解析，避免模块初始化循环；业务状态仍由内核推进，插件只读快照。
- 第三方 React 桥接使用 web 包交付的 shared-modules.json 导出表，生产安装不需要从 web 的 devDependencies require React。导出表与当前宿主版本由测试对齐。共享模块代理优先于 Vite 的普通包解析，项目或插件实际安装 React 时也不会打入第二份实例；测试同时覆盖有/无 React、源码/预构建 web。
- 插件通过 data.node.text / data.step.text 声明文本路径（分段数组，* 代表对象值/数组项），普通 id、枚举、引用不会被盲翻。
- 插件通过 data.node.scope / data.step.scope 声明纯数据投影规则。map/items/values/reference 分别投影映射、实体数组、id 列表和单一引用；scene map 的键、scene items 的 references（默认 [["id"]]）提供所属舞台；items 的引用必须解析出唯一舞台，prefix 去除后再寻址，子规则只使用该舞台的元素集合。缺失/多义身份或没有所属舞台的元素投影都失败关闭，不用全舞台 id 并集兜底。只对确实独立于范围的数据使用 global。未声明规则的槽位在范围分享时失败关闭，报 PLUGIN_SCOPE_UNSUPPORTED。
- 图表缓存、状态机快照按合格舞台 id 寻址，元素 id 仍只要求在同一舞台唯一。裁剪节点后会同步裁剪结构/布局副本、场景和步骤快照；保留可见元素原有坐标，不调用插件代码重新布局。
- feature-diff 比较 scenario.ext 和 step.ext。对 b817425 的真实旧公开 IR，先严格适配裸名及 layout，再走公开数据检查；不丢弃 note/source 等私有字段来伪装兼容。适配用于历史对比，不是浏览器补算旧 trace 的回退。
- 验收必须覆盖公开包的 tsconfig.build、七包构建、tarball 和不含工作区开发依赖的安装；不能仅凭 pnpm typecheck / pnpm test 宣布发布正确。

## 11. 阶段 1-B：媒体轨道与本机资源（已实现）

第一方 `@joplo-app/plugin-alda` 与其余九包同版本，starter 显式启用 `alda({})`，没有音轨时不生成资源。作者安装后在 `config.plugins` 写 `alda(scores)`；`scores` 是项目 `music.ts` 中的命名文本字符串，步骤通过 `music.play(name, { fadeMs, loop, volume, from })` / `music.stop({ fadeMs })` 使用。技能正文归插件 `src/guide.ts`，在启用它的项目中读取 `joplo skill alda`。`examples/smart-home-3d` 的三个场景各自第一步播放，`done` 所在步骤淡出。

### Node 本机能力

- `PluginDef.local` 指向 Node 入口；默认导出 `PluginLocal`：`compilers[name] = { version, mime, inspect?, timeoutMs?, compile(input, { directory, maxBytes, home }) }`。返回 `Uint8Array`，临时文件写入宿主提供的工作目录；经校验的共享音色缓存放 home。可选 inspect 返回时长/marker/声部等本机数据，供最终同步编译的 ctx.resourceInfo 使用，不下载音色、不渲染、不付费。
- effect 钩子通过 `ctx.resource({ compiler, input })` 登记请求并取得不透明资源 id，再由原有 effect 宿主物化、校验返回的 `media` 命令。请求表与 local 路径只在 `CompileOutcome.resources`，不进入 IR，也不使用公开 ext 槽位传递源码。
- `LocalResources` 将本机入口及依赖打成 Node 模块，放在项目 `.joplo/resources/`；独立子进程执行编译，缺省硬超时 30 秒（声明 timeoutMs 可延长、上限180秒），输出上限50MiB。Alda 供应商另在 25 秒停止自身命令，失败提供可读信息。macOS/Linux 超时结束整个进程组；临时目录始终清理。
- 缓存键为 SHA-256(plugin id、compiler id、含 version 声明的编译器代码、精确输入文本)。代码变化也失效，不对文本空白做归一化。成功产物原子写入缓存；内存请求合并与磁盘租约分别覆盖同进程和跨进程并发，已有产物不再编译。失败不持久缓存，修复工具或源码后可重试。
- 看板首次播放需要资源时，向带 token 的 `POST /__joplo/p/:id/resources/:resource` 请求；只可请求当前已编译项目登记的资源，不能向接口提交任意文本或本机入口。`build/share` 先裁剪范围，再生成该范围实际引用的资源。
- 缺工具、语法错误、超时、产物过大分别通过 `LOCAL_RESOURCE_FAILED` / `LOCAL_RESOURCE_TIMEOUT` / `LOCAL_RESOURCE_TOO_LARGE` warning 降级；`at` 锚定作者 play 步骤的源文件:行:列，供应商信息可附配乐文本中的行号。看板通过独立的 joplo:diagnostics 事件更新 warning 横幅，不替换 IR、不重置时钟；成功重试清除对应 warning，旧编译版本的异步结果不覆盖新版本。构建把 warning 放进结果，项目其余内容继续播放。

### 通用媒体契约与时钟

effect 返回可选的 `media` 有序命令列表：

```ts
{ track: 'bgm', action: 'play', resource, offsetMs: 12000, volume: .2, loop: true, fadeMs: 800 }
{ track: 'bgm', action: 'stop', fadeMs: 1000 }
```

`track` 是插件内的小写 id；宿主补命名空间，不允许插件引用别家登记的资源。音量范围 0–1，淡入淡出范围 0–30000ms。宿主在现有 `PluginCompiler.frames` 回放中累计完整媒体状态，不把命令、作者效果或本机代码交给播放器。

每个场景初始静音。第一步媒体位置从 play.offsetMs（缺省0）开始；startOffsetMs 记录初始起点，让 marker 起播的淡入仍从0计时；后续步骤锚点按上一步的 `hold` 推进，没有显式 hold 时为 3000ms。每步的 `offsetMs` 固定在 IR 中，多语言不会重算；步内按 DemoController 的引擎时钟与速度推进，暂停冻结，跳入/回放按该步锚点对齐。朗读或交互可能让某步停留更久，因此切步会重新对齐，而不是把不确定的等待时间累加进后续位置。需要精确乐句节奏时显式写 `hold`。同步音频调度以 80ms 为重对齐阈值。

浏览器插件可提供 `runtime.media({ audio, destination, bytes })`，返回 `update({ offsetMs, playing, speed, loop, volume })` / `destroy()`；只负责解析产物和发声，不执行编译期语义。宿主掌管用户手势门槛、现有声音开关、暂停/继续、场景卸载、淡入淡出与旁白期间 25% ducking。异步加载后若场景已离开立即销毁驱动。媒体 hook 挂在交互播放器和视频录制路由；静态视图、缩略图、截图不挂载声音。标准音频由宿主 audio-media.ts 解码和播放；插件没有 runtime.media 时自动使用它。

Alda 在本机用固定 GM SoundFont 渲染 FLAC，不再向浏览器发 MIDI。`music.play(name,{from:'chapter'})` 的 marker 经 Alda parse 得到数字偏移；未知 marker 在本机检查可用时编译 error，缺 Alda warning 并继续其它检查。check 输出乐长、各声部音符数和 marker 时间，并按连续播放区间提醒提前静音或过短循环。详细选型/许可、音色预安装、循环尾音/接缝、体积预算、字段流向和 F 合并范围见 [SoundFont 配乐管线](music-rendering.md)。

### 新字段的端到端流向

| 字段 / 槽位 | 写入点 → 存储 | 读取点 → 消费者 |
|---|---|---|
| `PluginDef.local` | 插件 author 入口声明 → 仅 Node 的 `CompileOutcome.resources.host` | `LocalResources` → Node 编译子进程；不进入 IR/发布站 |
| `ctx.resource` 请求的 `id/plugin/compiler/input/source` | effect 回调 → 宿主物化请求 → `CompileOptions.onResource` → Node 请求表 | 看板资源端点 / `inlineResources` → 缓存和供应商；源码、source 与本机入口不发布 |
| effect 输出 `media` 命令 | 原有 effect 宿主物化/校验 → `PluginCompiler.mediaCommands` 临时表 | 原有 frames 回放 → 完整快照；命令本身不存 IR |
| `scenario.media` | frames 写第 0 步空快照 → IR（无媒体的旧项目省略） | `mediaAt` / `useMedia` → 初始静音 |
| `step.media[plugin:track]` | frames 累计与降级 → IR | `mediaAt`、`useMedia` / `MediaEngine` → 浏览器插件驱动 |
| 快照 `plugin/resource` | effect 所属插件与登记资源 → 命名空间快照 | 运行时注册表选媒体驱动、`mediaAssets` 选字节；范围裁剪据 resource 选产物 |
| 快照 `offsetMs/volume/loop/fadeInMs/stopAfterMs` | play/stop 与前一步 hold → frames | 引擎步内时钟推进 offset；宿主增益包络和 ducking（跨步淡出同步缩放 volume 与剩余 stopAfterMs）；宿主音频循环、定位与倍速播放 |
| `project.mediaAssets[id]` | 看板写本机资源端点 URL；build 在 scope 后写 `data:<mime>;base64,...` → IR | 媒体宿主取 bytes；发布站直接解码内联数据，不 fetch，不需要网络或作者机器 |
| `runtime.media` | 插件 browser 入口 → 现有运行时注册表 / 发布内联脚本 | 媒体宿主 factory/update/destroy；与组件注册复用同一个插件运行时机制 |

`scopeProject` 同步裁剪 mediaAssets；翻译仅处理既有文本声明，媒体字段不参与翻译。公开数据只有播放快照、压缩音频/其他编译产物与 credits.txt与运行时代码，**不公开配乐源文本**。项目中的文本仍由 Git 管理，`.joplo` 缓存与二进制不提交。

### 验证与已知边界

- core `media.test.ts`：fake 插件效果降级、纯快照跳入、范围裁剪、翻译不变性与供应商边界守护。
- server `local-resources.test.ts` / `media-build.test.ts`：缓存/版本/精确输入、同进程及跨进程并发、四类失败、本机按需 API 与诊断、真实 fake WAV 的范围构建、内联与源码隔离。
- web `media.test.ts` / `audio-media.test.ts` / `voice.test.ts`，plugin-alda `audio.test.ts`：手势门槛、生命周期、旁白压低、停播淡出、FLAC 样本数/无损PCM/循环接缝、引擎时钟、暂停/倍速及 <100ms 步边界验证。
- 发布集合：统一版本十一个包；smoke 另外直接载入可选插件 author/local/runtime 出口。starter 显式启用 Alda，纯引擎不隐式装载插件。smoke 在有 Alda2.4.8 时实际渲染；否则明确打印 SKIP，不能把它称为音频验证通过。
- 已知边界：通用媒体轨道已接入视频混音，旧的浏览器 Web Speech 旁白尚不可录音；本任务不实现跨章继承或交叉淡化。Alda 本机编译在发布后不可补做；漏配工具时修复后重新 build/share。

## 12. 阶段 1-C：讲解内容、通用属性与插件主题（已实现）

`@joplo-app/plugin-content` 是第一方插件，版本与其余九包一致。项目必须在依赖中声明并在 `config.plugins` 显式启用；starter 已包含这两项。作者从它导入 `Canvas / camera`，从 kit 导入通用 `flow / patch / narrate / hold`。IR 类型为 `content:Canvas`，主题为 `content:studio`；技能正文在 `plugins/content/src/guide.ts`，`joplo skill content` 从当前项目已启用插件的技能元数据读取。PR #35 **未合并**：仅读取 8284901、0fcb8f5 及远端分支最终内容，示例仅调整导入和主题配置。

### 通用属性与布局观察

插件可在任意元素上贡献字面量属性：

```ts
properties: {
  badge: { type: 'string', nonempty: true, attribute: 'data-jp-probe-badge' },
  weight: { type: 'number', min: 0, max: 10, attribute: 'data-jp-probe-weight' },
  pinned: { type: 'boolean' },
}
```

- 宿主校验声明、类型、有限数字和上下界；声明不允许绑定、保留属性或覆盖宿主 DOM 锚点。`attribute` 必须在 `data-jp-<plugin id>-` 命名空间，省略时仅保留 props。不同插件声明同名属性或重复 DOM 属性报 `PLUGIN_PROPERTY_CONFLICT`；无效声明 / 作者值报 `PLUGIN_PROPERTY_INVALID`，指向作者位置。
- 属性留在普通 `node.props`，不增加专用节点字段。渲染宿主只按元数据映射成字符串 DOM 属性：普通组件根、插件组件根、`ctx.node.attrs` 与子锚点一致。`false` 和 `0` 也保留。
- `runtime.observe(root, { frame, ext })` 可创建 `{ update(context), destroy() }`。宿主在子组件提交布局后调用 update，根限制为当前舞台。场景、舞台或运行时变化时销毁重建，卸载必清理；失败只禁用该实例，直到生命周期变化再尝试。观察器只绘制，不承担业务状态推进。首次载入后的布局、普通步骤、静态跳转均可观察。
- content 声明 `motion / motionDelay / motionMs / screen`。FLIP 观察器按设计坐标缓存同键物体的旧位置与尺寸；使用独立 translate/scale，保留作者 transform。镜头和物体同一步移动时共用时长、缓动；`motionMs=0` 是显式直达。`animate=false` 取消未完成的 FLIP；插件自己的静态 CSS 让作者动画与过渡直接展示终态。截图不会播放 FLIP。
- `screen` 仅分离 Canvas 的直接子元素；两组子元素仍由宿主 `ctx.renderChildren` 按 model 节点 id 渲染，保留直接文本子节点。宿主不知道这些属性的名称或含义。第二个无组件 fake 插件也能给普通 Text/div 透传属性、读取提交后的 DOM 和当前步骤，证明接口不依赖 content 容器。

### 插件主题 CSS

`PluginDef.themes` 为插件内主题名到 CSS 字符串的映射，名字只接受小写字母开头的字母 / 数字 / 连字符。IR 存在 `project.plugins[id].themes`，选择名为 `<id>:<name>`；错误报 `PLUGIN_THEME_INVALID` 或 `THEME_UNKNOWN`。它不存本机 CSS 路径，不需要浏览器动态 import CSS。

`projectThemes(project)` 合成命名空间插件主题和作者主题，后者同名时优先。原 `project.themes` 继续只代表作者 CSS，旧项目和测试不变。看板主题列表、Stage 外观、render、封面与发布站统一使用这个合成入口，再走现有 `scopeThemeCss / ThemeStyles`。feature-diff 和本地评审签名也计入插件主题。第二个 fake 插件的 `probe:night` 经相同流程在真实 Chromium 生效。发布物自含 CSS，可在 file:// 下使用。

### 效果降级和通用接力

`compile.effect` 可返回 `writes: [{ path, value }]` 与 `directorTarget`。writes 是有限无环 JSON，路径只允许安全的 `ui / data / inputs` 子路径（拒绝原型污染段），按作者顺序降成普通 `set`；与其他内核效果保持顺序。directorTarget 只在没有显式 shot 的导演选择时选目标所在层，优先于 cue / 操作目标，不产生镜头框。需要范围发布的 id 同时放在 references。播放器始终只读普通 effects、directorLayer、shots 和 ext，不执行 compile 钩子。

content 的 camera 工厂产生插件效果信封，插件校验 `CAMERA_UNKNOWN / CAMERA_INVALID`，写 `ui.__plugins.content.camera`，并在 frame 钩子输出每个舞台完整的取景快照（初始帧也有）。PR #35 示例的初始 `ui.__camera` 仅由插件兼容读取；后续新状态优先。Canvas 运行时只读编译快照，按目标 DOM 的 offset 布局范围取景；没有目标时看完整世界，默认视口 1280×800、默认 pad 48、zoom 上限 3、运动 1200ms。父容器没有高度时使用 view 的 aspect-ratio 撑开。任意一步直达与从头播放到该步，最终画面相同。

引擎迁入 `flow({ from, layer })`、`patch()`、步骤效果数组、旁白时长估算与分镜。接力先按依赖决定逐步校验使用的路径 / 导演层，再回放前章结尾叠加本章 state，最后生成插件快照；IR 保持声明顺序。IR 记录 `Scenario.from`（D92：连续播放一镜到底、媒体快照继承、播放顺序；分享范围外的 from 被裁掉），初始状态与可选 `initial.layer` 仍是回放结果。错误为 `FROM_UNKNOWN / FROM_CYCLE / FROM_FAILED / FROM_WITH_START / LAYER_UNKNOWN`。分镜含初始画面与每一步，标注字幕和旁白，告警带步号前缀；`--columns` 控制 1–6 列。

### 新字段与槽位的端到端流向

| 字段 / 槽位 | 写入点 → 存储 | 读取点 → 消费者 |
|---|---|---|
| `PluginDef.properties[name].{type,min,max,nonempty,attribute}` | Node 清单 → 宿主校验 → `project.plugins[id].properties` | 编译节点值检查；rootAttrsOf → 宿主 / 插件 DOM 锚点；浏览器不携带校验函数 |
| 任意元素的声明属性 | 作者 JSX → 普通 `node.props` | 宿主按声明映射 `data-jp-<id>-*`；插件容器与观察器读取；不进入内核条件分支 |
| `PluginDef.themes[name]` | CSS 字符串 → `project.plugins[id].themes[name]` | `projectThemes` → 带命名空间的主题目录 → ThemeStyles / 外观 / diff / 本地评审；build 内联、file:// 无网络 |
| effect `writes[].{path,value}` | Node 插件 → 宿主物化及路径 / JSON 校验 | `step.effects` 的普通 set → stateAt、接力及编译 frame；writes 信封不发布 |
| effect `directorTarget` | Node 插件 → 临时目标列表 | 层寻址 → 既有 `step.directorLayer`；不加入 shots/focusTargets；配套 references 进入范围裁剪 |
| `ui.__plugins.content.camera` | content effect → 普通 set 状态 | 仅 content frame 读取；通用 flow 接力只传递普通状态；播放器不知道键含义 |
| `scenario.ext.content.scenes[sceneId].camera`、`step.ext.content.scenes[sceneId].camera` | content frame 在接力之后生成 → 插件 schema 校验 | Stage 取对应初始 / 步骤 ext → ComponentCtx.ext → Canvas 根据 targets/pad/zoom/ms 绘制；scope 按 scene / element 裁剪 targets；无可翻译文本 |
| 插件内 `world.dataset.flightMs/flightEase` | Canvas 布局效果按本次取景变化写入 DOM | content observe 在宿主提交布局后读取，FLIP 与镜头同步；仅插件运行时数据，不进 IR |
| `runtime.observe`、`PluginObservation.{frame,ext}` | 插件浏览器入口 → 注册表 | Stage 提交布局 → update；卸载 / 场景变化 / 热更新 → destroy；仅存在浏览器，不存 IR |
| `data-jreport-viewport` / `data-jreport-surface` | 任意插件绘制的 DOM 能力标记 | render 的通用报告：平移视口内仅检查下一目标出画、报告零尺寸表面；引擎不含组件名 |
| `FlowOpts.from/layer` → `Scenario.initial.layer` | 作者接力声明 → 依赖编译 / 结尾回放 → 初始 state 与 layer | initialState / cameraAt / 插件初始快照；`Scenario.from` 进入 IR（D92），其余作者声明不进入 |
| `SheetOptions.{columns,cellWidth}` / `SheetResult.{path,steps,warnings}` | CLI --sheet/--columns 或 server API → renderSheet | 原 render 路由逐步截图 → 网格 PNG；无新增项目 IR 字段 |
| `PluginDef.properties[name].values`（D92） | Node 清单 → 宿主声明校验（仅字符串属性） | 编译节点值必须是其中之一，否则 PLUGIN_PROPERTY_INVALID 并列出可选值；`project.plugins[id].properties` 原样携带 |
| content 属性 `enter/exit`、`enterMs/enterDelay/exitMs/exitDelay`（D92） | 作者 JSX 字面量 → 声明属性校验 → 节点 props → `data-jp-content-enter*` / `-exit*` | content observe：新出现的节点按 enter 播放；MutationObserver 在提交后同步取到被移除的子树，按 exit 克隆幽灵放回原父元素原位置、按上一次提交缓存的布局绝对定位；动画交给引擎时钟采样；跳转 / 自由体验 / 停止 / 静态 / 卸载时落定 |
| `camera(…, { drift })`、`<Canvas drift>`、`<Canvas safe>`（D92） | 作者 → content effect / node 钩子校验（CAMERA_INVALID）→ drift 随镜头状态写入 `step.ext.content.scenes[sceneId].camera.drift`；Canvas 的 drift / safe 是节点 props | Canvas 用 `frame.clock.timeMs` 逐帧计算镜头段（从实际取景出发 → 落定 → 漂移到终点）；`frame.animate=false` 显示落定取景；safe 只影响带目标的取景与漂移中心 |
| `Scenario.from`（D92） | 编译 from 接力 → IR；scope 裁掉范围外的 from | 编译期媒体快照继承；演示控制器连续播放时一镜到底（不倒计时、不 stop、不换 epoch） |
| 媒体快照 `<plugin>:<track>>[资源]` 淡出键（D92） | 编译期：换曲且有 fadeMs 时旧曲移到该键并带 stopAfterMs | MediaEngine 把旧槽位挪到淡出键继续播；同一 seek 内偏移跟随引擎时钟；`Snapshot.seek` 变化才按快照重新定位 |
| `PluginFrame.inputs`、`Snapshot.inputs`（D92 R6） | 控制器 stageInput（舞台上的点、按键、拖动按下）计数 → Stage `inputs` → 插件 frame | content observe：计数变化即落定进退场（幽灵、进场）；播放器暂停键不改变它；镜头冻结不落定 |
| 媒体槽位的淡出锚点（D92 R2） | MediaEngine 第一次看到某键的 stopAfterMs 时记下引擎时间起点、时长与音量 | 之后的快照估算不再改变；淡完静音不复活；快照提前删除的淡出键在同一 seek 里按引擎时间淡完再销毁 |
| `playSequence(project, optionId)`（D92 R9） | 方案场景：根按声明顺序，深度优先接上 from 接力章，排除 autoplay:false 子树 | 控制器缺省 autoNext 与录制 --chain 共用 |
| `FilmOptions` / `FilmResult`、`VideoOptions` / `VideoResult`（D92） | CLI `render --film/--video` 或 server API → renderFilm / renderVideo | 渲染路由 `record=1&chain=1&voice=estimate`；胶片条 PNG + JSON、webm；无新增项目 IR 字段 |

### 证据与边界

- PR #35 的三个测试文件迁入 `plugins/content/test`；通用扩展、生命周期、深链一致性与静态取消动画另有 Node / SSR / 真实 Chromium 覆盖。content 守护递归检查 core、renderer、player，包括插件宿主目录；不改变 P2-11 记录的其他族历史边界。
- llm-explainer 与 0fcb8f5 的 check diagnostics 完全相同（0 error、0 warning、1 HAPPY_PATH_ONLY info）。14 个关键 render 截图覆盖五章、封面、接力起点、对象飞行、推拉与收尾；PNG 字节相同，像素差比例及平均绝对差均为 0。原图、哈希和日志在本地 `output/playwright/p1-c/`，验收汇总在 `.done-P1-C`，不发布会话产物。
- 本阶段保持原示例视觉和内容，未重新设计素材或叙事。技能沉淀：同物体贯穿章节、镜头与 FLIP 同步、screen 覆盖层、无高度容器恢复、静态动画取消、接力在快照前解析、分镜与实际播放分别验证、示意数字与事实来源分开。
- 通用属性当前只接收字面量；插件观察器是可信的 npm 绘制代码，与页面同域，不是沙箱。音乐视频混音、逐词旁白同步、素材剪辑与地图组件仍不在本阶段范围内。

## 13. 阶段 2：UI 插件与无组件词汇内核（D87）

标准 UI 与 HTML 兜底由 `@joplo-app/plugin-ui` 提供，与其他九包统一版本，由 starter 显式启用。作者从 `@joplo-app/plugin-ui` 直接导入并写 `<Button>`，标记产生 `ui:Button`；kit 不再提供组件转发。HTML 直接写 `<div>`，由启用插件的 `intrinsic` 声明编译为 `ui:div`。HTML 与 UI 共用 `ui:` 命名空间，不另设隐式内置词汇。`Custom`、`#text`、`#fragment`、Slot/Outlet 展开和通用 Joplo 属性仍归内核。

UI 的目录、属性提示、示例、资源检查和 React 实现在 `plugins/ui/src`。`joplo components` 与 `joplo components <名称>` 从当前项目启用插件的清单生成；`joplo skill ui/components` 提供 UI 主题，无项目时没有插件目录。名称可用唯一的短名或完整命名空间；短名冲突时使用完整名称。组件示例保持作者 TSX 写法，不能把 IR 类型名直接当成 JSX 标签。`catalogFamily` 只控制技能目录中复合家族的折叠，详情命令仍展开所有子组件。

### 数据声明与消费者

`PluginComponentSpec.traits` 经严格 schema 校验。无效字段、非有限尺寸和错误枚举报 `PLUGIN_TRAITS_INVALID`；不是静默忽略。编译器把播放所需特性复制到 `node.traits`，显示属性声明保存在 `project.plugins[id].components[name].traits.{text,textPaths}`，避免给每个节点重复存文本属性表。任何播放路径只读 IR，不回调插件编译器。

| 字段 / 能力 | 写入点 → 存储 | 读取点 → 消费者 |
|---|---|---|
| `interactive`、`needsId`、`selfEvident` | 插件清单 → `PluginCompiler.info` → `project.plugins.*.components` | 编译/validate 的 id 与交互诊断；explainClick 与 DOM 可操作锚点；focus 的默认揭晓策略。沿用 v2 字段 |
| `traits.input` (`single` / `multiple`) | 清单 → `node.traits` | `checkStep` 判断输入目标；`selectedValue` 处理多值切换；type/toggle/select 写 `state.inputs[id]` |
| `traits.gate` | 属性优先级列表 → `node.traits.gate` | `isSelfVisible` 读取第一个非 undefined 属性、解析绑定；isNodeVisible、visibleIds 和 RenderNode 共用它；false 不被后备属性覆盖 |
| `traits.choices` | 属性、后代类型与 value/label/labelChild、或数值范围声明 → `node.traits.choices` | `choicesOf` → 编译期自动字幕、播放选项校验与 label/value 匹配、插件绘制；缺少可枚举项时保持原有不限制语义 |
| `traits.toggleCaption` | 清单 → `node.traits.toggleCaption` | 编译器自动字幕选择 check/uncheck；写入既有 `captionAuto`；播放器不认识具体输入组件 |
| `traits.selfEvident` | 清单 → `node.traits.selfEvident` | focus 排除自带状态反馈的元素，避免重复 reveal |
| `inherit[].{target,props}` | 清单 → Node 宿主的已校验继承表 | 编译器递归子节点之前抄写指定属性；显式子属性优先、嵌套同类型拥有者建立新边界；结果只存普通 `node.props`，继承规则不进发布 IR |
| `traits.layout`、`traits.region` | 任意区域名与尺寸/断点声明 → 对应节点 traits | `layoutRegions` 解析绑定、断点、mobile/desktop 折叠；播放器、focus 和 UI 插件共同读取，宽度与可见性一致 |
| `traits.childWidth` | 缺省宽度与属性条件覆盖 → `node.traits.childWidth` | `childWidth` → 可见性遍历及 UI 设备内部的渲染上下文；屏幕外节点继续使用外部宽度 |
| `traits.frame` | 插件对有框容器的声明 → `node.traits.frame` | 宿主输出 `data-jframe-container` → camera 的通用上下文取景；不干扰图表已有 `data-jframe` 身份 |
| `traits.disabledPresentation` | 清单 → `node.traits` | validate 不把仅控制外观的 disabled 误报为缺少不可用原因；不会自动把普通操作元素豁免 |
| `traits.text` / `traits.textPaths` | 每个组件的显示属性、嵌套文本路径（`*` 匹配数组项/对象值）→ `project.plugins.*.components.*.traits` | collectMessages/localizeProject/pruneMessages 只处理声明显示属性；`#text`、通用 disabledReason 和状态/条件仍由内核处理；枚举不会因碰巧同文而翻译；表格只翻译列标题、不把 badge 颜色映射当作文本；既有 diagram 和 scene3d 显式声明其标签文字 |
| `intrinsic` | 清单 → 编译期 tag → type 注册表 | JSX HTML 原始标签在编译时变为 `ui:*`；未声明标签仍报 UNKNOWN_COMPONENT；映射表不进 IR |
| `example`、`catalogFamily` | 清单 → Node 技能目录 | components/skill 输出属性、行为分组、示例与复合家族；不存 IR，不进浏览器 |
| 图片资源检查 | UI 的既有 `compile.node` 钩子 | 检查嵌入资源与 fit，产生 IMAGE_PLACEHOLDER/INVALID_IMAGE_FIT；图片数据仍是普通 props.src，浏览器仅绘制内嵌图片；没有新增只声明不消费的资产字段 |
| `runtime.viewports[name]` | 浏览器插件注册 `{insets,size,react}` | StageViewport/RenderApp 按 viewport 能力取外框、计算缩放和焦点偏移；只负责绘制，不改变状态；无注册时退回普通舞台 |
| SDK 共享服务 | 宿主注册 `layoutRegions/choicesOf/childWidth/resolveValue/styleOf/nodeLabel/useLook/RendererContextProvider` | UI runtime 调用同一份宿主纯函数、主题和上下文；局部 Provider 仅覆盖 width/dialogLayer；无反向 core/web 源码导入 |

### 历史输入、浏览器边界与发布

- D89 删除旧 UI 裸名改写提示及旧 reader 夹具；只接纳当前插件声明与 IR 契约。不让播放器猜测缺失语义，不改已有静态发布物。
- P2-11 已修：组件词汇守护递归扫描 core、渲染和播放宿主，包含 `plugins/` 子目录。只有精确的作者技能正文文件作为文档例外；不再豁免整个目录。AST 守护检查组件类型字面量，避免把几何 `Box` 类型、英文动词或播放控制栏的同名控件误认为内容词汇。
- 另一守护从浏览器入口和所有第一方运行时追踪可执行 import、re-export 和字面量动态 import 的传递依赖；类型引用被擦除。禁止编译器、插件创作入口、技能、历史适配器、本机能力和布局/状态计算模块进入这张图。Diagram 的路径采样已从布局模块拆到纯绘图 geometry 模块。
- web 使用 `@joplo-app/core/runtime`。发布站既有 core-lite 别名同时覆盖该入口，避免带入看板用的运行时 schema。UI 与其他第一方运行时经同一个注册表和 PluginHost，React 继续共享；子树数据按需物化，避免每个 UI 节点重复展开所有后代。
- 十包 release/version/pack/smoke 覆盖 plugin-ui 的 author/runtime/catalog/guide 出口，starter 的 config.plugins 已显式配置全部标准插件。版本元数据读取自身 version.json，发布脚本同步更新；不依赖工作区文件或作者机器路径。smoke 会直接导入 UI runtime；其 react-dom 属于正式运行依赖，不能仅靠开发依赖或预构建网页掩盖缺包。

### Cordis 的参考价值（本阶段不引入依赖）

参考 [Cordis 仓库](https://github.com/cordiverse/cordis)及其链接的[入门文档](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer)：上下文提供服务、显式 inject 依赖、注册具有对应 disposer，适合检查 Joplo 宿主服务和运行时生命周期的边界。Joplo 的确定性业务语义仍须编译为 IR；动态服务容器不能替代该协议。当前 P2 沿用已有 v2 扩展点；若后续作者端出现真实的服务依赖、热重载需求，再独立验证 Cordis 的收益与成本。上游目前声明 API 尚不稳定，本文不把尚未引入的机制描述成已实现功能。

## 14. P1-D：自由体验、动作扩展与统一时钟（D88）

画面由确定的时间线和本机游玩层组成。播放中会改动画面的第一下输入先暂停，再将同一次输入原样交给既有仲裁；效果与手动暂停后再操作一致。点击、输入、选择、插件动作、3D 旋转立即生效；拖拽按下时暂停，同一次拖拽继续完成；滚轮暂停并滚动，连续惯性仍留在滚动容器。hover 不暂停，已暂停时正常匹配；触屏点按完成 hover 按点击处理。空白/无交互元素只暂停，不出现“不保留”提示；封面/过渡卡保持 inert。控制条及播放快捷键不变，编辑键仍归输入框。判定只有一个入口：下一步的动作类型、目标与值匹配 → 提交该脚本步骤并丢弃游玩层，停在推进后的状态、不自动续播，后续 system 步骤也等待观众继续；同方案另一场景在相同舞台上可进入的动作 → 确认后回放到它前一位置；作者自由反应/组件原生行为 → 仅改游玩层；否则沿用提示。播放、跳步、换场景和重置丢弃游玩层；媒体、光标与插件演示从冻结的逻辑时刻继续。

### 作者接口与边界

```tsx
import { $, free, flow, option, set } from '@joplo-app/kit';
option({
  name: 'Explore', idea: 'Scripted results with local exploration',
  free: { profile: free.click('avatar', set($.ui.card, true)) },
  scenarios: {
    main: flow('Arrange')
      .drag('tile', 'slot', set($.ui.placed, true))
      .hover('help', 600, set($.ui.tip, true))
      .scroll('list', 'last_row')
      .act('probe:rotate', 'model', { angle: 90 }, set($.ui.angle, 90)),
  },
});
```

`free.click/type/select/toggle/drag/hover/scroll/act` 返回单条声明，无时间线顺序；同名反应键在对象内唯一。当前只接受 `set`、`push`（IR append）、`toast`，目标必须存在于本方案；不允许导航、完成、媒体或有派生快照的插件效果。纯数据编译保证播放器不调用插件业务代码。自由值匹配采用和步骤相同的规则，不执行任意函数；首个匹配声明生效。

UI 插件用 `traits.native` 声明输入类型和 `value/checked` 属性；Tabs、Accordion、真实文本输入、Switch、Checkbox、Radio、Select、SegmentedControl 不需作者写事件回调。原生动作同时写本机 `inputs[id]` 与绑定的属性路径，使 UI/3D 的相同绑定一起变化。组件自身的展开选择菜单属于本机视图状态，必须响应 `resetKey`。悬停外观由 `traits.hover` 声明，滚动区域使用浏览器本机滚动；滚动步骤的最终位置由脚本动作回放。拖拽坐标是舞台 CSS 像素；滚动坐标是容器内容偏移；到元素的端点必须存在于当前舞台（滚动端点必须在容器内）。坐标匹配半径为 16px，hover 必须达到声明的停留毫秒数。

### 插件动作契约

```ts
// Node 清单：普通数据，不含识别器或业务匹配函数。
actions: {
  rotate: {
    caption: 'Rotate {label} to {data.angle}', durationMs: 800,
    targets: ['probe:Scene'],
    fields: { angle: { type: 'number', min: 0, max: 360, tolerance: 2 } },
  },
}
// 浏览器识别器：报告目标和数据，是否推进由引擎决定。
ctx.act?.('model', { type: 'plugin', name: 'probe:rotate', data: { angle: 90 } });
// 演示器：在 mount/update 或 React 组件里按 frame.gesture.progress 绘制。
// frame.gesture.action 给出目标/数据；frame.clock 是唯一时间来源。
```

字段类型为 string/number/boolean，payload 键必须精确匹配；数字范围用于校验，tolerance 用于手势匹配。`text: true` 仅用于需要翻译的字符串值，身份枚举默认不翻译。字幕支持 `{label}` 和 `{data.key}`；作者也可提供步骤字幕。`targets` 约束接受该动作的完整组件类型；组件名和动作名均由插件拥有。`scene3d:rotate` 实证方位角/仰角匹配、鼠标与键盘识别、引擎时钟演示；脚本将角度写入绑定，使直接进入和截图可复现。

### 时钟与输入归属

- `DemoController.clock` 是唯一时间积分器。等待、光标路径、内置手势、插件 `frame.clock`、`frame.gesture`、流式文字和媒体偏移都读取同一逻辑时间；暂停不积分，速度在同一处应用。
- React 插件从 `@joplo-app/kit/renderer` 导入 `motion`，宿主提供 Motion driver；CSS/WAAPI 动画由宿主暂停原生计时并按引擎时间采样，SVG 动画也由宿主采样。第三方组件只能读取帧进行绘制，不得自行启动 timer/RAF 累积演示时间。无 clock 或 `animate:false` 时画最终状态。第一方运行时源码守护以及时钟适配器测试防止倒退。
- 拖拽始于声明的 drag 目标/`traits.draggable` 时优先归该元素，否则由插件视角或舞台平移处理；输入框拥有其编辑键。触屏将 hover 降级为点按；聚焦拖拽目标后 Enter/Space 提供执行该动作的替代入口。舞台捕获阶段消耗暂停输入，包含后续 pointerup/click、同次按键的重复事件和滚轮惯性序列。手机横屏改用独立控制条，移除盖在舞台上的滑动切步层，避免它抢走原型拖拽。
- 界面展示角落状态、改动不保留说明与可聚焦 Reset；跨场景提示可取消、Escape 关闭、按钮确认。只索引同方案、同舞台且前缀回放成功、目标当时可操作的位置，不把未验证的位置当作可进入。

### 字段端到端流向

| 新字段 | 写入/编译 | 消费者 | 范围、翻译、diff 与静态输出 |
|---|---|---|---|
| `OptionDef.free` → `options[id].free[key].{action,effects,source?}` | kit `free.*` → compile 目标/效果校验，source 发布时移除 | core `arbitrateAction/applyPlayground` → controller 本机层 → Stage 视图 | scope 移除目标/端点被裁掉的反应；i18n 映射匹配值和显示效果；diff `free-reactions`；静态输出只保留声明、从不应用观众操作 |
| `action.{type:drag/scroll,target,to}` / `hover.ms` | Flow 工厂 → Action schema → 端点/时长 check | 控制器演示、Stage 手势、纯数据匹配；scroll-state 回放最终滚动 | scope 的 stepRefs 包括端点；坐标/ID 不翻译；captionAuto 文案本地化；diff action；render 在对应步应用脚本滚动 |
| `action.{type:plugin,name,target,data}` | Flow.act → 已启用清单/类型/payload 校验 | 通用匹配；插件运行时读取 gesture 绘制，无业务回调 | scope 保持有效目标；仅 text 字段参与翻译；diff action 与 action-contracts；最终效果由脚本 set 决定 |
| `PluginDef.actions` → `project.plugins[id].actions` | PluginCompiler JSON 信封 + schema | matcher / check / caption / 控制器时长；浏览器无需 Node 清单 | 作为可发布契约数据；不带源码/计时器；diff 比较使用到的契约 |
| `traits.{native,hover,draggable,selectionGate}` → node.traits 与 plugin components | UI/第三方声明 → 既有特性 schema 和节点复制 | 原生本机值写入、悬停属性、输入归属；selectionGate 声明祖先值控件及面板值来源，使 check/跨场景索引排除未选中面板 | 同既有节点投影进入 scope/diff；无组件名进入内核；静态不附加游玩行为 |
| 宿主 `RenderContext.draggable` → `data-jdraggable` | 从本方案步骤/free 的 drag 目标与 traits 合并 | DOM 仲裁、3D 射线识别器读取同一宿主标记，元素拖拽优先于 orbit | 纯本机派生集合；不进 IR；静态帧不提供动作入口 |
| SDK `ctx.act` / renderer `act,interactive` | Stage 将识别数据传给 DemoController.act | 一个仲裁者，含原始 click 与原生值意图 | 不序列化；render/缩略图不传可执行输入入口 |
| SDK `frame.{clock,gesture,playground,resetKey}` / renderer 同名字段 | controller 引擎时间、演示进度、本机层和 epoch → Stage → 插件/观察器 | 绘制、冻结、恢复本机视角/菜单；UI 使用宿主 motion | 不进 IR、URL、分享数据；静态帧无本机层或时钟 |
| Snapshot `playground,freeMode,switchPrompt,gesture` | 仅浏览器控制器持有；项目/位置变更清理 | 共用 PlayerPage/StageViewport 的提示和画面 | 看板/发布/嵌入共用；深链和导出只取 Snapshot.state，视频只按脚本运行 |

`clock` 的子字段：`timeMs` 为累计逻辑时间、`elapsedMs` 为当前脚本步骤锚点后的逻辑偏移、`rawMs` 为同一次积分得到的未缩放经过量（用于不随倍速变化的等待）、`running/paused/speed` 为调度状态；都由控制器写、宿主/插件/媒体读，冻结且不序列化。`gesture.action` 是冻结的动作数据副本，`gesture.progress` 为同一时钟产生的 0–1 进度。

新增诊断：`FREE_ACTION_INVALID / FREE_TARGET_MISSING / FREE_EFFECT_INVALID`、`PLUGIN_ACTION_INVALID`、`ACTION_INVALID / ACTION_UNKNOWN / ACTION_DATA_INVALID / ACTION_TARGET_INVALID / ACTION_DESTINATION_MISSING / ACTION_DESTINATION_INVALID`。按对应源码目标、字段或效果修复后重新 check；不要用运行时回调绕过编译校验。


## 15. D89：纯引擎、插件技能与 GitHub 模板

生产依赖图不再让 kit/core/CLI/server/web 导入标准插件。core 只遍历 config.plugins；浏览器宿主按项目给出的 runtime URL 载入，并等待所需运行时完成后提交首个 IR。源码开发直接由 Vite 提供模块；npm 的预构建看板先将运行时及其依赖打包为 ES module，用共享模块代理引用宿主同一份 React，避免直接把 CommonJS 入口发给浏览器。发布站把这些运行时与共享 React 装配进静态 HTML，file:// 不依赖网络。模板默认带上标准库是作者项目的选择，不是引擎的隐式行为。

官方作者入口：UI/HTML 标记从 `@joplo-app/plugin-ui` 导入，diagram 标记和 trace 从 `@joplo-app/plugin-diagram` 导入，Canvas/camera 从 `@joplo-app/plugin-content` 导入，music 从 `@joplo-app/plugin-alda` 导入。`Custom`、Slot/Outlet、Fragment、故事和调度 API 留在 kit。配置、依赖与导入必须同时成立；UNKNOWN_PLUGIN 会用标记上的包来源给出安装/import/config 修法。

引擎技能正文不含插件组件名，守护从插件清单动态取词。原组件说明、示例和常见坑移到对应插件；引擎正文保留全部通用经验和 Required 反馈监听。入口保持短路由，主题可以完整展开，数量不限。`joplo skill <id>/<topic>` 和项目安装后的 Markdown 都读取同一份插件元数据。

### 新增数据的端到端流向

| 字段 / 文件 | 写入点 → 存储 | 读取点 → 消费者 |
| --- | --- | --- |
| PluginDef.packageName | 插件 definePlugin 清单 → Node 内存 | pluginComponent 转入作者标记；技能索引显示准确安装包。不会写入播放 IR |
| ComponentMarker.packageName / JNode.packageName | component / JSX createNode → 作者树 | 编译器缺插件诊断给出包名/import/config 修法；转换 SceneNode 时剥离 |
| PluginDef.skillTopics[key].description/body | 插件 guide.ts → 插件清单 | CLI skill 解析 id/topic；install 写入口链接、主题与总索引；不进入 IR 或 runtime |
| CompileOptions.pluginOptions[id] | 编译调用者 → 本次编译上下文 | 仅对应插件读取自己的编译选项；diagram 在插件内选择 ELK，测试可注入 layout，宿主不懂算法 |
| init --template | CLI 参数 → parseTemplate / loadTemplate 的来源结构 | 本地读取或 GitHub tarball 下载；限制体积、文件数、路径、链接；完整验证后 renderTemplate 与事务写入目标 |
| GITHUB_TOKEN / gh auth token | 用户环境/已登录 CLI → 本次请求内存 | GitHub API Authorization；跟随到 codeload 时不带头；文件、日志、输出中不保存令牌 |
| templates/starter/* | 仓库模板 → release tag tarball / 本地目录 | init 选择 CLI 版本 tag，替换版本/包名/项目名占位符；npm 安装后作者 config 显式加载四个插件 |
| templates/starter/.claude/skills/* | skills:build 显式读取官方插件 → 模板版本化技能 | init 尚未安装依赖时按 D64 安装这些说明；随后 skill install 从真实 config 重新同步 |
| .claude/skills/joplo/topics/*.md | core guide 模板 → skillFiles 带 SHA 的文件 | Agent 直接读相对链接，或 CLI skill 读取同源主题 |
| .claude/skills/joplo-plugin-<id>/** 与 joplo-plugins/SKILL.md | config.plugins → pluginSkillFiles → 带 SHA 的 Markdown | Agent 读取组件技能/子主题；再次 install 对照哈希保护用户修改 |
| .claude/skills/.joplo-plugins.json | install 成功事务 → format:1 + 自有文件路径列表 | 后续 install 计算过期插件文件；仅删除未修改文件，用户编辑导致整批停止；--diff 展示，--force 才替换/删除 |
| ProjectSlot.runtimeModules / runtime URL | 预构建 dev 的本次编译 → 通用 bundlePluginRuntimes(module) → 内存 Map，URL 含内容哈希 | 项目 runtime HTTP 端点返回 JS → 浏览器动态 import/default runtime 注册；无磁盘文件，不进 IR；源码更新重新打包，删除项目释放 Map |
| 插件运行时 Promise / revision | loadPluginRuntimes(urls) → 当前 URL 的 Promise 缓存 | dev-client 首载/HMR 等待后提交最新 revision，避免插件未就绪时出现占位画面 |

### 删除范围与恢复

删除 guide/review 旧命令别名、kit/ui 转发与 kit.trace、core 的 standard-catalog 和 legacy 适配器、web 内置 standard 注册、diagram legacy 适配器、旧裸类型/旧 IR 的专门重编译提示、Step.traces、API v1 接纳、仅证明旧 reader 行为的 fixture 与测试依赖。缺插件报明确错误，不能靠兼容分支悄悄启用；所有仓库示例已改为显式 config 和依赖。

这不是数据库迁移，不改用户凭证、分享可见性、评审权限或已有静态站。格式不明、无 runtime 能力标记等输入仍失败关闭；这些是数据完整性边界，不能当成兼容代码一起删。技能 SHA 保护与旧生成文件自动更新也保留，承担 D64 的编辑保护契约。

模板错误应先修来源或用 `--template <本地路径>` 重试。依赖未安装时可先读模板技能；完成 npm install 后必须运行 skill install 和 check，不能把“模板复制成功”当成插件加载成功。插件技能删改保护触发时先读 --diff；不要用 --force 掩盖用户修改。


## 16. 统一评审 P1 修复（FIX-BR）

- BR-1：publishPayload 保留已经编译和 scope 裁剪的 option.free；普通/评审发布共用此路径。范围外舞台的反应仍先被过滤，不恢复作者源码字段；浏览器自由点击改变本机体验层，重置后还原，时间线不变。
- BR-2：插件打包消费 JS chunk 之外的 OutputAsset。CSS 合并后随 runtime 注入，图片、字体和其他本地静态资源按 MIME 内联成 data URL；不论原资源大小或显式 no-inline，最终 npm dev 与发布站都自包含。未消费的生成资源 URL 明确报 EXPORT_FAILED，不再静默成功。脚本仍通过宿主共享 React；插件承担自身 CSS 选择器范围的约定。
- BR-3：舞台保存脚本滚动目标的初始 DOM 偏移；跳转时恢复基线并应用当前步骤前缀的最后滚动动作。基线跨同舞台场景切换保留，断开的 DOM 元素清理；epoch 重置后重新投影。已应用目标不在 MutationObserver/动画帧中重复重置，游玩期间保留本机滚动，退出/重置按当前时间线恢复。

| 写入点 → 存储 | 读取点 → 消费者 |
| --- | --- |
| option.free 作者声明 → compile 的 options.free → scopeProject 按保留舞台过滤 → publishPayload options.free | 内联 IR → 普通/评审/嵌入播放器的 arbitrateAction → 本机 playground effects；不回写 timeline |
| Vite OutputAsset 与保留的生成资源 base → inlinePluginAssets 内存资源映射 | JS/CSS 中的本地资源引用改写成带 MIME 的 data URL → 浏览器图片、字体与 CSS 资源载入；无需额外资源端点或磁盘清单 |
| CSS OutputAsset → 合并、资源改写后的 CSS 字符串 → runtime JS 的样式安装块 | 发布 factory 或 npm dev module 执行 → style#joplo-plugin-style:<id>.textContent；相同插件更新替换内容，不重复插入样式表 |
| useScrollState 的初始目标 DOM 偏移 → baseline Map（元素生命周期内）、free 进入前 saved Map | scenario/position/epoch 变更与迟挂载目标观察 → 恢复初值、应用前缀最后滚动；不修改 IR 或逐帧覆盖正在演示的中间位置 |

技能同步：demo/publish 交付验证强调在真实发布页测试声明反应；demo 补回退、重置和同舞台场景滚动验证；plugins 补 CSS/静态资源三路径验收。Alda 与 check 如实说明尚未修复的失败重播恢复边界。

## 已知问题（统一评审保留的 P2）

- BR-4 / P2：媒体资源首次请求或 driver 创建失败后，普通暂停/重播仍复用空 slot，修好工具也可能不再请求；影响本页音轨恢复，可先切场景、关开声音或重载；建议失败时清理 slot，并在明确重播/重试或有退避的恢复动作重建，避免 RAF 无限制重试。本轮仅记录，未修改媒体代码。
- BR-5 / P2：视频导出 WebM 仅含视频流，没有 BGM/音频合成链路；交互 build/share 的音轨不受此限制，视频文件不能当作影音一致性交付证据；建议按同一引擎时钟记录锚点并离线渲染/混音/mux，或统一捕获 WebAudio MediaStream 与画面，同时处理解锁、同步及收尾。本轮仅记录，未补音轨。
## 17. P1-E：GLB 与显式付费的持久资源

`scene3d:Model` 用 `src={asset('./model.glb')}` 或 `src={model({prompt: '…'})}` 引用资源。GLTFLoader + 内置 MeshoptDecoder 读取自包含 GLB；模型共享场景锚点、标签、focus、主题描边、状态 tint/lit、点击与拖拽/旋转仲裁。`size` 等比装入包围盒，`at` 为底部中心。纹理模型建议 `outline={false}`。加载以 `ctx.hold()` 保持导出等待，成功首帧、失败、源切换、卸载均释放；失败可见 `MODEL_LOAD_FAILED` 占位。

`@joplo-app/plugin-3d` 是可选第一方插件（需显式安装/启用），浏览器只负责绘制，生成仅在可选 `/local` 入口。作者 `model()` 返回通用 `localResource()` 标记。CLI `joplo resources --dry-run` 显示估计 credits；交互终端逐项确认，非交互默认拒绝、必须明确 `--allow-spend`。check/build/render 从不带这个许可。持久资源先读项目文件，再检查许可和 Key，已有模型不会请求 Tripo。

### 通用插件密钥（D91）

插件 `keys: [{id,title,description,url,env}]` 只声明元数据 → compileProject 读取 config.plugins 并交给 LocalResources（不复制进 IR）→ 看板 `GET /__joplo/p/<project>/plugin-keys` 仅返回声明/存在状态 → Voice 管理密钥按声明展示 → `PUT /__joplo/p/<project>/plugin-keys/<plugin>/<key>` 校验当前声明、令牌和 Origin → PluginKeyStore 原子写入本机 0600 文件，支持删除。插件查找只接受声明对象的自有属性，未启用插件或未声明 key（包括与对象继承属性同名的输入）返回 404 且不落盘；编译失败清除旧声明。所有调用方共用的 JSON 解析器在畸形正文时只返回固定的 400 / USAGE，不回传或记录 SyntaxError 原文、正文片段；凭证客户端用 JSON.stringify 构造请求，不能把正文复制到日志中。

生成时，宿主优先读取声明的环境变量，再读取该插件自己的本机文件；只通过 stdin 将当前插件的值传入 `compile(input, {keys,...})`。不向其他插件传值，不传密钥目录；metadata/estimate 子进程不取密钥。子进程只继承 PATH/临时目录等系统环境，避免环境凭证跨插件泄漏；stderr 不透传，已知密钥从诊断中删去，含密钥的资源输出拒绝缓存/发布。插件依然是可信本机代码，进程隔离不等于文件系统沙箱；插件必须遵守不读取其他凭证、不输出密钥的契约。

持久 GLB 文件名保持 SHA-256(JSON.stringify(normalize(request)))，没有包名、插件 id 或代码哈希；旧产物与 provenance 无需迁移，绝不因此重新花费。

### 新字段与文件的数据流（E5）

| 字段 / 文件 | 写入 → 存储 → 读取 → 消费者 |
| --- | --- |
| `localResource(plugin, compiler, input)` | 插件作者工厂 → 源码求值的标记 → PluginCompiler 提取 → 仅 Node 的 `ResourceRequest`；IR 中只留下 `joplo-resource:<id>` |
| `LocalCompiler.persistent / estimate` | 插件 local 清单 → 本机编译模块 → LocalResources.describe → CLI 每项费用提示、持久产物策略 |
| `projectDir / keys / allowSpend` | 宿主调用 → 子进程 stdin 内存 → 本机 compile 上下文 → 项目产物定位、按插件声明注入的凭证和生成许可；不进 IR |
| `assets/models/<hash>.glb` | Tripo 下载（不带 Authorization）、验证、原子 rename → 项目/Git → 本机编译器离线读取 → 场景 GLTFLoader |
| 同名 `.json` | 创建前记录 `status:creating`，收到响应立即保存 `task_id`，完成后记录时间/实际 credits → 项目/Git → 重试续查；`prompt/model/参数/image_sha256` 用于溯源，临时签名 URL/Key/参考图字节不写入 |
| `.glb.lock` | 生成进程原子创建 → 临时项目锁（忽略 Git）→ 生成进程检查 owner 存活 → 防止并发付费；完成删除，崩溃后按 PID 回收 |
| `project.mediaAssets` | 构建填充资源 ID→data URI；看板替换为哈希 URL → IR 的公共资源表 → RenderContext.assets → 插件已解析 props；同一资源只内嵌一次，scope 删除未引用资源 |
| `.joplo/binary/<content-hash>` | 看板编译提取二进制 → 本机缓存 → 只允许 64 位哈希的 GET 文件服务 → 浏览器模型/音频；发布站直接内嵌，不依赖绝对路径或本机服务 |
| `~/.joplo/plugins/<plugin>/keys/<key>.json` | Voice 管理密钥卡片密码输入 → 带 Origin/令牌保护的 PUT → 0600 原子文件 → Node-only local 编译器；GET 仅返回保存/环境变量存在状态；声明中的环境变量优先，JOPLO_HOME 可覆盖目录 |
| `MODEL_SIZE` | 构建扫描唯一 GLB 的二进制大小 → diagnostics → CLI/看板报告；超过 5 MB 警告，二进制最大 50 MB，图片仍为 2 MB |

任务 API 固定 `https://openapi.tripo3d.ai/v3`；参考图通过 `/files` 上传。只对明确 429 退避重试创建；丢失响应或服务器结果不明时保留 unknown 日志并停止，要求从 Tripo 历史恢复 task_id。轮询/下载失败保留 task_id；超时不是退款。失败/取消由 Tripo 退回冻结 credits，不自动重新创建。Key/供应商原始错误/临时 URL 不进入日志或发布物。

参数白名单固定 H 系列 `v3.1-20260211` 和已核实计费选项；扩展版本前核实费用。真实预算与生成批准由调用者控制，`--allow-spend` 不代表自动购买额度。已知限制：不支持 Draco/KTX2、外部纹理/缓冲文件；不提供网页生成按钮，生成通过 CLI 明确确认。官方契约：[生成](https://developers.tripo3d.ai/zh/docs/generation-text-to-model/standard)、[上传](https://developers.tripo3d.ai/zh/docs/files)、[计费/退款](https://developers.tripo3d.ai/zh/docs/billing)。

### 交互示例补齐的运行时边界

- canvas / WebGL 插件在真实指针移动时用 `ctx.hover?.(targetId)` 报告射线命中的元素，离开、开始拖动时传 `null`。宿主查当前脚本/自由反应的声明时长，统一处理停留、离开取消、重置与继续；播放中的 hover 不暂停也不执行。插件不自建时间线或猜测作者的停留阈值。此可选服务不序列化进 IR。
- `ctx.act(id, { type:'drag', to:{x,y} })` 的点必须是舞台坐标；宿主会按该源元素已声明的目标锚点，把落在 DOM drop zone 中的点转换为目标 id。3D 与普通页面目标共用仲裁；不可见/零尺寸锚点不能接住拖拽。
- `flow({ autoplay:false })` → `scenario.autoplay`（可选布尔）随编译、发布和范围投影保留 → 发布站顺序选择器跳过它。默认/true 保持旧行为。支线仍在章节列表、深链和 fork 中可访问；手动播放支线结束后停下。返回主线的 fork 不会隐式改变主线的播放资格。
