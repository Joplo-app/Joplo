# ADR-0002：类 Hugo 的创作与发布模型

> 看板布局、组件词汇、演示与设备模型、主题、本地进程及 npm 包结构以 [ADR-0003](0003-demo-model.md) 为准。

- 状态：已采纳（2026-11-05）
- 依据：DECISIONS.md D21–D33；当前演示架构见 ADR-0003

## 决定

1. **文件是权威源**：作者在本地项目里编辑 TS/TSX，Git 管理版本。看板用于查看、比较、检查与选中定位，CLI 用于检查和构建。
2. **路径优先**：基础路径由 routes/ 定义，方案通过 on 往已有插槽堆叠内容，也可通过 routes 新增静态路径。

   | 文件 | 默认导出 | 职责 |
   | --- | --- | --- |
   | joplo.config.ts | config({...}) | 项目名、默认布局、首页、主题 |
   | layouts/id.tsx | layout(tree) | 外壳、Outlet、Slot |
   | routes/path/page.tsx | page(meta, tree) | 文件夹对应页面路径 |
   | features/f/feature.ts | feature({...}) | 目标、情况、规则、问题、pick |
   | features/f/works/o.tsx | work({...}) | 方案、堆叠、状态、层级、场景 |

3. **TSX 收集为数据**：kit 提供 JSX 运行时，jsxImportSource 为 `@joplo-app/kit`，开发转换使用 react-jsxdev 保留源位置。组件名称与属性对齐 Mantine，另有 Joplo 的 Diagram、Terminal、Phone 和 AI 组件。行为写成 flow 步骤，函数属性如 onClick 会被编译器拒绝。
4. **编译为 IR v3**：Node 侧 loadAuthoring 加载作者模块，compile 生成路径画面及独立层级画面；播放器、看板、校验器和发布构建消费相同 IR。
   - dev 模式包含全部方案；每个方案上下文隔离同功能的其他方案，其他功能取选定方案。
   - 情况由场景推导为已表达，显式 coverage 声明优先，其余标记缺失。
   - 节点、步骤、规则的 source 转为项目相对位置，诊断使用 at，选中最终写入 `.joplo/selection.json`。
   - publish 模式只包含 pick 选中的方案，去掉规则、情况、问题、备注和源位置，保留可演示的层级、镜头、trace 与主题。
5. **同一播放器**：手动、逐步、自动播放、回放、截图和视频共享 core 状态转换。后退通过从初始状态重放到目标位置计算。
6. **写与看分离**：本地 Board 服务作者；Published site 是只读静态站，复用演示布局，不包含创作侧信息。命令参数见 [CLI 文档](../cli.md)。

## 执行边界

作者模块在本机加载和构建时执行，复用组件在收集时展开；导入他人项目等同于运行其代码。看板和发布站只消费 IR。规则来源与确认状态由作者文件记录，AI 假设不能自称已确认。

只支持静态路径。MCP、团队协作和评论同步不在当前本地发行版范围内。
