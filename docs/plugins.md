# Joplo 插件架构：纯粹的引擎 + 可插拔的内容形态（D87）

> 状态：阶段 0、阶段 1-A、阶段 1-B 与阶段 1-C 已实现：v1 叶子组件兼容；v2 编译钩子、效果快照、元素特性与 React/容器运行时；第一方 `plugins/diagram` 默认启用。阶段 1-A 的接口与数据流见第 10 节，媒体轨道与本机资源见第 11 节，通用属性、插件主题与讲解内容见第 12 节。
> 目标形态：Joplo 只是**构建与调度引擎**，负责把不同形态的内容串成一个可播放、可评审、可发布的作品；
> UI 组件、Diagram、Canvas、3D、Alda BGM、朗读供应商、主题……都是插件。

## 1. 驱动力

| 驱动力 | 具体场景 | 对结构的要求 |
|---|---|---|
| 内容形态会持续增加，而且由别人维护 | 3D、音乐、地图、讲解画布、公司自己的设计系统 | 引擎不认识任何具体形态；新形态不改 core |
| Agent 是主要作者，省 token（D25） | Agent 装一个包、读一份技能就能写 | 每个插件自带技能；`npx joplo skill` 汇总 |
| 演示必须可复现（截图、视频、深链、评审定位） | 同一份 IR、同一步，永远是同一个画面 | 业务状态只由步骤推进；插件不能改状态 |
| 发布站离线可播放（file://、静态托管） | 观众没有作者的电脑、工具和网络 | 发布物自包含：IR + 编译后的运行时 + 生成好的资源 |
| 私有项目 | 公司组件、私有仓库 | 源码与本机能力不进发布物；私有插件不能误发公开分享 |
| 已有项目不能坏 | 现有示例、已发布的分享 | 内置词汇名字不变，旧 IR 照常播放 |

## 2. 引擎是什么（内核，不拆）

内核只保留**所有形态共有的东西**。判断标准：换掉任何一种内容形态，它都还在。

1. **故事模型**：项目 → 功能 → 方案 → 情况 → 场景 → 步骤；规则、覆盖、待决问题、评审与反馈。这是 Joplo 的产品视角，也是它和视频工具的区别。
2. **时间线与状态机**：`ui / data / inputs` 状态；步骤的动作（click / type / select / toggle / press / back / event / card）与基础效果（set / append / go / done / fork / stream / toast）；`stateAt` 回放、`flow({ from })` 接力。纯函数、确定。
3. **导演与节奏**：层级、镜头目标（shot）、焦点提示（spotlight / highlight / number / callout / mark）、字幕 / explain / narrate / say、停留与阅读时长、过渡卡、自动播放时钟。
4. **寻址与检查**：元素 id、源位置（文件:行）、选中、DOM 锚点（`data-jid`）、评审定位到“第几步的哪个元素”。
5. **输出管线**：看板、截图 / 分镜 / 视频、build / share、多语言、范围分享与脱敏、资源打包。
6. **插件宿主**：载入、契约与版本、能力注册、信任与私有、技能汇总。

内核里**不应该出现任何组件名**（`Button`、`Diagram`、`Canvas`……）。这条可以写成测试守住（第 6 节阶段 2）。

## 3. 插件能贡献什么（扩展点）

把现有内置能力逐个拆开看，它们都落在下面几类扩展点上。插件可以只用其中一部分。

