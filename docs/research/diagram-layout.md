# 关系类图表的布局与稳定：调研与取舍（D67）

2026-11-06，来源：用户反馈“图表看不懂含义（没有分组）”“A → B 变成 A → C 时节点散开、从屏幕外飞进来”。本文调研成熟工具怎么画架构 / 关系图、怎么在多个状态之间保持读者的心理地图，最后落到 Joplo 的取舍。所有链接在 2026-11-06 核对过。

## 1. 问题拆解

| 现象 | 根因（0.2.7） |
| --- | --- |
| 截图 2：一字排开的节点，看不出哪些属于网关、运行时、存储 | Diagram.Group 只有 label，没有图标、色调；技能里没有要求按业务域分组；作者用一个大分组把所有节点包起来，等于没有分组。 |
| A → B 变成 A → C 时节点散开，再从别处移到中间 | D47 的“聚焦布局”：镜头对准同一张图里 2 个以上节点时，这些节点被重新排成一张小图放到中央；下一步换了一组节点，A 从小图位置移走，C 从原位飞进来。 |
| 截图 1：放大一张卡片，旁边的上下文被裁掉 | 镜头只按目标本身取景，推近上限 2 倍；没有“父容器”的概念。 |
| 布局质量一般 | 浏览器里用 dagre（Graphviz dot 思路）+ 自写正交走线；dagre 不支持连到分组的连线，分组内外一起布局较弱。 |

## 2. 成熟做法

