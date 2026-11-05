# Joplo 看板、发布站与截图（T-board）

本文说明 `packages/web`（看板界面、发布站界面、低保真渲染器、演示运行时）和 `packages/server`（`startDev`、`buildSite`、`renderStep`）。接口定义见 `packages/server/src/contract.ts`，CLI 只依赖这三个函数。

## 启动

```bash
pnpm install
pnpm web:serve                          # 用 startDev 打开 examples/invite：http://127.0.0.1:4790/
pnpm web:serve path/to/project --port 4800 --open
```

`joplo dev` / `joplo build` / `joplo render` 由 CLI 调用同一组函数。

## `startDev`：一个进程

一个 Vite 开发服务同时承担三件事：

| 职责 | 做法 |
| --- | --- |
| 看板界面 | Vite root 是 `packages/web`，React + Tailwind，界面本身也支持 HMR。 |
| 项目编译 | 项目源文件用 `server.ssrLoadModule` 载入。插件 `joplo:project` 用 automatic JSX、`jsxImportSource: '@joplo/kit'`、development 模式转译，因此 jsxDEV 能拿到 `文件:行:列`。随后交给 core 的 `loadAuthoring` + `compile(…, 'dev')`。项目里的 `@joplo/kit` 指向本仓库的 kit 源码，所以项目可以放在任何目录。 |
| 热更新 | 项目目录下任何文件变化（`.joplo/`、`dist/`、`node_modules/`、`.git/` 除外）都会使项目模块失效、重新编译，并通过 HMR 自定义事件 `joplo:ir` 把新 IR 推给看板。页面不刷新，保持功能、方案、场景、位置（越界时夹到合法范围）和选中。编译是串行的，编译过程中又有变化时，结束后再编一次。 |

- **Tailwind**：项目目录会追加为 `index.css` 的 `@source`，项目源文件里出现的 `className` 能被编译，并随文件变化热更新。build 同样如此。
- **编译出错**：看板顶部显示错误列表，每条格式为 `文件:行:列 + 说明`。语法错误的位置来自转译器，指向真正出错的文件，可以是被 import 的模块。舞台继续显示上一次成功的画面和当前位置，不会白屏。修好并保存后自动恢复。
- **安全**（沿用 M0）：
  - 只监听 `127.0.0.1`；
  - 每个 HTTP 请求校验 Host（`127.0.0.1:端口` / `localhost:端口`），否则返回 403；
  - 写接口 `PUT /__joplo/selection` 校验 Origin（存在时必须是本服务）、`Content-Type: application/json`、本地令牌 `x-joplo-token`（注入在看板 HTML 的 meta 里），并限制请求体大小。
- **端口**：缺省 4790，被占用时直接报错 `端口 N 已被占用`（strictPort），不静默换端口。传 `port: 0` 使用随机端口（测试用）。

接口：

| 接口 | 说明 |
| --- | --- |
| `GET /__joplo/ir` | `{ version, ok, project, diagnostics, home }`。`project` 始终是最近一次成功的 IR；`ok=false` 表示最近一次编译失败。 |
| `GET /__joplo/selection` | 当前 `.joplo/selection.json`，看板载入时据此恢复选中。 |
| `PUT /__joplo/selection` | 请求体为 `{ selection: { optionId, scenarioId, position, sceneId, nodeId, stepId? } \| null }`。 |

### 选中：`.joplo/selection.json`

内容为 core 的 `Selection` 类型，取消选中时为 `null`。`source` / `at` 的端到端流向：

1. kit 的 jsxDEV / callsite 写入绝对源位置；
2. `compile` 转成相对路径，写到 IR 节点、步骤、规则的 `source`；
3. 渲染器把它写到每个节点根 DOM 的 `data-jat`（同时还有 `data-jid`、`data-jtype`）；
4. 浏览器只提交“选中了谁”。服务端对照当前 IR 校验，并**重新计算** `at`、`label`（优先取 `<Label htmlFor>` 的文字）、`route`、`featureId`、`stepId`，然后原子写入 `.joplo/selection.json`；
5. `joplo selection`（T-cli）读取文件，输出 `文件:行号` 和源码片段。

不变量：每次写接口返回后，界面显示的选中与文件内容一致。

