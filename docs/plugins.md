# Joplo 插件架构：纯粹的引擎 + 可插拔的内容形态（D87）

> 状态：设计稿 + 第一版实现（v1：叶子组件插件、看板载入、发布站内联、插件技能；示例 `plugins/scene3d` + `examples/smart-home-3d`）。
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