### D2（Terrastruct）
- 容器（container）用嵌套或点路径声明，连线可以连到容器本身、也可以连到容器里的子节点（[containers](https://d2lang.com/tour/containers)）。
- 三种布局引擎（[layouts](https://d2lang.com/tour/layouts)）：dagre 是默认（基于 Graphviz DOT 的思路）；ELK “比 dagre 成熟、维护更好”，原生支持容器到容器的走线（[elk](https://d2lang.com/tour/elk)）；TALA 专为软件架构图设计，对容器一等支持、偏好对称，但闭源收费，且“有随机性：改一个标签就可能整张图布局大变”（[tala](https://d2lang.com/tour/tala)、[TALA 仓库](https://github.com/terrastruct/TALA)）。
- `near` 把对象放到 8 个常量位置（四角、四边中点）（[positions](https://d2lang.com/tour/positions)）；`grid-rows` / `grid-columns` 让容器按网格排（[grid](https://d2lang.com/tour/grid-diagrams)）；`--sketch` 手绘风格（[sketch](https://d2lang.com/tour/sketch)）。
- 启示：架构图的核心是“容器 = 归属”，连线能连到容器；布局算法选 ELK 这类确定、对容器友好的分层算法；TALA 的随机性正是我们要避免的。

### Mermaid
- flowchart 的 subgraph 支持连线进出 subgraph；但 subgraph 里的节点一旦连到外面，subgraph 自己的 `direction` 就被忽略（[flowchart](https://mermaid.js.org/syntax/flowchart.html)）。
- v12 起 ELK 是内置的默认布局，回到旧布局写 `layout: dagre`；`defaultRenderer` 已移除（[layouts](https://mermaid.js.org/config/layouts.html)）。`@mermaid-js/layout-elk` 现在只给不带 ELK 的 tiny 版用，依赖 elkjs ^0.12（[包说明](https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid-layout-elk)）。
- sequenceDiagram：`autonumber`、`box` 给参与者分组、`loop / alt / opt / par / critical / break` 片段、激活条（[sequenceDiagram](https://mermaid.js.org/syntax/sequenceDiagram.html)）。stateDiagram-v2：`[*]` 表示开始 / 结束，复合状态可嵌套（[stateDiagram](https://mermaid.js.org/syntax/stateDiagram.html)）。
- 启示：主流工具已经从 dagre 走向 ELK；时序图与状态机的词汇（编号、参与者分组、片段、起点 / 终态、复合状态）是公认的，照着做读者不用学。

### Eclipse ELK（elkjs）
- ELK Layered 是 Sugiyama 框架的实现，分五个阶段：消环、分层、减少交叉、节点定位、走线（[layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)、[2025 年的说明](https://eclipse.dev/elk/blog/posts/2025/25-08-21-layered.html)）；正交走线时遵守端口约束。
- `hierarchyHandling = INCLUDE_CHILDREN`：节点和全部后代一次布局，支持跨层级的连线（[hierarchyHandling](https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html)）。
- `considerModelOrder.strategy`：在不增加交叉的前提下保留输入顺序（[considerModelOrder](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-strategy.html)）；`cycleBreaking.strategy = MODEL_ORDER` 用输入顺序决定回边（[cycleBreaking](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html)）；`layering.layerConstraint = FIRST / LAST`（[layerConstraint](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-layering-layerConstraint.html)，配方见 [Constraining the model](https://eclipse.dev/elk/blog/posts/2023/23-01-09-constraining-the-model.html)）。
- 标签：`edgeLabels.inline` 让标签直接压在线上（[inline](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeLabels-inline.html)）；`edgeLabels.placement = CENTER` 时标签作为占位节点参与分层，不会互相重叠（[placement](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeLabels-placement.html)）。
- 交互 / 增量：`crossingMinimization.semiInteractive` 按已有坐标保留层内顺序（[semiInteractive](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html)）；各阶段都有 INTERACTIVE 策略。
- 坐标系：连线坐标默认相对两端点的最近公共祖先；`json.edgeCoords` / `json.shapeCoords = ROOT` 统一成根坐标（[coordinate system](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html)）。`randomSeed` 固定时结果确定（[randomSeed](https://eclipse.dev/elk/reference/options/org-eclipse-elk-randomSeed.html)）。
- elkjs：ELK 的 Java 代码经 GWT 转成 JS，Node 与浏览器都能跑，许可证 EPL-2.0（[elkjs](https://github.com/kieler/elkjs)）；0.12.1 的 `elk.bundled.js` 约 1.6 MB，npm 解包约 8.2 MB（[tarball](https://registry.npmjs.org/elkjs/-/elkjs-0.12.1.tgz)）。

### Graphviz dot
- 名字以 `cluster` 开头的 subgraph 画成包围框（[lang](https://graphviz.org/doc/info/lang.html)）；`compound=true` 配合 `lhead / ltail` 把连线裁到分组边上（[compound](https://graphviz.org/docs/attrs/compound/)、[lhead](https://graphviz.org/docs/attrs/lhead/)）；`constraint=false` 的连线不参与分层（[constraint](https://graphviz.org/docs/attrs/constraint/)）；`rank=same` 同层（[rank](https://graphviz.org/docs/attrs/rank/)）。
- 分层用网络单纯形求最优层次分配（Gansner 等 1993，[TSE93](https://graphviz.org/documentation/TSE93.pdf)、[DOI](https://doi.org/10.1109/32.221135)）。分层画法的源头是 Sugiyama、Tagawa、Toda 1981（[DOI](https://doi.org/10.1109/TSMC.1981.4308636)）。
- 启示：`constraint=false` 就是我们处理“回程连线”的思路：回答、工具调用回到上游时不应该决定分层。

### dagre
- 仍在维护（@dagrejs/dagre 3.1.3；2026-08 合并了按 cluster 设方向的 PR，[#511](https://github.com/dagrejs/dagre/pull/511)），但“从子节点连到父分组”至今不支持（[#238](https://github.com/dagrejs/dagre/issues/238)）。Joplo 0.2.7 用它在浏览器里布局。

## 3. 多个状态之间保持心理地图

- Misue、Eades、Lai、Sugiyama 1995 提出“心理地图”：图变化时，读者已经记住的相对位置不应被打乱（[DOI](https://doi.org/10.1006/jvlc.1995.1010)）。
- Diehl、Görg、Kerren 2001 的 Foresighted Layout：对整个序列里所有图的并集（supergraph）算**一次**全局布局，每一帧只取其中出现的部分，节点因此永远不动（[VisSym 2001](https://doi.org/10.1007/978-3-7091-6215-6_19)；supergraph 的表述见 [GD 2002](https://www.st.uni-trier.de/diehl/pubs/GD02_LNCS.pdf)）。
- 实证研究结论并不一边倒：Purchase、Hoggan、Görg 2006 发现心理地图只对部分任务有帮助（[GD 2006](https://doi.org/10.1007/978-3-540-70904-6_19)）；Archambault 与 Purchase 2012 在“定向 / 找路”任务上更快、错误更少（[GD 2012](https://doi.org/10.1007/978-3-642-36763-2_42)），但在记忆任务上没有显著差异（[PacificVis 2012](https://doi.org/10.1109/pacificvis.2012.6183578)），综述认为证据仍不充分（[IJHCS 2013](https://doi.org/10.1016/j.ijhcs.2013.08.004)）。
- 对演示的含义：演示正是“定向 / 找路”任务——观众每一步要知道“现在讲到哪了”。所以要保持心理地图；而演示的所有状态在编译期就已知（步骤是数据），Foresighted Layout 的前提完全满足，不需要增量布局。

## 4. Joplo 的取舍

### 布局：ELK layered + 层级处理，编译期算好写进 IR
- **为什么是 ELK**：分层、减少交叉、正交走线、分组内外一起布局、连线能连到分组，都是现成的；结果确定；Mermaid、D2 都在用。dagre 不支持连到分组；TALA 闭源且有随机性；自己写一套 Sugiyama + 复合图的工作量和风险都不值得。
- **为什么在编译期**：演示的全部状态在编译时已知；发布站有 CSP `connect-src 'none'`，不能请求布局服务；web 包有 6 MB 上限。编译期布局让发布站只读坐标：
  - 网页端删掉了 dagre 与自写走线（`diagram-route.ts`），发布站产物里没有任何布局算法；
  - elkjs 只作为 `@joplo-app/core` 的依赖装在作者机器上（npm 解包约 8.2 MB，不进 web 包、不进发布站），由 Node 入口 `@joplo-app/core/node` 同步调用（直接调 GWT Dispatcher，不走 setTimeout 版的 FakeWorker），`compile()` 保持同步；
  - 性能：首次加载约 40 ms，agent-arch 这样 10 节点 6 分组的图约 20–150 ms；按结构缓存，dev 每次保存只重算变化的图。
- **回边自己判断**：交给 ELK 之前，按源码顺序做 DFS 找出回边并反向（相当于 Graphviz 的 `constraint=false`），布局后再把折线方向反回来；“指回上游所在分组”的连线也按回边处理，避免把一个分组拉成长条。实测比 ELK 自带的 GREEDY / DEPTH_FIRST / MODEL_ORDER 消环更整齐（agent-arch 宽度从 722–936 降到 560 左右）。
- **标签进布局**：标签带尺寸交给 ELK（CENTER + inline），占位参与分层，互不重叠也不压节点。
- **作者提示**：同层顺序 = 源码顺序（considerModelOrder）；`pin="start" | "end"` 放到所在分组的第一 / 最后一层（layerConstraint，INCLUDE_CHILDREN 下相对所在分组生效）。ELK layered 没有通用的“同层”约束（`layerChoiceConstraint` 只在交互式布局里生效，实测普通流程不起作用；partitioning 在层级模式下也不起作用），所以不提供 `rank=same`；需要同层时用相同的上游或放进同一个分组。
- **没有 ELK 时**（直接调 `compile()` 的测试或旧调用方）：退化为确定的网格排列，IR 里 `engine: 'grid'`；正式流程（dev、build、check、render、share）都用 ELK。

### 稳定：Foresighted Layout
- 一张图的布局只由结构（静态属性）决定：when、state、trace、镜头都不参与；隐藏的元素也在布局里。同一个场景所有步骤的坐标完全相同。
- 去掉 D47 的聚焦布局（节点重新排成小图）。多节点焦点改为：镜头取景容纳全部节点，节点原地不动，相关连线加粗、其他内容按原规则调暗。
- 新增 / 消失的元素才有动画：出现时淡入（连线沿路径画出），消失时淡出；已有元素不动。

### 镜头取景保留上下文
- 图表元素：取景 = 目标 + 最内层父分组；整个分组会让节点小到看不清（主标签 < 16px）时，退到“目标 + 分组标题”。父分组标题一定在画面里。
- 时序图的一行：取景 = 这一行 + 两端参与者的头部（谁在和谁说话）+ 所在片段。
- 界面元素：取景 = 目标 + 最近的有框容器（Card、Paper、Modal、Table、AppShell 侧栏等）；推近不超过 1.25 倍（界面本来按舞台 1:1 设计，推近是为了引导注意力，不是放大细节）。
- 分组框、分组标题、参与者头部不随焦点外调暗。

### 图表类型：做什么、不做什么
| 类型 | 判断 |
| --- | --- |
| 架构 / 关系图（Diagram） | 已有，补分组图标、色调、引用式分组、连到分组、trace 点亮分组。 |
| 时序图（Sequence） | **做**。讲一次调用链最直接；布局是纯函数（列 + 行），不需要 ELK；trace 消息 id，一行一行讲。 |
| 状态机（StateMachine） | **做**。订单 / 任务生命周期；复用 ELK 布局与架构图渲染；`value` 绑定当前状态，值变化时对应转换自动点亮。 |
| C4 上下文 / 容器图 | **不单独做**：就是 Diagram + 系统边界分组（icon="box"）+ 人（kind="user"）+ 外部系统（kind="external"），技能里写写法。 |
| ER 图 | **以后再做**：演示数据通常用 DataCard / Table 单独一层就够；ER 需要字段级端口（ELK 支持），收益不如前两种，先记为下一步。 |

## 5. 体积与限制核对

- web tarball：删掉 dagre 后变小；发布站不打包 ELK（`src/site/core-lite.ts` 只导出图表的纯函数）。`pnpm release:smoke` 检查 6 MB 上限、发布站字体 ≤ 1.5 MB、文件数 ≤ 150。
- 发布站在 CSP `connect-src 'none'` 下工作：布局是 IR 里的数字，不发任何请求。
- 已知限制：文字宽度按字号估算（与渲染字体无关，保证确定）；手写字体下长英文可能略宽，节点标签会截断显示省略号。
