# ADR-0002：类 Hugo 的创作与发布模型

- 状态：已采纳（2026-11-05），部分取代 ADR-0001
- 依据：`DECISIONS.md` D21–D33

## 背景

M0 的创作方式存在三个问题：
- Agent 通过 `joplo apply` 提交 JSON patch。三个方案的 patch 合计 60KB 以上，连协调 Agent 自己都要先写生成脚本，违背了“快、省 token”（D25）。
- 用户希望写与看分离：作者在本地用文件创作，观众打开一个静态站点（D21–D23）。
- 组件应该对齐现有 UI 库（D26）。

## 决定

1. **权威源是项目文件夹里的源文件**，版本交给 Git。
   - 原来的 `project.joplo.json`、apply/patch、锁、回执、修订号全部退役，取代 ADR-0001 第 2、7 条。
   - MCP 放到 V2。
2. **目录约定**（路径优先，D28）：

   | 文件 | 导出 | 说明 |
   | --- | --- | --- |
   | `joplo.config.ts` | `config({...})` | 项目名、默认布局、首页 |
   | `layouts/<id>.tsx` | `layout(<…><Outlet/>…</…>)` | 应用外壳；可以声明 `<Slot name>` |
   | `routes/<path>/page.tsx` | `page({ title }, <…/>)` | 文件夹路径即页面路径 |
   | `features/<f>/feature.ts` | `feature({ name, goal, cases, rules, questions, pick })` | `pick` 是选定的方案，build 只发布它 |
   | `features/<f>/options/<o>.tsx` | `option({ name, idea, on, routes, state, rules, coverage, scenarios })` | `on` 把元素堆叠到已有路径的插槽，`routes` 新增路径 |

   功能目录里的其他 TS 模块（如共用的示例数据、复用组件）可以被自由 import。
3. **TSX 只当数据收集，不当 React 执行**。
   - `@joplo-app/kit` 提供自己的 JSX 运行时：`jsxImportSource: "@joplo-app/kit"`，开发模式用 `react-jsxdev`，以便拿到源位置。
   - 组件从 `@joplo-app/kit/ui` 导入，名称和属性与 Mantine 一致（D35，取代原来的 shadcn/ui）：复合组件用点语法（`AppShell.Header`、`Tabs.Tab`），布局写成属性（`Stack gap`、`SimpleGrid cols={{ base: 1, md: 3 }}`），浮层用 `Modal`/`Drawer` 的 `opened`，数据表对齐 mantine-datatable。另有少量 AI 交互组件（`ChatMessage`、`ToolCall`、`PromptInput`）和设备外框组件（`Terminal` 及其 `Command`/`Output`/`Input`、`Phone`；`Phone` 内部按手机宽度计算断点，舞台对 `viewport: 'mobile'` 的页面自动套上同一个外框，D39）、架构图组件（`Diagram` 及其 `Group`/`Node`/`Edge`，自动布局，state 由 flow 驱动，D41）。运行时不引入 Mantine。
   - Joplo 只追加 `id`、`when`、`disabledReason`、`unmodeled`、`note` 这几个属性。
   - 作者写的函数组件在收集时直接展开。
   - 状态绑定写 `$.ui.x` / `$.data.x` / `$.inputs.x`；条件写 `not / eq / empty / and …`，不允许 eval。
   - 行为写在 `flow(...).click(...).type(...).system(...)` 步骤里。函数类型的属性（如 `onClick`）在编译时报错。
4. **编译**：`@joplo-app/core` 的 `loadAuthoring(dir, importer)` 加 `compile(authoring, 'dev' | 'publish')`，产出 IR v2（`schema.ts`）。
   - 画面 = 布局 + 页面 + 各方案往插槽里堆叠的元素。dev 模式下，每个方案在每个路径上各有一个画面 `<方案>@<路径>`：同一功能的其他方案不出现，其他功能取各自选定的方案。另有发布视图 `@<路径>`。
   - 情况覆盖自动推导：有场景覆盖即为“已表达”；源文件中的声明优先；其余标为“缺失”。新增情况会自动出现缺口（AC-08）。
   - 字幕省略时自动生成，元素名取 Mantine 输入组件的 `label` 属性；select 显示选项的 label。
   - 每个元素、步骤、规则都带 `source: 相对路径:行:列`，诊断带 `at`。
   - publish 模式只含选定方案，并去掉规则、情况、问题、备注和源路径（D33）。
5. **播放器不变**：`player.ts` 仍是唯一的状态转换，手动、逐步、自动播放、回放校验、截图全部共用。
6. **命令**（D30）：
   - `joplo dev`：单进程 Vite 服务，同时服务多个项目（D39），提供看板、按需编译和热更新，选中元素写入对应项目的 `.joplo/selection.json`（类型 `Selection`）；
   - `joplo check`：编译 + 校验 + 回放，每个问题一行，格式为 `文件:行:列  级别  代码  说明`；
   - `joplo selection`：输出当前选中的 `文件:行号` 和该处源码片段；
   - `joplo build`：静态站点；
   - `joplo render`：截图。
   - 接口见 `packages/server/src/contract.ts`。
7. **看板布局**采用 D39（取代 D32 的“演示 / 审阅”双模式）：首页列出本机打开过的项目与功能；演示页顶栏只有面包屑与设备切换，左栏按情况分组并显示缺口，⌥+单击从右侧弹出检查抽屉。一个本机只运行一个看板进程，再次 `joplo dev` 只注册项目。**发布站**用同一套布局，只放演示和说明（D33），并且只读（D23）。

## 后果

- Agent 用它最熟悉的写法（文件 + Mantine）创作，局部修改只碰一个小文件里的几行。示例中两个方案加路径和布局的源文件约 15KB，旧 JSON 一个方案约 28KB。
- 安全边界变化：源文件会在**作者本机构建时执行**，与 Hugo/Astro 的配置文件同级。看板和发布站只消费 IR，不执行作者代码。导入他人项目等同于运行他人的代码仓库。PRD 15.1 中“项目只是数据”的表述需要相应修订。
- 人工确认目前只是源文件里的 `status` 字段，由用户在会话中让 Agent 修改。编译器禁止 AI 假设标为已确认。确认记录与内容哈希绑定，放到后续版本。
- 只支持静态路径，`[id]` 这类动态段暂不支持，编译时报错。