| 扩展点 | 运行在 | 作用 | 现有的例子（迁移后由插件提供） | v1 |
|---|---|---|---|---|
| A 词汇 | Node（创作） | JSX 标记、效果工厂（`trace()`、`camera()`、`bgm.play()`）、属性说明 | `@joplo-app/kit/ui` 的组件、`trace`、`camera` | ✓ 组件标记 |
| B 技能 | Node | 给 Agent 读的用法、常见坑 | `skill components / diagram / content` | ✓ |
| C 元素特性（数据） | IR | 可操作、接收输入值、门控可见（`opened`）、不言自明、只能在某父组件里 | `INTERACTIVE_TYPES`、`VALUE_TYPES`、`GATED_CONTAINERS` | 部分（可操作、父组件） |
| D 编译钩子 | Node，编译期 | 校验与规范化节点、派生数据（布局）、生成 id、诊断 | ELK 布局、连线 id `a->b`、Menu 抄 `opened`、Image 检查 | ✗ |
| E 效果降级 | Node，编译期 | 插件效果 → 内核原语（状态写入、镜头目标、每步派生数据、媒体事件）+ 校验 | `trace()` → `step.traces` → 每步状态；`camera()` → `ui.__camera` + 导演换层 | ✗ |
| F 渲染 | 浏览器 | 叶子组件（自己画）与容器组件（子元素交给引擎渲染）；镜头目标在容器里怎样取景 | 所有组件；Canvas 的取景；3D 的 focus | 叶子 ✓，容器 ✗ |
| G 通用属性 | IR + 浏览器 | 插件声明能写在任意元素上的属性，并观察步骤之间的 DOM 变化 | `motion` / `motionDelay`（FLIP 飞行） | ✗ |
| H 媒体轨道 | 浏览器，按引擎时钟 | 播放、停止、淡入淡出，受暂停 / 跳转 / 旁白压低控制 | Alda BGM、音效 | ✗ |
| I 本机能力 | Node，只在作者机器 | 文本 → 资源（音频、模型、图片），按内容哈希缓存；build 时打包产物 | Alda → MIDI / 音频；朗读供应商（D74） | ✗ |
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

1. **状态只由步骤推进**：插件不能改业务状态；观众在插件里的点击调用 `ctx.click(id)`，由引擎的 `explainClick` 判断。观众自己的视角操作（拖动旋转）不是状态。
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
| 3 | 分发与生态：标准库作为 `joplo` 的默认依赖发布；插件模板（`npx joplo plugin init`）；私有标记与分享检查；第三方插件文档 | 一个仓库外的插件包 | 社区可以独立发布插件 |

阶段 1 用三个真实案例一起逼出接口，不先设计一个“通用插件框架”再找用例；阶段 2 只是搬家，行为不变。

## 7. 已定的选择（2026-11-08）

1. **信任模型**：第三方运行时与 Joplo 同页面运行，像 npm 依赖一样信任；必须在 `config({ plugins })` 里显式启用，分享时列出用了哪些插件。出现插件市场、陌生作者时再评估沙箱 iframe。
2. **命名**：标准库也一律带命名空间（`ui:Button`、`diagram:Diagram`、HTML 兜底标签归入一个第一方插件）。作者在 TSX 里照常写 `<Button>`，类型名由标记决定，命名空间只出现在 IR、check 信息与检查抽屉里。已发布的分享自带当时的运行时，不受影响；迁移时编译器对旧裸名给出改写提示。
3. **标准库默认启用**：`joplo init` 的体验不变；进阶用户可以在 config 里关掉不需要的。
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
- 示例：`plugins/scene3d`（three.js）、`examples/smart-home-3d`。

## 10. 阶段 1-A：契约 v2 与第一方 diagram 插件（已实现）

`plugins/diagram` 是可独立发布的 `@joplo-app/plugin-diagram`，与内核统一为 0.2.17，默认启用。
`@joplo-app/kit/ui` 的作者标记仍可导入，IR 类型改成 `diagram:Diagram`、`diagram:StateMachine`、`diagram:Sequence` 及其子组件；`@joplo-app/kit` 的 `trace` 保留兼容标记工厂，与插件效果工厂产生相同信封；语义仍归插件，kit 不反向依赖插件。
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
旧裸类型或旧 step.traces 在 check 时得到 `PLUGIN_LEGACY_TYPE` 重编译提示；历史 traces 仅保留为输入兼容，以便 feature-diff 比较旧发布物。新编译产物不生成顶层 traces 或 layout。

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
第一方运行时随宿主预构建，仍经相同注册表和 PluginHost；第三方运行时在发布时生成共享模块代理，并延迟到宿主的 React / ReactDOM / JSX runtime 就绪后求值。看板用 Vite dedupe 保证同一 React。v1 的 mount 运行时继续兼容。