- 写入被拒绝（409，例如场景已变、元素已不存在）时，服务端把文件写成 `null`，并在响应里返回 `current: null`。看板随之清除选中，并提示“选中未能同步给 Agent：…，已取消选中”。这修复了上一轮复审的问题：之前文件保留旧选中，界面却显示新选中。
- 网络失败或令牌错误时，服务端没有写入，看板回滚到上一次确认的选中。
- 热更新后：选中的元素仍在画面里时保留选中；行号或标签变了会重新写入新的 `at`。元素被删除时取消选中并写入 `null`。

## 看板界面（D32 方案 B：模式决定信息量）

**演示模式（默认）**

- **顶栏**：项目名、当前路径（绿点表示热更新已连接）、功能 / 方案 / 场景切换（选定方案带 ✓）、视图切换（演示场景 / 比较方案 / 浏览产品）、缺口胶囊“缺失 N · 待决定 M”、演示 / 审阅模式切换、手绘 / 线框主题、“概念原型”标识。点击缺口胶囊会切到审阅模式，并展开、滚动到情况列表。
- **中间**：大舞台，按比例缩放以尽量占满主体（1600×1000 窗口下约 1.07 倍）。
- **底部**：一行紧凑步骤条，包括重置、上一步、播放 / 暂停、下一步、字幕（或“场景完成 · 结果”）、步骤点、模拟标签。
- 没有侧栏。

**审阅模式**

- **左栏 · 路径树（产品地图）**：列出每个路径上堆叠了哪些功能，每个功能显示涉及的方案。✓ 表示选定，紫色表示正在查看。由方案新增的路径标“由 B 新增”。
  - 点路径会进入浏览视图；
  - 点方案会进入该方案的演示。
- **左栏 · 情况列表**：当前方案的情况与覆盖芯片（缺失、待决定、已表达、不适用、已排除），列出原因，并链接到对应场景。
- **右栏 · 检查器**：
  - 选中元素时：标签、类型、`at`（可一键复制）、来源（布局、页面，或方案 X 的堆叠 / 新增页面）、当前可见与禁用状态、禁用原因、设计说明、关联规则（来源与确认状态）、以它为目标的步骤（点击跳到该步之前）。
  - 选中步骤（点步骤点）时：字幕、`at` 和关联规则。
  - 未选中时：功能目标、约束、方案思路与取舍、规则、待决问题。

**比较方案**：功能页为每个方案列一张卡片，包含舞台缩略图（第一个场景的初始画面）、场景列表（分支）和覆盖芯片。在“按情况比较”里选一个情况，每张卡片会显示这个方案对它的覆盖状态和原因，可以一键“进入场景”。没有场景时按钮禁用。并排双舞台的成本较高，暂未实现（D12）。

**浏览产品**：用发布视图 `@<路径>` 按路径浏览产品现在的样子：每个功能取选定方案，数据合并各方案第一个场景的初始数据。只由未选定方案新增的路径，会退回到该方案的画面，并在标签上说明。浏览视图是静态的，不能播放。

**推进状态**：手动、逐步、自动播放都只通过 core 的 `applyStep` / `stateAt` / `explainClick` 推进，M0 的 `runtime/demo.ts` 继续复用。

- 点击的含义由 `explainClick` 决定：推进、禁用原因、“演示未覆盖”、越序提示。
- 演示模式下，点到按钮里的文字也算点按钮。
- 快捷键：`←` / `→` 逐步，空格播放或暂停。

## 渲染器（`packages/web/src/renderer`）

- 每个目录类型都有一个低保真实现。注册表的类型是 `Record<ComponentType, …>`，漏掉任何类型都会导致类型检查失败。
- 底座用真实的 shadcn 组件。手绘主题叠加 Rough 描边和 Excalifont / 小赖字体，线框主题使用 1px 边框。
- 每个节点的根 DOM 都带 `data-jid` / `data-jtype` / `data-jat`。可操作的节点另带 `data-jinteractive`、`data-jdisabled`、`data-junmodeled`。
- 绑定、可见性、禁用全部由 core 计算：`resolveProps` / `isSelfVisible` / `isNodeDisabled`。Dialog / Sheet / AlertDialog 的门控来自 `GATED_CONTAINERS`。
- 浮层渲染在舞台内部的弹窗层（不 portal 到 body），截图和遮挡检查只看舞台本身。
- 作者的 `className` 原样加到根 DOM，其他属性不透传，链接也不生成真实 href。