浏览器插件负责绘制/动画和 `ctx.click`，不推进业务状态。`stateAt`、`explainClick`、`focusAt` 和导演不调用插件代码。截图/视频的 `frame.animate=false`、资产等待 `ctx.hold()` 与逐段出现机制保留。

### 维护与验证

- 已知 P2-11（本轮暂不修）：源码守护仍整体豁免 plugins 目录，浏览器检查只覆盖两个入口文件的直接依赖；尚不能防止专用语义经宿主目录或传递依赖回流。
- Node 边界、降级、快照与旧 IR：core plugin-v2、trace、diagram-compile、integration-028 测试。
- React 共享打包：server plugin-v2；容器与画面：web plugin-v2、diagram-v2、integration-028。
- diagram 技能的权威正文现在是 `plugins/diagram/src/guide.ts`，core guide 只路由及组合通用主题；仍运行 `pnpm skills:build`，并实际检查 `joplo skill diagram` / `plugins`。
- 验证普通发布前先确认 feature.pick：无 pick 的方案按既有规则不发布。若只检查全部备选，可用看板或 `buildSite({ review: true })` API；CLI 普通 build 仍只发布已选方案。不要把空站点当成图表播放成功。

diagram 的独立包交付已完成；阶段 1 的其他扩展点、其他第一方插件迁移和生态工具仍未完成，v2 在阶段 3 前保持实验性。


### P1-A review 修正：发布、投影与历史输入

- diagram 提供 build、dist、声明与 publishConfig，纳入 release 的七包集合：kit → plugin-diagram → core → web → server → cli → joplo。core 使用正式包入口读取 catalog/guide；插件没有指向 core/web 源码的跨包相对导入。所有 Node 包沿用标准 tsconfig.build 与 build-package.mjs。
- 第一方浏览器代码通过 @joplo-app/kit/renderer 使用宿主注册的共享渲染服务，通过 @joplo-app/kit/renderer-style 使用纯样式常量。服务在调用时解析，避免模块初始化循环；业务状态仍由内核推进，插件只读快照。
- 第三方 React 桥接使用 web 包交付的 shared-modules.json 导出表，生产安装不需要从 web 的 devDependencies require React。导出表与当前宿主版本由测试对齐。共享模块代理优先于 Vite 的普通包解析，项目或插件实际安装 React 时也不会打入第二份实例；测试同时覆盖有/无 React、源码/预构建 web。
- 插件通过 data.node.text / data.step.text 声明文本路径（分段数组，* 代表对象值/数组项），普通 id、枚举、引用不会被盲翻。
- 插件通过 data.node.scope / data.step.scope 声明纯数据投影规则。map/items/values/reference 分别投影映射、实体数组、id 列表和单一引用；scene map 的键、scene items 的 references（默认 [["id"]]）提供所属舞台；items 的引用必须解析出唯一舞台，prefix 去除后再寻址，子规则只使用该舞台的元素集合。缺失/多义身份或没有所属舞台的元素投影都失败关闭，不用全舞台 id 并集兜底。只对确实独立于范围的数据使用 global。未声明规则的槽位在范围分享时失败关闭，报 PLUGIN_SCOPE_UNSUPPORTED。
- 图表缓存、状态机快照按合格舞台 id 寻址，元素 id 仍只要求在同一舞台唯一。裁剪节点后会同步裁剪结构/布局副本、场景和步骤快照；保留可见元素原有坐标，不调用插件代码重新布局。
- feature-diff 比较 scenario.ext 和 step.ext。对 b817425 的真实旧公开 IR，先严格适配裸名及 layout，再走公开数据检查；不丢弃 note/source 等私有字段来伪装兼容。适配用于历史对比，不是浏览器补算旧 trace 的回退。
- 验收必须覆盖公开包的 tsconfig.build、七包构建、tarball 和不含工作区开发依赖的安装；不能仅凭 pnpm typecheck / pnpm test 宣布发布正确。