> 注意：协调者正在把组件 API 从 shadcn 改为 Mantine。届时 `components.tsx` 的注册表要改成新的目录映射，并按舞台视口宽度解析响应式属性（`base`/`xs`/`sm`/`md`/`lg`/`xl`）和 `visibleFrom` / `hiddenFrom`；AppShell 在 mobile 视口下收起 navbar。见 handoff。

## `buildSite`：静态发布站

1. Vite 以中间件模式（不监听端口）载入项目，执行 `compile(…, 'publish')`，只保留选定方案。这一步已经去掉规则、情况、问题、备注和源路径；`publishPayload` 再去掉约束、角色、取舍、覆盖等创作侧字段（D33）。
2. 对 `packages/web/site.html` 执行 `vite build`（强制 production）。构建时 `@joplo/core` 指向 `site/core-lite.ts`，只打包播放器和目录，不带 zod schema 与编译器。
3. 后处理 HTML：
   - IR 内联为 `<script type="application/json" id="joplo-ir">`（已转义 `<`）；
   - 入口脚本内联为 `<script type="module">`；
   - 去掉 `crossorigin` 和 `modulepreload`。

   这样直接双击 `index.html`（`file://`）也能完全离线运行。CSS 和字体是相对路径的静态文件。
4. 目标目录（缺省 `<项目>/dist`）非空且没有 `overwrite` 时拒绝写入。以下情况永远拒绝：目标是项目目录本身或它的上级、目标在 `.joplo/` 里、目标目录里含有 `joplo.config.ts`。编译失败时不写任何文件，并抛出带诊断的 `EXPORT_FAILED`。

**发布站内容**：

- 左侧是“整体布局”（各路径）和“功能”（功能名，以及选定方案的场景）；
- 右侧是舞台和步骤条，支持手动、逐步、自动播放；
- 功能页显示目标和方案思路；
- 常驻“概念原型 · 非正式实现”；
- 只读，没有审阅和选中。

hash 路由：`#/p/<路径>`、`#/f/<功能>`、`#/s/<场景>`。

**部署**：`npx wrangler deploy --assets ./dist --name <名称> --compatibility-date 2026-11-01`，或上传到任何静态托管。

## `renderStep`：截图

`renderStep` 用随机端口启动一次性的 dev 服务（`watch: false`，只编译一次），Playwright 打开渲染路由 `/?render=1&scenario=…&position=…&theme=…`，然后截取舞台。页面和元素索引来自同一份 IR。

- `scenarioId` / `stepId` 使用 IR 的限定 ID，例如 `invite.a-modal.success` / `invite.a-modal.success#1`；
- `elements[]` 带 `at`；没有渲染出来的节点也会列出，`visible: false`；文本节点不列入；
- 保留 M0 的渲染告警：遮挡、超出画框、文字溢出、Toast 覆盖可交互元素、字体未加载；
- 不覆盖已有文件（需要传 `overwrite`），不能写到项目源文件或 `.joplo/`。

## 测试

- `pnpm vitest run packages/server/test`：
  - dev：编译、Host / Origin / 令牌 / Content-Type 校验、选中写入与 409 时写 null、热更新与语法错误定位、`.joplo/` 变化不触发重新编译、端口占用、非项目目录、空项目；
  - build：缺省输出、拒绝覆盖、危险目标、编译失败、没有 pick；
  - HTML 后处理；
  - renderStep。
- `pnpm test:e2e`（Playwright）：
  - 看板：演示、手动与自动播放的最终状态深度相等、禁用原因、演示未覆盖、方案 B 跨路径跳转；
  - 审阅：selection.json 的 `at`、取消选中写 null；
  - 路径树、缺口胶囊、比较方案、浏览产品；
  - 热更新：不刷新页面、语法错误定位与恢复、选中跟随行号或被清除；
  - 发布站：file:// 和静态服务器都能播放；产物不含 `rules`、`a-modal.tsx`、`b-batch`、`B · 独立页面`、`features/invite`，也没有绝对路径。
- 所有测试都在 `examples/invite` 的临时副本上运行，端口随机。
- `pnpm docs:screenshots` 重新生成 `docs/screenshots/*.png`，这是写入该目录的唯一途径。

## 已知限制

- 发布站约 0.55 MB HTML（内联 JS + IR）加上按需加载的字体子集，字体全部打包在 `assets/`，共约 12 MB。
- 选中恢复只在看板载入时进行一次；多个看板标签页同时打开时，以最后一次写入为准。
- 浏览视图的数据是各选定方案第一个场景初始数据的合并，只用于看整体外观，不代表任何具体场景。