## 11. 阶段 1-B：媒体轨道与本机资源（已实现）

第一方 `@joplo-app/plugin-alda` 与其他七包同版本，**不是标准默认插件**。作者安装后在 `config.plugins` 写 `alda(scores)`；`scores` 是项目 `music.ts` 中的命名文本字符串，步骤通过 `music.play(name, { fadeMs, loop, volume })` / `music.stop({ fadeMs })` 使用。技能正文归插件 `src/guide.ts`，在启用它的项目中读取 `joplo skill alda`。`examples/smart-home-3d` 的三个场景各自第一步播放，`done` 所在步骤淡出。

### Node 本机能力

- `PluginDef.local` 指向 Node 入口；默认导出 `PluginLocal`：`compilers[name] = { version, mime, compile(input, { directory, maxBytes }) }`。返回 `Uint8Array`，临时文件只能写入宿主提供的工作目录。
- effect 钩子通过 `ctx.resource({ compiler, input })` 登记请求并取得不透明资源 id，再由原有 effect 宿主物化、校验返回的 `media` 命令。请求表与 local 路径只在 `CompileOutcome.resources`，不进入 IR，也不使用公开 ext 槽位传递源码。
- `LocalResources` 将本机入口及依赖打成 Node 模块，放在项目 `.joplo/resources/`；独立子进程执行编译，硬超时 30 秒，输出上限 8 MiB。Alda 供应商另在 25 秒停止自身命令，失败提供可读信息。macOS/Linux 超时结束整个进程组；临时目录始终清理。
- 缓存键为 SHA-256(plugin id、compiler id、含 version 声明的编译器代码、精确输入文本)。代码变化也失效，不对文本空白做归一化。成功产物原子写入缓存；内存请求合并与磁盘租约分别覆盖同进程和跨进程并发，已有产物不再编译。失败不持久缓存，修复工具或源码后可重试。
- 看板首次播放需要资源时，向带 token 的 `POST /__joplo/p/:id/resources/:resource` 请求；只可请求当前已编译项目登记的资源，不能向接口提交任意文本或本机入口。`build/share` 先裁剪范围，再生成该范围实际引用的资源。
- 缺工具、语法错误、超时、产物过大分别通过 `LOCAL_RESOURCE_FAILED` / `LOCAL_RESOURCE_TIMEOUT` / `LOCAL_RESOURCE_TOO_LARGE` warning 降级；`at` 锚定作者 play 步骤的源文件:行:列，供应商信息可附配乐文本中的行号。看板通过独立的 joplo:diagnostics 事件更新 warning 横幅，不替换 IR、不重置时钟；成功重试清除对应 warning，旧编译版本的异步结果不覆盖新版本。构建把 warning 放进结果，项目其余内容继续播放。

### 通用媒体契约与时钟

effect 返回可选的 `media` 有序命令列表：

```ts
{ track: 'bgm', action: 'play', resource, volume: .2, loop: true, fadeMs: 800 }
{ track: 'bgm', action: 'stop', fadeMs: 1000 }
```

`track` 是插件内的小写 id；宿主补命名空间，不允许插件引用别家登记的资源。音量范围 0–1，淡入淡出范围 0–30000ms。宿主在现有 `PluginCompiler.frames` 回放中累计完整媒体状态，不把命令、作者效果或本机代码交给播放器。

每个场景初始静音。第一步媒体位置从 0 开始；后续步骤锚点按上一步的 `hold` 推进，没有显式 hold 时为 3000ms。每步的 `offsetMs` 固定在 IR 中，多语言不会重算；步内按 DemoController 的引擎时钟与速度推进，暂停冻结，跳入/回放按该步锚点对齐。朗读或交互可能让某步停留更久，因此切步会重新对齐，而不是把不确定的等待时间累加进后续位置。需要精确乐句节奏时显式写 `hold`。同步音频调度以 80ms 为重对齐阈值。

浏览器插件可提供 `runtime.media({ audio, destination, bytes })`，返回 `update({ offsetMs, playing, speed, loop, volume })` / `destroy()`；只负责解析产物和发声，不执行编译期语义。宿主掌管用户手势门槛、现有声音开关、暂停/继续、场景卸载、淡入淡出与旁白期间 25% ducking。异步加载后若场景已离开立即销毁驱动。媒体 hook 仅挂在交互播放器，静态视图、缩略图、截图不挂载声音。

Alda 的 MIDI 解析、节奏/音高、近似 GM 乐器音色与 WebAudio 振荡器调度全部归插件。钢琴使用敲击包络、自然衰减和逐渐变暗的泛音；风琴持续、弦乐/铜管慢起音。跳入半个音符时按谱面时间取包络和亮度，不重新敲击。支持 SMF 0/1、PPQN、tempo、running status、program、sustain 与末尾休止符；无音色库下载。单音保留可听增益，和弦在插件混音总线压缩留余量；示例以谱面 vol 70、轨道 volume .45 起步，最终输出同时验证旁白期间与间隙，避免谱面/合成器/轨道/ducking 多层衰减到听不见。内核和浏览器媒体宿主没有供应商分支；第二个 fake WAV 插件覆盖相同路径。

### 新字段的端到端流向

| 字段 / 槽位 | 写入点 → 存储 | 读取点 → 消费者 |
|---|---|---|
| `PluginDef.local` | 插件 author 入口声明 → 仅 Node 的 `CompileOutcome.resources.host` | `LocalResources` → Node 编译子进程；不进入 IR/发布站 |
| `ctx.resource` 请求的 `id/plugin/compiler/input/source` | effect 回调 → 宿主物化请求 → `CompileOptions.onResource` → Node 请求表 | 看板资源端点 / `inlineResources` → 缓存和供应商；源码、source 与本机入口不发布 |
| effect 输出 `media` 命令 | 原有 effect 宿主物化/校验 → `PluginCompiler.mediaCommands` 临时表 | 原有 frames 回放 → 完整快照；命令本身不存 IR |
| `scenario.media` | frames 写第 0 步空快照 → IR（无媒体的旧项目省略） | `mediaAt` / `useMedia` → 初始静音 |
| `step.media[plugin:track]` | frames 累计与降级 → IR | `mediaAt`、`useMedia` / `MediaEngine` → 浏览器插件驱动 |
| 快照 `plugin/resource` | effect 所属插件与登记资源 → 命名空间快照 | 运行时注册表选媒体驱动、`mediaAssets` 选字节；范围裁剪据 resource 选产物 |
| 快照 `offsetMs/volume/loop/fadeInMs/stopAfterMs` | play/stop 与前一步 hold → frames | 引擎步内时钟推进 offset；宿主增益包络和 ducking（跨步淡出同步缩放 volume 与剩余 stopAfterMs）；插件循环、定位与倍速合成 |
| `project.mediaAssets[id]` | 看板写本机资源端点 URL；build 在 scope 后写 `data:<mime>;base64,...` → IR | 媒体宿主取 bytes；发布站直接解码内联数据，不 fetch，不需要网络或作者机器 |
| `runtime.media` | 插件 browser 入口 → 现有运行时注册表 / 发布内联脚本 | 媒体宿主 factory/update/destroy；与组件注册复用同一个插件运行时机制 |

`scopeProject` 同步裁剪 mediaAssets；翻译仅处理既有文本声明，媒体字段不参与翻译。公开数据只有播放快照、MIDI/其他编译产物与运行时代码，**不公开配乐源文本**。项目中的文本仍由 Git 管理，`.joplo` 缓存与二进制不提交。

### 验证与已知边界

- core `media.test.ts`：fake 插件效果降级、纯快照跳入、范围裁剪、翻译不变性与供应商边界守护。
- server `local-resources.test.ts` / `media-build.test.ts`：缓存/版本/精确输入、同进程及跨进程并发、四类失败、本机按需 API 与诊断、真实 fake WAV 的范围构建、内联与源码隔离。
- web `media.test.ts` / `midi.test.ts` / `voice.test.ts`：手势门槛、生命周期、旁白压低、停播淡出、MIDI 节奏音高/休止、引擎时钟、暂停/倍速及 <100ms 步边界验证。
- 发布集合：kit → plugin-diagram → plugin-alda → core → web → server → cli → joplo；八包 smoke 另外直接载入可选插件 author/local/runtime 出口。Alda 不成为默认依赖或默认配置。
- 已知边界：视频导出暂不混入媒体轨道；SMF format 2 / SMPTE 不支持，GM 乐器只是近似振荡器音色。Alda 本机编译在发布后不可补做；漏配工具时修复后重新 build/share。

## 12. 阶段 1-C：讲解内容、通用属性与插件主题（已实现）

`@joplo-app/plugin-content` 是默认启用的第一方插件，版本与其他八包一致。直接导入时在项目依赖声明该包；不重复加入 `config.plugins`。作者从它导入 `Canvas / camera`，从 kit 导入通用 `flow / patch / narrate / hold`。IR 类型为 `content:Canvas`，主题为 `content:studio`；技能正文在 `plugins/content/src/guide.ts`，`joplo skill content` 通过标准技能路由读取。PR #35 **未合并**：仅读取 8284901、0fcb8f5 及远端分支最终内容，示例仅调整导入和主题配置。

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

引擎迁入 `flow({ from, layer })`、`patch()`、步骤效果数组、旁白时长估算与分镜。接力先按依赖决定逐步校验使用的路径 / 导演层，再回放前章结尾叠加本章 state，最后生成插件快照；IR 保持声明顺序。from 不存入公开 IR；只有最终初始状态和可选 `initial.layer`。错误为 `FROM_UNKNOWN / FROM_CYCLE / FROM_FAILED / FROM_WITH_START / LAYER_UNKNOWN`。分镜含初始画面与每一步，标注字幕和旁白，告警带步号前缀；`--columns` 控制 1–6 列。

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
| `FlowOpts.from/layer` → `Scenario.initial.layer` | 作者接力声明 → 依赖编译 / 结尾回放 → 初始 state 与 layer | initialState / cameraAt / 插件初始快照；from 与作者声明不进入 IR |
| `SheetOptions.{columns,cellWidth}` / `SheetResult.{path,steps,warnings}` | CLI --sheet/--columns 或 server API → renderSheet | 原 render 路由逐步截图 → 网格 PNG；无新增项目 IR 字段 |

### 证据与边界

- PR #35 的三个测试文件迁入 `plugins/content/test`；通用扩展、生命周期、深链一致性与静态取消动画另有 Node / SSR / 真实 Chromium 覆盖。content 守护递归检查 core、renderer、player，包括插件宿主目录；不改变 P2-11 记录的其他族历史边界。
- llm-explainer 与 0fcb8f5 的 check diagnostics 完全相同（0 error、0 warning、1 HAPPY_PATH_ONLY info）。14 个关键 render 截图覆盖五章、封面、接力起点、对象飞行、推拉与收尾；PNG 字节相同，像素差比例及平均绝对差均为 0。原图、哈希和日志在本地 `output/playwright/p1-c/`，验收汇总在 `.done-P1-C`，不发布会话产物。
- 本阶段保持原示例视觉和内容，未重新设计素材或叙事。技能沉淀：同物体贯穿章节、镜头与 FLIP 同步、screen 覆盖层、无高度容器恢复、静态动画取消、接力在快照前解析、分镜与实际播放分别验证、示意数字与事实来源分开。
- 通用属性当前只接收字面量；插件观察器是可信的 npm 绘制代码，与页面同域，不是沙箱。音乐视频混音、逐词旁白同步、素材剪辑与地图组件仍不在本阶段范围内。
